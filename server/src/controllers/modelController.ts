import type { Request, Response } from 'express';
import { buildDefaultWeights } from '@shared/index.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const getModelWeights = asyncHandler(async (req: Request, res: Response) => {
  const userModelState = (req.user as any).model as
    | { weights: number[]; updatedAt?: Date }
    | undefined;
  const weights = userModelState?.weights ?? buildDefaultWeights();
  res.json({
    weights,
    updatedAt: userModelState?.updatedAt ?? null
  });
});

export const resetModelWeights = asyncHandler(async (req: Request, res: Response) => {
  (req.user as any).model = {
    weights: buildDefaultWeights(),
    updatedAt: new Date()
  };
  await req.user!.save();
  res.json({
    weights: (req.user as any).model.weights,
    updatedAt: (req.user as any).model.updatedAt
  });
});

