import { Router } from 'express';
import { DailyJournal } from '../models/DailyJournal';
import { Trade } from '../models/Trade';
import { calendarPnL, moodPnLCorrelation } from '../services/analytics';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/daily-journal?month=YYYY-MM — every logged entry in that month
 * (or every entry ever, if month is omitted), for the Calendar page's mood
 * badges. Days with no entry simply aren't in the list.
 */
router.get('/', async (req, res) => {
  try {
    const month = (req.query.month as string | undefined)?.trim();
    const query: Record<string, unknown> = {};
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      query.date = { $regex: `^${month}` };
    }
    const entries = await DailyJournal.find(query);
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/daily-journal/mood-correlation — average net P&L and % of
 * positive days, bucketed by that day's logged mood rating.
 */
router.get('/mood-correlation', async (_req, res) => {
  try {
    const [trades, entries] = await Promise.all([
      Trade.find(),
      DailyJournal.find({ mood: { $ne: null } }),
    ]);
    const moodByDate = new Map<string, number>();
    for (const e of entries) {
      if (e.mood != null) moodByDate.set(e.date, e.mood);
    }
    const days = calendarPnL(trades);
    res.json(moodPnLCorrelation(days, moodByDate));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/daily-journal/:date — one day's entry, or a blank default
 * shape if nothing has been logged for it yet (so the frontend never has
 * to special-case a 404). */
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date, expected YYYY-MM-DD' });
    const entry = await DailyJournal.findOne({ date });
    res.json(entry ?? { date, mood: null, note: '' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** PUT /api/daily-journal/:date — upsert this day's note/mood. */
router.put('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date, expected YYYY-MM-DD' });
    const { mood, note } = req.body;
    if (mood != null && (isNaN(Number(mood)) || Number(mood) < 1 || Number(mood) > 5)) {
      return res.status(400).json({ error: 'Mood must be 1-5' });
    }
    const entry = await DailyJournal.findOneAndUpdate(
      { date },
      { $set: { mood: mood != null ? Number(mood) : null, note: note != null ? String(note) : '' } },
      { upsert: true, new: true }
    );
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** DELETE /api/daily-journal/:date — clear this day's entry entirely. */
router.delete('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    await DailyJournal.deleteOne({ date });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
