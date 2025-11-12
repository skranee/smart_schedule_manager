import mongoose, { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface PlanSlot {
  start: Date;
  end: Date;
  taskId: string; // Может быть как ObjectId, так и строка (например, 'auto-meal-breakfast')
  title: string;
  score: number;
  featuresSnapshot: number[];
  category: string;
  reasoningText?: string;
}

export interface PlanAttributes {
  userId: Types.ObjectId;
  date: Date;
  slots: PlanSlot[];
  createdAt: Date;
}

export type PlanDocument = HydratedDocument<PlanAttributes>;

const PlanSchema = new Schema<PlanAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
    slots: [
      {
        start: { type: Date, required: true },
        end: { type: Date, required: true },
        taskId: { type: String, required: true }, // String вместо ObjectId для поддержки автоматических задач
        title: { type: String, required: true },
        score: { type: Number, required: true },
        featuresSnapshot: { type: [Number], default: [] },
        category: { type: String, required: true },
        reasoningText: { type: String }
      }
    ]
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PlanSchema.index({ userId: 1, date: 1 }, { unique: true });

export const PlanModel =
  mongoose.models.Plan ?? model<PlanAttributes>('Plan', PlanSchema);

