import type { Request, Response } from 'express';

export function getCurrentUser(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = req.user;
  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    sleepStart: user.sleepStart,
    sleepEnd: user.sleepEnd,
    workStart: user.workStart,
    workEnd: user.workEnd,
    preferredDailyMinutes: user.preferredDailyMinutes,
    profile: (user as any).profile ?? 'adult',
    mealOffsets: {
      breakfast: user.mealPreferences?.breakfastOffset ?? 0,
      lunch: user.mealPreferences?.lunchOffset ?? 0,
      dinner: user.mealPreferences?.dinnerOffset ?? 0
    },
    activityTargetMinutes: (user as any).activityTargetMinutes ?? null,
    modelUpdatedAt: user.model?.updatedAt
  });
}

