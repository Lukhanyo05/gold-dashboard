import { Schema, model, HydratedDocument } from 'mongoose';
import { IWithdrawal } from '../types';

export type WithdrawalDocument = HydratedDocument<IWithdrawal>;

const WithdrawalSchema = new Schema<IWithdrawal>(
  {
    date: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true, min: 0 },
    type: {
      type: String,
      enum: ['Withdrawal', 'Deposit'],
      required: true,
    },
    taxReserve: { type: Number, default: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

export const Withdrawal = model<IWithdrawal>('Withdrawal', WithdrawalSchema);