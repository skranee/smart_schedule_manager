import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { TaskModel, CatalogModel } from '../models/index.js';
import { getAIProvider } from '../ai/index.js';
import { taskInputSchema } from '../utils/validators.js';
import { serializeTask } from '../utils/serializers.js';

function toDate(value?: string) {
  return value ? new Date(value) : undefined;
}

export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const showArchived = req.query.archived === 'true';
  const filter: Record<string, unknown> = { userId: req.user!._id };
  if (!showArchived) {
    filter.archived = false;
  }
  const tasks = await TaskModel.find(filter)
    .sort({ createdAt: -1 })
    .exec();

  res.json(tasks.map(serializeTask));
});

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const parsed = taskInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid task payload',
      issues: parsed.error.issues
    });
    return;
  }

  const payload = parsed.data;
  const aiProvider = getAIProvider();
  let aiResult;
  try {
    aiResult = await aiProvider.categorize({
      title: payload.title,
      description: payload.description
    });
  } catch (error) {
    aiResult = {
      label: payload.category ?? 'Other',
      confidence: 0,
      provider: 'fallback'
    };
  }

  const category = payload.category ?? aiResult.label ?? 'Other';

  try {
    const task = await TaskModel.create({
      userId: req.user!._id,
      title: payload.title,
      description: payload.description,
      estimatedMinutes: payload.estimatedMinutes,
      priority: payload.priority,
      deadline: toDate(payload.deadline),
      scheduledDate: toDate(payload.scheduledDate),
      fixedTime: payload.fixedTime
        ? {
            start: new Date(payload.fixedTime.start)
          }
        : undefined,
      mealType: payload.mealType,
      category,
      ai: aiResult
    });

    await CatalogModel.findOneAndUpdate(
      { userId: req.user!._id, 'taskTemplate.title': task.title },
      {
        $set: {
          userId: req.user!._id,
          taskTemplate: {
            title: task.title,
            defaultMinutes: task.estimatedMinutes,
            defaultPriority: task.priority,
            category: task.category
          },
          lastUsedAt: new Date()
        },
        $inc: { uses: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();

    res.status(201).json(serializeTask(task));
  } catch (error) {
    console.error('Failed to create task', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const parsed = taskInputSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid task payload',
      issues: parsed.error.issues
    });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.deadline) updates.deadline = new Date(parsed.data.deadline);
  if (parsed.data.scheduledDate) updates.scheduledDate = new Date(parsed.data.scheduledDate);
  if (parsed.data.fixedTime) {
    updates.fixedTime = { start: new Date(parsed.data.fixedTime.start) };
  }
  if (Object.prototype.hasOwnProperty.call(parsed.data, 'mealType')) {
    updates.mealType = parsed.data.mealType ?? undefined;
  }

  const task = await TaskModel.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!._id },
    updates,
    { new: true },
  ).exec();

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json(serializeTask(task));
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await TaskModel.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!._id },
    { archived: true },
    { new: true },
  ).exec();

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.status(204).send();
});

