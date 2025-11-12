import mongoose, { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { TASK_CATEGORIES } from '@shared/constants.js';
import type { TaskCategory } from '@shared/types.js';

interface TaskTemplate {
  title: string;
  defaultMinutes: number;
  defaultPriority: number;
  category: TaskCategory;
}

export interface CatalogAttributes {
  userId: Types.ObjectId;
  taskTemplate: TaskTemplate;
  lastUsedAt: Date;
  uses: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CatalogDocument = HydratedDocument<CatalogAttributes>;

const CatalogSchema = new Schema<CatalogAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    taskTemplate: {
      title: { type: String, required: true },
      defaultMinutes: { type: Number, required: true },
      defaultPriority: { type: Number, required: true },
      category: {
        type: String,
        enum: TASK_CATEGORIES,
        default: 'Other'
      }
    },
    lastUsedAt: { type: Date, default: Date.now },
    uses: { type: Number, default: 0 }
  },
  { timestamps: true },
);

CatalogSchema.index({ userId: 1, 'taskTemplate.title': 1 }, { unique: true });

export const CatalogModel =
  mongoose.models.Catalog ?? model<CatalogAttributes>('Catalog', CatalogSchema);

