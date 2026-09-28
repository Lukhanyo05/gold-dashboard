import { Types } from 'mongoose';

export type TradeDirection = 'Buy' | 'Sell';
export type TradeResult = 'Win' | 'Loss' | 'Breakeven' | 'Manual' | 'Open';
export type TradeSymbol = 'GOLD' | 'ETHUSD';

/**
 * Plain data shapes — used for creating/updating documents.
 * These do NOT extend Document, so they can be passed around freely.
 */

export interface ITrade {
  tradeNumber: number;
  date: Date;
  symbol: TradeSymbol;
  direction: TradeDirection;
  entry: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  closePrice?: number | null;
  lotSize: number;
  swapFee: number;
  balanceBefore: number;
  balanceAfter?: number;
  result?: TradeResult;
  rMultiple?: number;
  notes?: string;
  // Journal / discipline fields
  tags?: string[];
  setup?: string | null;
  followedPlan?: boolean | null;
  mistakes?: string[];
  // Optional chart snapshot for this trade, stored as a data: URI
  // (base64) — small enough to keep in Mongo directly, no external
  // storage needed. Size-capped at upload time.
  screenshot?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlaybook {
  name: string;
  description?: string;
  rules: string[];
  color?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAccount {
  startingBalance: number;
  currentBalance: number;
  targetBalance: number;
  riskPerTrade: number;
  withdrawalRate: number;
  taxRate: number;
  taxReserve: number;
  totalWithdrawn: number;
  totalDeposited: number;
  // Risk guardrails — 0 or null/undefined means "no limit set". Expressed
  // as a fraction of currentBalance (0.05 = 5%), same convention as
  // riskPerTrade, so they read consistently everywhere.
  maxDailyLossPct?: number | null;
  maxWeeklyLossPct?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WithdrawalAllocation = 'Reinvested' | 'Saved' | 'Other';

export interface IWithdrawal {
  date: Date;
  amount: number;
  type: 'Withdrawal' | 'Deposit';
  taxReserve: number;
  notes?: string;
  // Only meaningful for type: 'Withdrawal' — where the money actually went,
  // for a simple treasury/allocation view. Optional so existing rows and
  // deposits don't need one.
  allocation?: WithdrawalAllocation | null;
  createdAt?: Date;
}

export type GoalType = 'Balance' | 'WinRate' | 'ProfitFactor' | 'Custom';

export interface IDailyJournal {
  date: string; // YYYY-MM-DD, one entry per calendar day
  mood: number | null; // 1-5, 1 = worst, 5 = best; null = not rated
  note: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGoal {
  label: string;
  type: GoalType;
  targetValue: number;
  startValue: number;
  targetDate?: Date | null;
  achieved?: boolean;
  achievedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}