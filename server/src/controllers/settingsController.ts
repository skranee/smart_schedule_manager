import type { Request, Response } from 'express';
import { updateSettingsSchema } from '../utils/validators.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateSettingsSchema.parse(req.body);
  req.user!.sleepStart = parsed.sleepStart;
  req.user!.sleepEnd = parsed.sleepEnd;
  req.user!.workStart = parsed.workStart;
  req.user!.workEnd = parsed.workEnd;
  req.user!.preferredDailyMinutes = parsed.preferredDailyMinutes;
  req.user!.locale = parsed.locale;
  if (parsed.profile) {
    (req.user as any).profile = parsed.profile;
  }
  if (parsed.mealOffsets) {
    (req.user as any).mealPreferences = {
      breakfastOffset: parsed.mealOffsets.breakfast ?? req.user!.mealPreferences?.breakfastOffset ?? 0,
      lunchOffset: parsed.mealOffsets.lunch ?? req.user!.mealPreferences?.lunchOffset ?? 0,
      dinnerOffset: parsed.mealOffsets.dinner ?? req.user!.mealPreferences?.dinnerOffset ?? 0
    };
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'activityTargetMinutes')) {
    (req.user as any).activityTargetMinutes =
      parsed.activityTargetMinutes ?? undefined;
  }
  await req.user!.save();

  res.json({
    sleepStart: req.user!.sleepStart,
    sleepEnd: req.user!.sleepEnd,
    workStart: req.user!.workStart,
    workEnd: req.user!.workEnd,
    preferredDailyMinutes: req.user!.preferredDailyMinutes,
    locale: req.user!.locale,
    profile: (req.user as any).profile ?? 'adult',
    mealOffsets: {
      breakfast: req.user!.mealPreferences?.breakfastOffset ?? 0,
      lunch: req.user!.mealPreferences?.lunchOffset ?? 0,
      dinner: req.user!.mealPreferences?.dinnerOffset ?? 0
    },
    activityTargetMinutes: (req.user as any).activityTargetMinutes ?? null
  });
});

