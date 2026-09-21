import { Schema, model, HydratedDocument } from 'mongoose';
import { IAccount } from '../types';

export type AccountDocument = HydratedDocument<IAccount>;

const AccountSchema = new Schema<IAccount>(
  {
    startingBalance: { type: Number, required: true, default: 285 },
    currentBalance: { type: Number, required: true, default: 285 },
    targetBalance: { type: Number, default: 1_000_000 },
    riskPerTrade: { type: Number, default: 0.10, min: 0, max: 1 },
    withdrawalRate: { type: Number, default: 0.30, min: 0, max: 1 },
    taxRate: { type: Number, default: 0.41, min: 0, max: 1 },
    taxReserve: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    totalDeposited: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Account = model<IAccount>('Account', AccountSchema);