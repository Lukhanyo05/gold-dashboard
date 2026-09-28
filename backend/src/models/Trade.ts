import { Schema, model, HydratedDocument } from 'mongoose';
import { ITrade } from '../types';

export type TradeDocument = HydratedDocument<ITrade>;

const TradeSchema = new Schema<ITrade>(
  {
    tradeNumber: { type: Number, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },
    symbol: { type: String, enum: ['GOLD', 'ETHUSD'], required: true, default: 'GOLD' },
    direction: { type: String, enum: ['Buy', 'Sell'], required: true },
    entry: { type: Number, required: true },
    stopLoss: { type: Number, default: null },
    takeProfit: { type: Number, default: null },
    closePrice: { type: Number, default: null },
    lotSize: { type: Number, required: true, min: 0.01 },
    swapFee: { type: Number, default: 0 },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number },
    result: {
      type: String,
      enum: ['Win', 'Loss', 'Breakeven', 'Manual', 'Open'],
      default: 'Open',
    },
    rMultiple: { type: Number },
    notes: { type: String, trim: true, maxlength: 2000 },
    tags: { type: [String], default: [] },
    setup: { type: String, trim: true, maxlength: 100, default: null },
    followedPlan: { type: Boolean, default: null },
    mistakes: { type: [String], default: [] },
    screenshot: { type: String, default: null },
  },
  { timestamps: true }
);

TradeSchema.index({ date: -1 });
TradeSchema.index({ symbol: 1, date: -1 });
TradeSchema.index({ tags: 1 });
TradeSchema.index({ setup: 1 });

export const Trade = model<ITrade>('Trade', TradeSchema);