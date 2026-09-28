import { Router } from 'express';
import { Trade } from '../models/Trade';
import {
  calendarPnL,
  coreStats,
  equityCurve,
  statsBySymbol,
  statsByWeekday,
  statsByTag,
  statsBySetup,
  disciplineStats,
  rollingStats,
  behavioralInsights,
  weeklyRecap,
  lossLimitStatus,
  riskMentorReport,
} from '../services/analytics';
import { getOrCreateAccount } from '../services/accountService';

const router = Router();

/**
 * GET /api/analytics/calendar?month=YYYY-MM — net P&L per day for one
 * month, for the calendar heatmap. Omit "month" to get every day on record.
 */
router.get('/calendar', async (req, res) => {
  try {
    const month = (req.query.month as string | undefined)?.trim();
    const query: Record<string, unknown> = {};
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      query.date = { $gte: start, $lt: end };
    }
    const trades = await Trade.find(query);
    res.json(calendarPnL(trades));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/analytics/summary — the full analytics bundle in one call:
 * core stats, equity curve, and breakdowns by symbol/weekday/tag/setup.
 * Optional ?symbol=GOLD|ETHUSD narrows everything to one instrument.
 */
router.get('/summary', async (req, res) => {
  try {
    const symbol = (req.query.symbol as string | undefined)?.trim().toUpperCase();
    const query: Record<string, unknown> = {};
    if (symbol === 'GOLD' || symbol === 'ETHUSD') query.symbol = symbol;

    const trades = await Trade.find(query);

    res.json({
      core: coreStats(trades),
      equityCurve: equityCurve(trades),
      bySymbol: statsBySymbol(trades),
      byWeekday: statsByWeekday(trades),
      byTag: statsByTag(trades),
      bySetup: statsBySetup(trades),
      discipline: disciplineStats(trades),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/analytics/rolling?days=30 — core stats restricted to trades
 * closed within the last N days, for a trailing-window trend view.
 */
router.get('/rolling', async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const symbol = (req.query.symbol as string | undefined)?.trim().toUpperCase();
    const query: Record<string, unknown> = {};
    if (symbol === 'GOLD' || symbol === 'ETHUSD') query.symbol = symbol;
    const trades = await Trade.find(query);
    res.json(rollingStats(trades, days));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/analytics/insights — behavioral patterns (revenge-trading
 * check, performance by trades-that-day) plus last week's recap, bundled
 * together since the Dashboard/Analytics pages show them side by side.
 */
router.get('/insights', async (_req, res) => {
  try {
    const trades = await Trade.find();
    res.json({
      behavioral: behavioralInsights(trades),
      lastWeek: weeklyRecap(trades),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/analytics/risk-status — today's and this week's realized P&L
 * against the account's configured max-loss guardrails.
 */
router.get('/risk-status', async (_req, res) => {
  try {
    const [trades, account] = await Promise.all([Trade.find(), getOrCreateAccount()]);
    res.json(
      lossLimitStatus(trades, account.currentBalance, account.maxDailyLossPct, account.maxWeeklyLossPct)
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/analytics/mentor — the risk mentor bundle: yesterday's recap,
 * today's trade count, current streak, drawdown from peak balance, and a
 * list of rule-based coaching messages derived from all of the above plus
 * loss limits and plan adherence.
 */
router.get('/mentor', async (_req, res) => {
  try {
    const [trades, account] = await Promise.all([Trade.find(), getOrCreateAccount()]);
    res.json(
      riskMentorReport(
        trades,
        account.currentBalance,
        account.riskPerTrade,
        account.maxDailyLossPct,
        account.maxWeeklyLossPct
      )
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
