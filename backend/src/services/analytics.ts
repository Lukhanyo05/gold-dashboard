// Analytics/journal-stats service — everything the Analytics, Calendar and
// Dashboard pages need, computed from the closed-trade history. No fields
// are invented: a stat that needs data we don't have (e.g. a Stop Loss for
// R-multiple) is simply left out of that trade's contribution rather than
// guessed at.

import { TradeDocument } from '../models/Trade';

export interface DayPnL {
  date: string; // YYYY-MM-DD, local-to-server calendar day of the trade's close
  netPnL: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface CoreStats {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number | null; // wins / (wins+losses), null if no decided trades yet
  profitFactor: number | null; // grossWin / grossLoss, null if no losses/wins
  avgWin: number | null;
  avgLoss: number | null;
  avgRMultiple: number | null;
  totalPnL: number;
  currentStreak: { type: 'Win' | 'Loss' | null; count: number };
  bestDay: DayPnL | null;
  worstDay: DayPnL | null;
}

export interface EquityPoint {
  date: string;
  balance: number;
}

function pnlOf(t: TradeDocument): number | null {
  if (t.balanceAfter == null) return null;
  return t.balanceAfter - t.balanceBefore;
}

function dayKey(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Net P&L per calendar day, for a heatmap-style calendar view. */
export function calendarPnL(trades: TradeDocument[]): DayPnL[] {
  const byDay = new Map<string, DayPnL>();
  for (const t of trades) {
    const pnl = pnlOf(t);
    if (pnl == null) continue; // still-open trades don't count toward a day's realized P&L
    const key = dayKey(t.date);
    const entry = byDay.get(key) ?? { date: key, netPnL: 0, trades: 0, wins: 0, losses: 0 };
    entry.netPnL += pnl;
    entry.trades += 1;
    if (t.result === 'Win') entry.wins += 1;
    if (t.result === 'Loss') entry.losses += 1;
    byDay.set(key, entry);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Core win-rate / profit-factor / streak stats across a set of trades. */
export function coreStats(trades: TradeDocument[]): CoreStats {
  const chrono = [...trades].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const closed = chrono.filter((t) => t.balanceAfter != null);

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let totalPnL = 0;
  let rSum = 0;
  let rCount = 0;

  for (const t of closed) {
    const pnl = pnlOf(t)!;
    totalPnL += pnl;
    if (t.result === 'Win') {
      wins += 1;
      grossWin += pnl;
    } else if (t.result === 'Loss') {
      losses += 1;
      grossLoss += Math.abs(pnl);
    } else if (t.result === 'Breakeven') {
      breakevens += 1;
    }
    if (t.rMultiple != null) {
      rSum += t.rMultiple;
      rCount += 1;
    }
  }

  let currentStreak: { type: 'Win' | 'Loss' | null; count: number } = { type: null, count: 0 };
  for (let i = closed.length - 1; i >= 0; i--) {
    const r = closed[i].result;
    if (r !== 'Win' && r !== 'Loss') break;
    if (currentStreak.type === null) {
      currentStreak = { type: r, count: 1 };
    } else if (currentStreak.type === r) {
      currentStreak.count += 1;
    } else {
      break;
    }
  }

  const days = calendarPnL(closed);
  const bestDay = days.length ? days.reduce((a, b) => (b.netPnL > a.netPnL ? b : a)) : null;
  const worstDay = days.length ? days.reduce((a, b) => (b.netPnL < a.netPnL ? b : a)) : null;

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    wins,
    losses,
    breakevens,
    winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : null,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
    avgWin: wins > 0 ? Math.round((grossWin / wins) * 100) / 100 : null,
    avgLoss: losses > 0 ? Math.round((grossLoss / losses) * 100) / 100 : null,
    avgRMultiple: rCount > 0 ? Math.round((rSum / rCount) * 100) / 100 : null,
    totalPnL: Math.round(totalPnL * 100) / 100,
    currentStreak,
    bestDay,
    worstDay,
  };
}

/** Equity curve — running balance after each closed trade, in order. */
export function equityCurve(trades: TradeDocument[]): EquityPoint[] {
  return [...trades]
    .filter((t) => t.balanceAfter != null)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .map((t) => ({ date: dayKey(t.date), balance: Math.round((t.balanceAfter as number) * 100) / 100 }));
}

export interface GroupStat {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnL: number;
}

function groupBy(trades: TradeDocument[], keyFn: (t: TradeDocument) => string): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const t of trades) {
    if (t.balanceAfter == null) continue;
    const key = keyFn(t);
    const entry = map.get(key) ?? { key, trades: 0, wins: 0, losses: 0, winRate: null, netPnL: 0 };
    entry.trades += 1;
    if (t.result === 'Win') entry.wins += 1;
    if (t.result === 'Loss') entry.losses += 1;
    entry.netPnL += pnlOf(t) ?? 0;
    map.set(key, entry);
  }
  for (const entry of map.values()) {
    entry.winRate =
      entry.wins + entry.losses > 0
        ? Math.round((entry.wins / (entry.wins + entry.losses)) * 1000) / 10
        : null;
    entry.netPnL = Math.round(entry.netPnL * 100) / 100;
  }
  return [...map.values()];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function statsBySymbol(trades: TradeDocument[]): GroupStat[] {
  return groupBy(trades, (t) => t.symbol);
}

export function statsByWeekday(trades: TradeDocument[]): GroupStat[] {
  return groupBy(trades, (t) => WEEKDAYS[new Date(t.date).getDay()]);
}

export function statsByTag(trades: TradeDocument[]): GroupStat[] {
  const withTags = trades.filter((t) => t.tags && t.tags.length > 0);
  const map = new Map<string, GroupStat>();
  for (const t of withTags) {
    if (t.balanceAfter == null) continue;
    for (const tag of t.tags as string[]) {
      const entry = map.get(tag) ?? { key: tag, trades: 0, wins: 0, losses: 0, winRate: null, netPnL: 0 };
      entry.trades += 1;
      if (t.result === 'Win') entry.wins += 1;
      if (t.result === 'Loss') entry.losses += 1;
      entry.netPnL += pnlOf(t) ?? 0;
      map.set(tag, entry);
    }
  }
  for (const entry of map.values()) {
    entry.winRate =
      entry.wins + entry.losses > 0
        ? Math.round((entry.wins / (entry.wins + entry.losses)) * 1000) / 10
        : null;
    entry.netPnL = Math.round(entry.netPnL * 100) / 100;
  }
  return [...map.values()];
}

export function statsBySetup(trades: TradeDocument[]): GroupStat[] {
  return groupBy(
    trades.filter((t) => t.setup),
    (t) => t.setup as string
  );
}

/** Core stats restricted to trades closed within the last N days — lets the
 * UI show "last 30/60/90 days" trends alongside the lifetime numbers, so a
 * bad lifetime average doesn't hide that the last month has been improving
 * (or the reverse). */
export function rollingStats(trades: TradeDocument[], days: number): CoreStats {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = trades.filter((t) => +new Date(t.date) >= cutoff);
  return coreStats(recent);
}

export interface BehavioralInsights {
  /** Win rate on a trade taken immediately after a losing trade, vs. after
   * a winning trade — a meaningfully lower "after a loss" number is the
   * classic revenge-trading signature. null when there isn't enough data. */
  winRateAfterLoss: number | null;
  winRateAfterWin: number | null;
  tradesAfterLoss: number;
  tradesAfterWin: number;
  /** Win rate bucketed by how many trades were already taken that same
   * calendar day — overtrading usually shows up as a falling win rate in
   * the later buckets. */
  byTradesThatDay: { tradesSoFar: string; count: number; winRate: number | null }[];
}

export function behavioralInsights(trades: TradeDocument[]): BehavioralInsights {
  const closed = [...trades]
    .filter((t) => t.balanceAfter != null && (t.result === 'Win' || t.result === 'Loss'))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  let afterLossWins = 0, afterLossTotal = 0;
  let afterWinWins = 0, afterWinTotal = 0;
  for (let i = 1; i < closed.length; i++) {
    const prev = closed[i - 1].result;
    const cur = closed[i].result;
    if (prev === 'Loss') {
      afterLossTotal += 1;
      if (cur === 'Win') afterLossWins += 1;
    } else if (prev === 'Win') {
      afterWinTotal += 1;
      if (cur === 'Win') afterWinWins += 1;
    }
  }

  // Bucket by "this was the Nth trade opened that calendar day" (1st, 2nd,
  // 3rd, 4th+), win rate per bucket.
  const dayCounts = new Map<string, number>();
  const buckets = new Map<string, { wins: number; total: number }>();
  for (const t of closed) {
    const key = dayKey(t.date);
    const n = (dayCounts.get(key) ?? 0) + 1;
    dayCounts.set(key, n);
    const bucketKey = n >= 4 ? '4+' : String(n);
    const b = buckets.get(bucketKey) ?? { wins: 0, total: 0 };
    b.total += 1;
    if (t.result === 'Win') b.wins += 1;
    buckets.set(bucketKey, b);
  }

  const byTradesThatDay = ['1', '2', '3', '4+'].map((k) => {
    const b = buckets.get(k);
    return {
      tradesSoFar: k,
      count: b?.total ?? 0,
      winRate: b && b.total > 0 ? Math.round((b.wins / b.total) * 1000) / 10 : null,
    };
  });

  return {
    winRateAfterLoss: afterLossTotal > 0 ? Math.round((afterLossWins / afterLossTotal) * 1000) / 10 : null,
    winRateAfterWin: afterWinTotal > 0 ? Math.round((afterWinWins / afterWinTotal) * 1000) / 10 : null,
    tradesAfterLoss: afterLossTotal,
    tradesAfterWin: afterWinTotal,
    byTradesThatDay,
  };
}

export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  netPnL: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  bestDay: DayPnL | null;
  worstDay: DayPnL | null;
  adherenceRate: number | null;
}

/** Stats for the most recently COMPLETED Mon–Sun week (not the current
 * in-progress one), for a "here's how last week went" recap. */
export function weeklyRecap(trades: TradeDocument[]): WeeklyRecap {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday); // exclusive upper bound = this week's Monday

  const inWeek = trades.filter((t) => {
    const d = +new Date(t.date);
    return d >= +lastMonday && d < +lastSunday;
  });
  const stats = coreStats(inWeek);
  const days = calendarPnL(inWeek.filter((t) => t.balanceAfter != null));
  const discipline = disciplineStats(inWeek);

  return {
    weekStart: lastMonday.toISOString().slice(0, 10),
    weekEnd: new Date(lastSunday.getTime() - 86400000).toISOString().slice(0, 10),
    netPnL: stats.totalPnL,
    trades: stats.closedTrades,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.winRate,
    bestDay: days.length ? days.reduce((a, b) => (b.netPnL > a.netPnL ? b : a)) : null,
    worstDay: days.length ? days.reduce((a, b) => (b.netPnL < a.netPnL ? b : a)) : null,
    adherenceRate: discipline.adherenceRate,
  };
}

export interface LossLimitStatus {
  dailyLimitPct: number | null;
  weeklyLimitPct: number | null;
  todayPnL: number;
  weekPnL: number;
  dailyLimitUSD: number | null;
  weeklyLimitUSD: number | null;
  dailyBreached: boolean;
  weeklyBreached: boolean;
}

/** How today's and this week's realized P&L compare to the account's
 * configured max-loss guardrails (both expressed as a % of current
 * balance, same convention as riskPerTrade). */
export function lossLimitStatus(
  trades: TradeDocument[],
  currentBalance: number,
  maxDailyLossPct: number | null | undefined,
  maxWeeklyLossPct: number | null | undefined
): LossLimitStatus {
  const closed = trades.filter((t) => t.balanceAfter != null);
  const now = new Date();
  const todayKey = dayKey(now);
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));

  let todayPnL = 0;
  let weekPnL = 0;
  for (const t of closed) {
    const pnl = pnlOf(t) ?? 0;
    if (dayKey(t.date) === todayKey) todayPnL += pnl;
    if (+new Date(t.date) >= +weekStart) weekPnL += pnl;
  }

  const dailyLimitUSD = maxDailyLossPct ? Math.round(currentBalance * maxDailyLossPct * 100) / 100 : null;
  const weeklyLimitUSD = maxWeeklyLossPct ? Math.round(currentBalance * maxWeeklyLossPct * 100) / 100 : null;

  return {
    dailyLimitPct: maxDailyLossPct ?? null,
    weeklyLimitPct: maxWeeklyLossPct ?? null,
    todayPnL: Math.round(todayPnL * 100) / 100,
    weekPnL: Math.round(weekPnL * 100) / 100,
    dailyLimitUSD,
    weeklyLimitUSD,
    dailyBreached: dailyLimitUSD != null && todayPnL <= -dailyLimitUSD,
    weeklyBreached: weeklyLimitUSD != null && weekPnL <= -weeklyLimitUSD,
  };
}

export interface YesterdayRecap {
  date: string | null; // null if there were no trades yesterday
  trades: number;
  netPnL: number;
  wins: number;
  losses: number;
  winRate: number | null;
  adherenceRate: number | null;
}

/** Yesterday's closed-trade performance (UTC calendar day), for the risk
 * mentor's "here's how yesterday went" recap. */
export function yesterdayRecap(trades: TradeDocument[]): YesterdayRecap {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const key = dayKey(yesterday);
  const inDay = trades.filter((t) => t.balanceAfter != null && dayKey(t.date) === key);
  if (inDay.length === 0) {
    return { date: null, trades: 0, netPnL: 0, wins: 0, losses: 0, winRate: null, adherenceRate: null };
  }
  const stats = coreStats(inDay);
  const discipline = disciplineStats(inDay);
  return {
    date: key,
    trades: stats.closedTrades,
    netPnL: stats.totalPnL,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.winRate,
    adherenceRate: discipline.adherenceRate,
  };
}

export interface MentorMessage {
  id: string;
  severity: 'success' | 'info' | 'warning' | 'danger';
  title: string;
  message: string;
}

export interface RiskMentorReport {
  yesterday: YesterdayRecap;
  todayTrades: number;
  currentStreak: { type: 'Win' | 'Loss' | null; count: number };
  peakBalance: number | null;
  currentBalance: number;
  drawdownFromPeakPct: number | null;
  riskPerTradePct: number;
  recentAdherenceRate: number | null;
  messages: MentorMessage[];
}

/**
 * The risk mentor — a deterministic, rule-based read on "how risky is right
 * now", combining loss-limit status, streaks, overtrading, drawdown, and
 * plan adherence into a short list of plain-language flags. Every message
 * is derived directly from the person's own trade history; nothing here is
 * generated by a model, so the same underlying pattern always produces the
 * same message.
 */
export function riskMentorReport(
  trades: TradeDocument[],
  currentBalance: number,
  riskPerTrade: number,
  maxDailyLossPct: number | null | undefined,
  maxWeeklyLossPct: number | null | undefined
): RiskMentorReport {
  const now = new Date();
  const todayKey = dayKey(now);
  const todayTrades = trades.filter((t) => dayKey(t.date) === todayKey).length;

  const streak = coreStats(trades).currentStreak;
  const yesterday = yesterdayRecap(trades);
  const behavioral = behavioralInsights(trades);
  const byDayBucket = behavioral.byTradesThatDay;
  const recentAdherence = disciplineStats(
    trades.filter((t) => +new Date(t.date) >= Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).adherenceRate;
  const limits = lossLimitStatus(trades, currentBalance, maxDailyLossPct, maxWeeklyLossPct);

  const curve = equityCurve(trades);
  const peakBalance = curve.length
    ? Math.max(currentBalance, ...curve.map((p) => p.balance))
    : currentBalance;
  const drawdownFromPeakPct =
    peakBalance > 0 ? Math.round(((peakBalance - currentBalance) / peakBalance) * 1000) / 10 : null;

  const messages: MentorMessage[] = [];

  // --- Hard stops: loss-limit guardrails ---
  if (limits.dailyBreached) {
    messages.push({
      id: 'daily-limit-breached',
      severity: 'danger',
      title: 'Daily loss limit hit',
      message: `Today's realized P&L is $${limits.todayPnL.toFixed(2)}, past your daily limit of $${(limits.dailyLimitUSD ?? 0).toFixed(2)}. Stop trading for today — this is exactly what the limit is there for.`,
    });
  }
  if (limits.weeklyBreached) {
    messages.push({
      id: 'weekly-limit-breached',
      severity: 'danger',
      title: 'Weekly loss limit hit',
      message: `This week's realized P&L is $${limits.weekPnL.toFixed(2)}, past your weekly limit of $${(limits.weeklyLimitUSD ?? 0).toFixed(2)}. Close the platform for the rest of the week.`,
    });
  }

  // --- Loss streak / revenge-trading risk ---
  if (streak.type === 'Loss' && streak.count >= 2) {
    const hasGap =
      behavioral.winRateAfterLoss != null &&
      behavioral.winRateAfterWin != null &&
      behavioral.winRateAfterWin - behavioral.winRateAfterLoss >= 10;
    messages.push({
      id: 'loss-streak',
      severity: streak.count >= 3 ? 'danger' : 'warning',
      title: `${streak.count} losses in a row`,
      message: hasGap
        ? `Your win rate after a loss is ${behavioral.winRateAfterLoss}% vs ${behavioral.winRateAfterWin}% after a win — that gap is a revenge-trading signature. Take a short break before the next trade.`
        : `${streak.count} consecutive losses. Slow down, double-check your setup still meets every rule on its checklist before the next entry.`,
    });
  }

  // --- Overtrading ---
  if (todayTrades >= 4) {
    const bucket4 = byDayBucket.find((b) => b.tradesSoFar === '4+');
    const bucket1 = byDayBucket.find((b) => b.tradesSoFar === '1');
    const hasGap =
      bucket4?.winRate != null && bucket1?.winRate != null && bucket1.winRate - bucket4.winRate >= 10;
    messages.push({
      id: 'overtrading',
      severity: 'warning',
      title: `Trade #${todayTrades} today`,
      message: hasGap
        ? `Your win rate on the 4th+ trade of a day is historically ${bucket4!.winRate}% vs ${bucket1!.winRate}% on your first. This many trades in one session is usually a sign to stop, not push harder.`
        : `${todayTrades} trades today is a lot in one session — consider whether you're still trading your plan or just trading to stay busy.`,
    });
  }

  // --- Drawdown from equity peak ---
  if (drawdownFromPeakPct != null && drawdownFromPeakPct >= 10) {
    messages.push({
      id: 'drawdown',
      severity: drawdownFromPeakPct >= 20 ? 'danger' : 'warning',
      title: `${drawdownFromPeakPct}% below peak balance`,
      message: `Your peak balance was $${peakBalance.toFixed(2)}; you're currently at $${currentBalance.toFixed(2)}. Consider trading smaller size until you're back closer to the peak.`,
    });
  }

  // --- Risk per trade sanity check ---
  if (riskPerTrade > 0.02) {
    messages.push({
      id: 'risk-per-trade-high',
      severity: 'warning',
      title: `Risking ${(riskPerTrade * 100).toFixed(1)}% per trade`,
      message: 'Most professional risk frameworks cap risk per trade at 1-2% of capital. A higher setting means a short losing streak can do outsized damage to the account.',
    });
  }

  // --- Plan adherence over the last 30 days ---
  if (recentAdherence != null && recentAdherence < 70) {
    messages.push({
      id: 'low-adherence',
      severity: 'warning',
      title: `${recentAdherence}% plan adherence (last 30 days)`,
      message: 'You\'ve been breaking your own rules on a meaningful share of recent trades. Adherence is usually the single biggest lever on results — worth fixing before anything else.',
    });
  }

  // --- Yesterday, if it was a losing day ---
  if (yesterday.trades > 0 && yesterday.netPnL < 0) {
    messages.push({
      id: 'yesterday-loss',
      severity: 'info',
      title: `Yesterday: ${yesterday.netPnL.toFixed(2)} on ${yesterday.trades} trade${yesterday.trades === 1 ? '' : 's'}`,
      message: "Don't try to \"win back\" yesterday's loss today — size and select trades exactly as you would on any other day.",
    });
  }

  // --- All clear ---
  if (messages.length === 0) {
    messages.push({
      id: 'all-clear',
      severity: 'success',
      title: 'No risk flags right now',
      message: 'Loss limits are clear, no active loss streak, and plan adherence looks solid. Keep trading your plan.',
    });
  }

  return {
    yesterday,
    todayTrades,
    currentStreak: streak,
    peakBalance: Math.round(peakBalance * 100) / 100,
    currentBalance,
    drawdownFromPeakPct,
    riskPerTradePct: Math.round(riskPerTrade * 1000) / 10,
    recentAdherenceRate: recentAdherence,
    messages,
  };
}

export interface MoodPnLBucket {
  mood: number; // 1-5
  days: number;
  avgNetPnL: number;
  positiveDayRate: number | null; // % of rated days at this mood that were net positive
}

/** Groups each day's net P&L by that day's logged mood rating (1-5), for
 * the Daily Journal's "does mood predict trading days?" question. Days
 * with no mood entry are simply excluded — this only sees rated days. */
export function moodPnLCorrelation(dayPnL: DayPnL[], moodByDate: Map<string, number>): MoodPnLBucket[] {
  const buckets = new Map<number, { total: number; count: number; positiveDays: number }>();
  for (const d of dayPnL) {
    const mood = moodByDate.get(d.date);
    if (mood == null) continue;
    const b = buckets.get(mood) ?? { total: 0, count: 0, positiveDays: 0 };
    b.total += d.netPnL;
    b.count += 1;
    if (d.netPnL > 0) b.positiveDays += 1;
    buckets.set(mood, b);
  }
  return [1, 2, 3, 4, 5].map((mood) => {
    const b = buckets.get(mood);
    return {
      mood,
      days: b?.count ?? 0,
      avgNetPnL: b && b.count > 0 ? Math.round((b.total / b.count) * 100) / 100 : 0,
      positiveDayRate: b && b.count > 0 ? Math.round((b.positiveDays / b.count) * 1000) / 10 : null,
    };
  });
}

/** Discipline: how often closed trades were tagged as "followed the plan". */
export function disciplineStats(trades: TradeDocument[]) {
  const decided = trades.filter((t) => t.balanceAfter != null && t.followedPlan != null);
  const followed = decided.filter((t) => t.followedPlan === true).length;
  return {
    trackedTrades: decided.length,
    followedCount: followed,
    brokeRuleCount: decided.length - followed,
    adherenceRate:
      decided.length > 0 ? Math.round((followed / decided.length) * 1000) / 10 : null,
  };
}
