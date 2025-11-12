export type LocaleCode = 'ru';

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type TaskCategory =
  | 'Healthcare'
  | 'Sport activity'
  | 'Deep work'
  | 'Admin/Errands'
  | 'Learning'
  | 'Social'
  | 'Household'
  | 'Creative'
  | 'Relaxing'
  | 'Games'
  | 'Outdoor Play'
  | 'Commute'
  | 'Other';

export type UserProfileKind = 'adult' | 'child-school-age';

export interface MealOffsets {
  breakfast?: number;
  lunch?: number;
  dinner?: number;
}

export interface UserModel {
  weights: number[];
  updatedAt: Date;
  version?: number;
}

export interface UserSettings {
  sleepStart: string; // ISO time string (HH:mm)
  sleepEnd: string;
  workStart: string;
  workEnd: string;
  locale: LocaleCode;
  preferredDailyMinutes?: number;
  mealOffsets?: MealOffsets;
  activityTargetMinutes?: number;
  profile?: UserProfileKind;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  profile: UserProfileKind;
  settings: UserSettings;
  model: UserModel;
}

export interface TaskBase {
  title: string;
  description?: string;
  estimatedMinutes: number;
  priority: number; // 0..1
  deadline?: string;
  scheduledDate?: string; // ISO date string for which day this task is planned
  fixedTime?: {
    start: string;
  };
  mealType?: MealType;
  category: TaskCategory;
}

export interface TaskRecord extends TaskBase {
  id: string;
  userId: string;
  archived?: boolean;
  ai?: {
    label: TaskCategory;
    confidence: number;
    provider: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CatalogEntry {
  id: string;
  userId: string;
  taskTemplate: Pick<TaskBase, 'title' | 'estimatedMinutes' | 'priority' | 'category'>;
  lastUsedAt: string;
  uses: number;
}

export interface ScheduleSlot {
  start: string; // ISO string
  end: string;
  taskId: string;
  title: string;
  score: number;
  featuresSnapshot: number[];
  reasoningText?: string;
  category: TaskCategory;
}

export interface PlanRecord {
  id: string;
  userId: string;
  date: string;
  slots: ScheduleSlot[];
  createdAt: string;
}

export type FeedbackLabel = 0 | 1;

export interface FeedbackEntry {
  id: string;
  userId: string;
  taskId: string;
  planId: string;
  slot: {
    start: string;
    end: string;
  };
  label: FeedbackLabel;
  source: 'kept' | 'moved' | 'thumbs';
  note?: string;
  createdAt: string;
}

export interface FeatureVectorResult {
  vector: number[];
  metadata: Record<string, number>;
}

export interface ScheduledTaskSegment {
  taskId: string;
  title: string;
  start: string;
  end: string;
  score: number;
  featuresSnapshot: number[];
  explanation: string;
  category: TaskCategory;
}

export interface ScheduleRequest {
  date: string;
  tasks: TaskRecord[];
}

export interface ScheduleResponse {
  plan: {
    date: string;
    slots: ScheduledTaskSegment[];
  };
  reasoning: Record<string, string>;
}

