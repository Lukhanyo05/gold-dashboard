import { Router } from 'express';

const router = Router();

/**
 * Macro events that move Gold: Fed policy decisions and the US jobs report.
 * No external calendar API is used (most require a paid key) — these are
 * computed/hardcoded from each event's own well-known, publicly-published
 * schedule instead:
 *
 *  - FOMC meeting dates are set and published by the Federal Reserve up to
 *    two years ahead (federalreserve.gov/monetarypolicy/fomccalendars.htm).
 *    This list needs updating once a year when the Fed publishes the next
 *    year's calendar.
 *  - Non-Farm Payrolls (NFP) is released by the BLS on the first Friday of
 *    (almost) every month — computed programmatically rather than listed,
 *    so it never goes stale.
 */

// Source: federalreserve.gov/monetarypolicy/fomccalendars.htm (as published).
// The decision/press-conference day (second day of each two-day meeting) is
// what's listed — that's when the rate decision actually lands.
const FOMC_DECISION_DATES_2026 = [
  '2026-01-28',
  '2026-03-18',
  '2026-04-29',
  '2026-06-17',
  '2026-07-29',
  '2026-09-16',
  '2026-10-28',
  '2026-12-09',
];

function firstFridayOfMonth(year: number, monthIndex0: number): Date {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  const dayOfWeek = d.getUTCDay(); // 0 = Sun ... 5 = Fri
  const offset = (5 - dayOfWeek + 7) % 7;
  d.setUTCDate(1 + offset);
  return d;
}

interface MacroEvent {
  date: string; // YYYY-MM-DD
  label: string;
  category: 'FOMC' | 'NFP';
  note: string;
}

router.get('/', async (req, res) => {
  try {
    const monthsAhead = Math.min(Math.max(Number(req.query.months) || 3, 1), 12);
    const now = new Date();
    const events: MacroEvent[] = [];

    for (const iso of FOMC_DECISION_DATES_2026) {
      const d = new Date(`${iso}T00:00:00Z`);
      events.push({
        date: iso,
        label: 'FOMC Rate Decision',
        category: 'FOMC',
        note: 'Fed policy decisions are the single biggest scheduled driver of Gold volatility — a rate cut/pause surprise moves XAUUSD hard in either direction.',
      });
      void d;
    }

    for (let i = 0; i < monthsAhead; i++) {
      const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const nfp = firstFridayOfMonth(target.getFullYear(), target.getMonth());
      events.push({
        date: nfp.toISOString().slice(0, 10),
        label: 'US Non-Farm Payrolls (NFP)',
        category: 'NFP',
        note: 'Monthly US jobs report — a stronger/weaker print than expected shifts rate-cut odds and typically causes a sharp short-term Gold move.',
      });
    }

    const todayIso = now.toISOString().slice(0, 10);
    const upcoming = events
      .filter((e) => e.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ events: upcoming });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
