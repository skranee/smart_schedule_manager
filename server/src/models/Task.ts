import mongoose, { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { TASK_CATEGORIES } from '@shared/constants.js';
import type { MealType, TaskCategory } from '@shared/types.js';

interface ITaskAI {
  label: TaskCategory;
  confidence: number;
  provider: string;
}

export interface TaskAttributes {
  userId: Types.ObjectId;
  title: string;
  description?: string;
  estimatedMinutes: number;
  priority: number;
  deadline?: Date;
  scheduledDate?: Date;
  fixedTime?: {
    start: Date;
  };
  mealType?: MealType;
  category: TaskCategory;
  ai?: ITaskAI;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<TaskAttributes>;

const TaskSchema = new Schema<TaskAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    estimatedMinutes: { type: Number, required: true, min: 5 },
    priority: { type: Number, default: 0.5, min: 0, max: 1 },
    deadline: { type: Date },
    scheduledDate: { type: Date, index: true },
    fixedTime: {
      start: { type: Date }
    },
    mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner'] },
    category: {
      type: String,
      enum: TASK_CATEGORIES,
      default: 'Other'
    },
    ai: {
      label: { type: String },
      confidence: { type: Number },
      provider: { type: String }
    },
    archived: { type: Boolean, default: false }
  },
  { timestamps: true },
);

TaskSchema.index({ userId: 1, archived: 1 });
TaskSchema.index({ userId: 1, category: 1 });

export const TaskModel =
  mongoose.models.Task ?? model<TaskAttributes>('Task', TaskSchema);

