import type { Types } from 'mongoose';
import type { TaskAttributes, TaskDocument } from '../models/Task.js';
import type { CatalogAttributes, CatalogDocument } from '../models/Catalog.js';
import type { PlanAttributes, PlanDocument } from '../models/Plan.js';
import type { TaskCategory } from '@shared/types.js';

function toPlain<T>(doc: T | { toObject?: (options?: unknown) => any }): any {
  if (!doc) return doc;
  if (typeof (doc as any).toObject === 'function') {
    return (doc as any).toObject({ virtuals: true });
  }
  return doc;
}

function toId(value: Types.ObjectId | string | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.toString();
}

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.valueOf())) return undefined;
  return date.toISOString();
}

export function serializeTask(
  task: TaskDocument | (TaskAttributes & { _id: Types.ObjectId }),
) {
  const plain = toPlain(task) as TaskAttributes & { _id: Types.ObjectId };
  return {
    id: toId((plain as any)._id),
    userId: toId(plain.userId),
    title: plain.title,
    description: plain.description ?? undefined,
    estimatedMinutes: plain.estimatedMinutes,
    priority: plain.priority,
    deadline: toIso(plain.deadline),
    scheduledDate: toIso(plain.scheduledDate),
    fixedTime:
      plain.fixedTime && plain.fixedTime.start
        ? {
            start: toIso(plain.fixedTime.start)!,
          }
        : undefined,
    mealType: plain.mealType ?? undefined,
    category: plain.category,
    ai: plain.ai
      ? {
          label: plain.ai.label,
          confidence: plain.ai.confidence ?? 0,
          provider: plain.ai.provider ?? 'unknown',
        }
      : undefined,
    archived: plain.archived ?? false,
    createdAt: toIso((plain as any).createdAt) ?? new Date().toISOString(),
    updatedAt: toIso((plain as any).updatedAt) ?? new Date().toISOString(),
  };
}

export function serializeCatalogEntry(
  entry: CatalogDocument | (CatalogAttributes & { _id: Types.ObjectId }),
): {
  id: string | undefined;
  userId: string | undefined;
  taskTemplate: {
    title: string;
    defaultMinutes: number;
    defaultPriority: number;
    category: TaskCategory;
  };
  lastUsedAt: string;
  uses: number;
  createdAt: string;
  updatedAt: string;
} {
  const plain = toPlain(entry) as CatalogAttributes & { _id: Types.ObjectId };
  return {
    id: toId((plain as any)._id),
    userId: toId(plain.userId),
    taskTemplate: plain.taskTemplate,
    lastUsedAt: toIso(plain.lastUsedAt) ?? new Date().toISOString(),
    uses: plain.uses ?? 0,
    createdAt: toIso((plain as any).createdAt) ?? new Date().toISOString(),
    updatedAt: toIso((plain as any).updatedAt) ?? new Date().toISOString(),
  };
}

export function serializePlan(
  plan: PlanDocument | (PlanAttributes & { _id: Types.ObjectId }) | null,
) {
  if (!plan) return null;
  const plain = toPlain(plan) as PlanAttributes & { _id: Types.ObjectId };
  return {
    id: toId((plain as any)._id),
    userId: toId(plain.userId),
    date: toIso(plain.date)!,
    createdAt: toIso((plain as any).createdAt) ?? new Date().toISOString(),
    slots: plain.slots.map((slot) => ({
      start: toIso(slot.start)!,
      end: toIso(slot.end)!,
      taskId: toId(slot.taskId)!,
      title: slot.title,
      score: slot.score,
      featuresSnapshot: slot.featuresSnapshot ?? [],
      category: slot.category,
      reasoningText: slot.reasoningText ?? undefined,
    })),
  };
}

