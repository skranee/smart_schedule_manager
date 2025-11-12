import mongoose, { Schema, model, type HydratedDocument } from 'mongoose';
import { MODEL_VERSION, MEAL_OFFSET_LIMIT_MINUTES } from '@shared/constants.js';
import type { LocaleCode, UserProfileKind } from '@shared/types.js';

interface IUserModelAttributes {
  googleId: string;
  email: string;
  name?: string;
  locale: LocaleCode;
  sleepStart: string;
  sleepEnd: string;
  workStart: string;
  workEnd: string;
  preferredDailyMinutes: number;
  profile: UserProfileKind;
  mealPreferences?: {
    breakfastOffset?: number;
    lunchOffset?: number;
    dinnerOffset?: number;
  };
  activityTargetMinutes?: number;
  model: {
    weights: number[];
    updatedAt: Date;
    version?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUserModelAttributes>;

const boundedOffset = {
  type: Number,
  min: -MEAL_OFFSET_LIMIT_MINUTES,
  max: MEAL_OFFSET_LIMIT_MINUTES,
  default: 0
};

const userSchema = new Schema<IUserModelAttributes>(
  {
    googleId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true },
    name: { type: String },
    locale: { type: String, enum: ['ru'], default: 'ru' },
    sleepStart: { type: String, default: '23:00' },
    sleepEnd: { type: String, default: '07:00' },
    workStart: { type: String, default: '09:00' },
    workEnd: { type: String, default: '17:00' },
    preferredDailyMinutes: { type: Number, default: 8 * 60 },
    profile: { type: String, enum: ['adult', 'child-school-age'], default: 'adult' },
    mealPreferences: {
      breakfastOffset: boundedOffset,
      lunchOffset: boundedOffset,
      dinnerOffset: boundedOffset
    },
    activityTargetMinutes: { type: Number },
    model: {
      weights: { type: [Number], default: [] },
      updatedAt: { type: Date, default: Date.now },
      version: { type: Number, default: MODEL_VERSION }
    }
  },
  {
    timestamps: true
  },
);

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  return obj as IUserModelAttributes;
};

export const UserModel =
  mongoose.models.User ?? model<IUserModelAttributes>('User', userSchema);

