export interface LotSizingInput {
  balance: number;
  riskPercent: number;
  stopLossPoints: number; // $ distance on gold (e.g. 20 = $20 move)
}

export interface LotSizingResult {
  lot: number;
  riskedUSD: number;
  dollarPerPoint: number;
  contractSize: number;
  pointsPerDollar: number;
}

const XAUUSD_CONTRACT_SIZE = 100;

export function calculateLotSize(input: LotSizingInput): LotSizingResult {
  const { balance, riskPercent, stopLossPoints } = input;

  const riskedUSD = balance * riskPercent;
  const rawLot = riskedUSD / (stopLossPoints * XAUUSD_CONTRACT_SIZE);
  const lot = Math.max(0.01, Math.round(rawLot * 100) / 100);

  const dollarPerPoint = lot * XAUUSD_CONTRACT_SIZE;

  return {
    lot,
    riskedUSD,
    dollarPerPoint,
    contractSize: XAUUSD_CONTRACT_SIZE,
    pointsPerDollar: dollarPerPoint,
  };
}

export function calculatePnL(
  direction: 'Buy' | 'Sell',
  entry: number,
  close: number,
  lot: number
): number {
  const diff = direction === 'Buy' ? close - entry : entry - close;
  return diff * lot * XAUUSD_CONTRACT_SIZE;
}

export function calculateRMultiple(pnl: number, riskedUSD: number): number {
  if (riskedUSD === 0) return 0;
  return Math.round((pnl / riskedUSD) * 100) / 100;
}