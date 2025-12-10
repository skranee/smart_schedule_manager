import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  scheduleRequestSchema,
  feedbackRequestSchema,
  applyEditsSchema
} from '../utils/validators.js';
import { calculateSchedule, getPlanForDate } from '../services/scheduleService.js';
import { FeedbackModel, PlanModel, type PlanSlot } from '../models/index.js';
import { applyFeedbackUpdates } from '../services/modelService.js';

export const getPlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const date = req.query.date as string;
  if (!date) {
    res.status(400).json({ error: 'Date parameter is required' });
    return;
  }

  const scheduleDate = new Date(date);
  scheduleDate.setUTCHours(0, 0, 0, 0);
  const normalizedIso = scheduleDate.toISOString();

  // Сначала пытаемся загрузить план из БД
  const existingPlan = await getPlanForDate(req.user!, normalizedIso);
  
  if (existingPlan) {
    res.json({
      plan: existingPlan.plan,
      slots: existingPlan.slots,
      reasoning: existingPlan.reasoning,
      warnings: existingPlan.warnings
    });
    return;
  }

  // Если плана нет, рассчитываем новый
  const result = await calculateSchedule(req.user!, normalizedIso);
  
  res.json({
    plan: result.plan,
    slots: result.slots,
    reasoning: result.reasoning,
    warnings: result.warnings
  });
});

export const calculateScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = scheduleRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues
    });
    return;
  }

  const scheduleDate = new Date(parsed.data.date);
  scheduleDate.setUTCHours(0, 0, 0, 0);
  const normalizedIso = scheduleDate.toISOString();

  // Всегда пересчитываем (force recalculation)
  const result = await calculateSchedule(req.user!, normalizedIso, parsed.data.taskIds);

  res.json({
    plan: result.plan,
    slots: result.slots,
    reasoning: result.reasoning,
    warnings: result.warnings
  });
});

export const submitFeedback = asyncHandler(async (req: Request, res: Response) => {
  const parsed = feedbackRequestSchema.parse(req.body);
  const plan = await PlanModel.findOne({ _id: parsed.planId, userId: req.user!._id }).exec();

  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  const updates: { features: number[]; label: 0 | 1 }[] = [];

  for (const entry of parsed.entries) {
    const slot = plan.slots.find(
      (candidate: PlanSlot) =>
        candidate.taskId.toString() === entry.taskId &&
        new Date(candidate.start).toISOString() === entry.slot.start &&
        new Date(candidate.end).toISOString() === entry.slot.end,
    );
    if (!slot) continue;

    updates.push({
      features: slot.featuresSnapshot,
      label: entry.label
    });

    await FeedbackModel.create({
      userId: req.user!._id,
      taskId: entry.taskId,
      planId: plan.id,
      slot: {
        start: new Date(entry.slot.start),
        end: new Date(entry.slot.end)
      },
      label: entry.label,
      source: entry.source,
      note: entry.note
    });
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No matching slots found for feedback' });
    return;
  }

  const updatedUser = await applyFeedbackUpdates(req.user!, updates);

  res.json({
    weights: updatedUser.model.weights,
    updatedAt: updatedUser.model.updatedAt
  });
});

export const applyEdits = asyncHandler(async (req: Request, res: Response) => {
  const parsed = applyEditsSchema.parse(req.body);
  const plan = await PlanModel.findOne({ _id: parsed.planId, userId: req.user!._id }).exec();
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  const positives: { features: number[]; label: 0 | 1 }[] = [];

  for (const patch of parsed.patches) {
    const slot = plan.slots.find((candidate: PlanSlot) => candidate.taskId.toString() === patch.taskId);
    if (slot) {
      positives.push({
        features: slot.featuresSnapshot,
        label: 1
      });
    }
  }

  if (positives.length > 0) {
    await applyFeedbackUpdates(req.user!, positives);
  }

  res.json({ status: 'ok' });
});

