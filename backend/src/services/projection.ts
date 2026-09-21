export interface ProjectionInput {
  currentBalance: number;
  monthlyPnL: number;
  withdrawalRate: number;
  targetBalance?: number;
}

export interface ProjectionMonth {
  month: number;
  start: number;
  pnl: number;
  withdrawal: number;
  end: number;
}

export interface ProjectionResult {
  monthsToTarget: number | null;
  yearsToTarget: number | null;
  effectiveMonthlyRate: number;
  schedule: ProjectionMonth[];
  totalWithdrawn: number;
}

export function projectGrowth(input: ProjectionInput): ProjectionResult {
  const {
    currentBalance,
    monthlyPnL,
    withdrawalRate,
    targetBalance = 1_000_000,
  } = input;

  if (monthlyPnL <= 0 || currentBalance <= 0) {
    return {
      monthsToTarget: null,
      yearsToTarget: null,
      effectiveMonthlyRate: 0,
      schedule: [],
      totalWithdrawn: 0,
    };
  }

  const withdrawal = monthlyPnL * withdrawalRate;
  const compounded = monthlyPnL - withdrawal;
  const effectiveRate = compounded / currentBalance;

  let balance = currentBalance;
  let month = 0;
  const schedule: ProjectionMonth[] = [];
  let totalWithdrawn = 0;

  while (balance < targetBalance && month < 1200) {
    month += 1;
    const start = balance;
    const end = start + compounded;
    schedule.push({
      month,
      start: round2(start),
      pnl: round2(monthlyPnL),
      withdrawal: round2(withdrawal),
      end: round2(end),
    });
    balance = end;
    totalWithdrawn += withdrawal;
  }

  return {
    monthsToTarget: month,
    yearsToTarget: round2(month / 12),
    effectiveMonthlyRate: round4(effectiveRate),
    schedule,
    totalWithdrawn: round2(totalWithdrawn),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;