import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { CatalogModel } from '../models/index.js';
import { TASK_CATEGORIES } from '@shared/constants.js';
import type { TaskCategory } from '@shared/types.js';
import { serializeCatalogEntry } from '../utils/serializers.js';

const CATEGORY_VALUES = TASK_CATEGORIES as [TaskCategory, ...TaskCategory[]];

const catalogSchema = z.object({
  title: z.string().trim().min(1),
  defaultMinutes: z.number().int().min(5).max(24 * 60),
  defaultPriority: z.number().min(0).max(1),
  category: z.enum(CATEGORY_VALUES)
});

export const listCatalog = asyncHandler(async (req: Request, res: Response) => {
  const entries = await CatalogModel.find({ userId: req.user!._id })
    .sort({ uses: -1, updatedAt: -1 })
    .exec();
  res.json(entries.map(serializeCatalogEntry));
});

export const createCatalogEntry = asyncHandler(async (req: Request, res: Response) => {
  const parsed = catalogSchema.parse(req.body);
  const entry = await CatalogModel.findOneAndUpdate(
    { userId: req.user!._id, 'taskTemplate.title': parsed.title },
    {
      $set: {
        userId: req.user!._id,
        taskTemplate: parsed,
        lastUsedAt: new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
  res.status(201).json(serializeCatalogEntry(entry));
});

