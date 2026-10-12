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

/**
 * Forex Factory's weekly economic calendar — the full high/medium/low
 * impact calendar (CPI, PMIs, central bank speeches, every currency), not
 * just the two hardcoded USD events above. Forex Factory doesn't publish
 * an official API; this is the public JSON feed their own calendar widget
 * loads client-side (no key, no auth). It's widely relied on by other
 * trading tools, but it's undocumented and could change shape or go away
 * without notice — every field is defensively checked below, and a feed
 * failure degrades to the last good cache (or an empty list) rather than
 * breaking the page.
 */
const FF_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

interface ForexFactoryEvent {
  title: string;
  country: string; // currency code, e.g. "USD"
  date: string; // ISO timestamp
  impact: 'High' | 'Medium' | 'Low' | 'Holiday';
  forecast: string;
  previous: string;
}

let ffCache: { events: ForexFactoryEvent[]; fetchedAt: number } | null = null;
const FF_CACHE_MS = 30 * 60 * 1000; // 30 minutes

function isValidImpact(v: unknown): v is ForexFactoryEvent['impact'] {
  return v === 'High' || v === 'Medium' || v === 'Low' || v === 'Holiday';
}

async function fetchForexFactoryCalendar(): Promise<ForexFactoryEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(FF_CALENDAR_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldTradingCompanyJournal/1.0)' },
    });
    if (!res.ok) throw new Error(`Forex Factory feed returned ${res.status}`);
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) throw new Error('Unexpected Forex Factory feed shape');

    const events: ForexFactoryEvent[] = [];
    for (const item of raw) {
      if (
        item && typeof item === 'object' &&
        typeof (item as any).title === 'string' &&
        typeof (item as any).country === 'string' &&
        typeof (item as any).date === 'string' &&
        isValidImpact((item as any).impact)
      ) {
        const i = item as any;
        events.push({
          title: i.title,
          country: i.country,
          date: i.date,
          impact: i.impact,
          forecast: typeof i.forecast === 'string' ? i.forecast : '',
          previous: typeof i.previous === 'string' ? i.previous : '',
        });
      }
    }
    return events;
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/calendar', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const currencyParam = (req.query.currency as string | undefined)?.toUpperCase();
    const includeLow = req.query.impact === 'all';

    let events: ForexFactoryEvent[];
    let stale = false;

    if (!force && ffCache && Date.now() - ffCache.fetchedAt < FF_CACHE_MS) {
      events = ffCache.events;
    } else {
      try {
        events = await fetchForexFactoryCalendar();
        ffCache = { events, fetchedAt: Date.now() };
      } catch (err) {
        if (ffCache) {
          events = ffCache.events;
          stale = true;
        } else {
          return res.status(502).json({ error: 'Could not reach the Forex Factory calendar feed', details: (err as Error).message });
        }
      }
    }

    const now = Date.now();
    const filtered = events
      .filter((e) => (currencyParam ? e.country === currencyParam : e.country === 'USD'))
      .filter((e) => includeLow || e.impact === 'High' || e.impact === 'Medium')
      .filter((e) => {
        const t = Date.parse(e.date);
        return !isNaN(t) && t >= now - 24 * 60 * 60 * 1000; // keep today onward (small lookback for same-day-earlier releases)
      })
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    res.json({ events: filtered, stale, source: 'forexfactory' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
