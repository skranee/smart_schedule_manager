import { z } from 'zod';
import { MEAL_OFFSET_LIMIT_MINUTES, TASK_CATEGORIES } from '@shared/constants.js';
import type { TaskCategory } from '@shared/types.js';

const CATEGORY_VALUES = TASK_CATEGORIES as [TaskCategory, ...TaskCategory[]];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;

const mealOffset = z
  .number()
  .int()
  .min(-MEAL_OFFSET_LIMIT_MINUTES)
  .max(MEAL_OFFSET_LIMIT_MINUTES);

const mealOffsetsSchema = z
  .object({
    breakfast: mealOffset.optional(),
    lunch: mealOffset.optional(),
    dinner: mealOffset.optional()
  })
  .partial();

export const taskInputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  estimatedMinutes: z.number().int().min(5).max(24 * 60),
  priority: z.number().min(0).max(1),
  deadline: z.string().datetime().optional(),
  scheduledDate: z.string().optional().refine((val) => {
    if (!val) return true;
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, { message: 'Invalid date format' }),
  fixedTime: z
    .object({
      start: z.string().datetime()
    })
    .optional(),
  mealType: z.enum(MEAL_TYPES).optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  archived: z.boolean().optional()
});

export const scheduleRequestSchema = z.object({
  date: z.preprocess((value) => {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.valueOf())) {
        return parsed;
      }
    }
    return undefined;
  }, z.date()),
  taskIds: z.array(z.string()).optional()
});

export const feedbackEntrySchema = z.object({
  taskId: z.string(),
  slot: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }),
  label: z.union([z.literal(0), z.literal(1)]),
  note: z.string().optional(),
  source: z.enum(['kept', 'moved', 'thumbs'])
});

export const feedbackRequestSchema = z.object({
  planId: z.string(),
  entries: z.array(feedbackEntrySchema)
});

export const editPatchSchema = z.object({
  taskId: z.string(),
  from: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }),
  to: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  })
});

export const applyEditsSchema = z.object({
  planId: z.string(),
  patches: z.array(editPatchSchema)
});

export const updateSettingsSchema = z.object({
  sleepStart: z.string().regex(/^\d{2}:\d{2}$/),
  sleepEnd: z.string().regex(/^\d{2}:\d{2}$/),
  workStart: z.string().regex(/^\d{2}:\d{2}$/),
  workEnd: z.string().regex(/^\d{2}:\d{2}$/),
  preferredDailyMinutes: z.number().int().min(60).max(24 * 60),
  locale: z.enum(['ru']),
  profile: z.enum(['adult', 'child-school-age']).optional(),
  mealOffsets: mealOffsetsSchema.optional(),
  activityTargetMinutes: z.number().int().min(0).max(6 * 60).optional()
});

