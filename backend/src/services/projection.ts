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

  // monthlyPnL is treated as the return earned on the CURRENT balance (the
  // rate you're actually achieving right now), and that rate is held
  // constant going forward so the account genuinely compounds. Treating it
  // as a fixed dollar amount added every month (the previous behavior) is
  // linear growth, not compounding — for a small starting balance that
  // produces absurd results (hundreds or thousands of years to reach a
  // six/seven-figure target) because the monthly addition never grows with
  // the balance the way real trading profit does.
  const monthlyReturnRate = monthlyPnL / currentBalance;

  let balance = currentBalance;
  let month = 0;
  const schedule: ProjectionMonth[] = [];
  let totalWithdrawn = 0;

  while (balance < targetBalance && month < 1200) {
    month += 1;
    const start = balance;
    const pnl = start * monthlyReturnRate;
    const withdrawal = pnl * withdrawalRate;
    const compounded = pnl - withdrawal;
    const end = start + compounded;
    schedule.push({
      month,
      start: round2(start),
      pnl: round2(pnl),
      withdrawal: round2(withdrawal),
      end: round2(end),
    });
    balance = end;
    totalWithdrawn += withdrawal;
  }

  // If the 1200-month (100 year) cap was hit without reaching the target,
  // "months to target" is honestly unknown/effectively unreachable at this
  // rate — returning the cap value as if it were the answer would be just
  // as misleading as the old linear-growth bug.
  const reached = balance >= targetBalance;

  return {
    monthsToTarget: reached ? month : null,
    yearsToTarget: reached ? round2(month / 12) : null,
    effectiveMonthlyRate: round4(monthlyReturnRate * (1 - withdrawalRate)),
    schedule,
    totalWithdrawn: round2(totalWithdrawn),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;