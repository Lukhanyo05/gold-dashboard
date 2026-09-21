import { Types } from 'mongoose';

export type TradeDirection = 'Buy' | 'Sell';
export type TradeResult = 'Win' | 'Loss' | 'Breakeven' | 'Manual' | 'Open';

/**
 * Plain data shapes — used for creating/updating documents.
 * These do NOT extend Document, so they can be passed around freely.
 */

export interface ITrade {
  tradeNumber: number;
  date: Date;
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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWithdrawal {
  date: Date;
  amount: number;
  type: 'Withdrawal' | 'Deposit';
  taxReserve: number;
  notes?: string;
  createdAt?: Date;
}