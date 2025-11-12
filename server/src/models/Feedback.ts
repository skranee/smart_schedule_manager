import mongoose, { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface FeedbackAttributes {
  userId: Types.ObjectId;
  taskId: Types.ObjectId;
  planId: Types.ObjectId;
  slot: {
    start: Date;
    end: Date;
  };
  label: 0 | 1;
  source: 'kept' | 'moved' | 'thumbs';
  note?: string;
  createdAt: Date;
}

export type FeedbackDocument = HydratedDocument<FeedbackAttributes>;

const FeedbackSchema = new Schema<FeedbackAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    slot: {
      start: { type: Date, required: true },
      end: { type: Date, required: true }
    },
    label: { type: Number, enum: [0, 1], required: true },
    source: { type: String, enum: ['kept', 'moved', 'thumbs'], required: true },
    note: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

FeedbackSchema.index({ userId: 1, taskId: 1, createdAt: -1 });

export const FeedbackModel =
  mongoose.models.Feedback ?? model<FeedbackAttributes>('Feedback', FeedbackSchema);

