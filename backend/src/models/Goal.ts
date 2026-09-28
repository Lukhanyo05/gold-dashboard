import { Schema, model, HydratedDocument } from 'mongoose';
import { IGoal } from '../types';

export type GoalDocument = HydratedDocument<IGoal>;

const GoalSchema = new Schema<IGoal>(
  {
    label: { type: String, required: true, trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: ['Balance', 'WinRate', 'ProfitFactor', 'Custom'],
      required: true,
      default: 'Custom',
    },
    targetValue: { type: Number, required: true },
    // Snapshot of the relevant metric at the moment the goal was created,
    // so progress can be shown as "how far since you set this goal"
    // rather than from zero.
    startValue: { type: Number, required: true, default: 0 },
    targetDate: { type: Date, default: null },
    achieved: { type: Boolean, default: false },
    achievedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Goal = model<IGoal>('Goal', GoalSchema);
