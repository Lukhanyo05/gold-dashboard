import { Router } from 'express';
import { Goal } from '../models/Goal';
import { Trade } from '../models/Trade';
import { getOrCreateAccount } from '../services/accountService';
import { coreStats } from '../services/analytics';

const router = Router();

/**
 * Reads the CURRENT value of whatever metric a goal tracks, so progress can
 * be computed without storing a duplicate of it on the goal itself.
 */
async function currentValueFor(type: string): Promise<number | null> {
  if (type === 'Balance') {
    const account = await getOrCreateAccount();
    return account.currentBalance;
  }
  if (type === 'WinRate' || type === 'ProfitFactor') {
    const trades = await Trade.find({ balanceAfter: { $ne: null } });
    const stats = coreStats(trades as any);
    return type === 'WinRate' ? stats.winRate : stats.profitFactor;
  }
  // 'Custom' goals have no automatic metric — progress is left to the
  // person to update by editing the goal, or just tracked by target date.
  return null;
}

router.get('/', async (_req, res) => {
  try {
    const goals = await Goal.find().sort({ achieved: 1, targetDate: 1, createdAt: -1 });
    const withProgress = await Promise.all(
      goals.map(async (g) => {
        const current = await currentValueFor(g.type);
        let progressPct: number | null = null;
        if (current != null) {
          const span = g.targetValue - g.startValue;
          progressPct =
            span === 0 ? 100 : Math.max(0, Math.min(100, Math.round(((current - g.startValue) / span) * 1000) / 10));
        }
        const reachedNow = progressPct != null && progressPct >= 100;
        return { ...g.toObject(), currentValue: current, progressPct, reachedNow };
      })
    );
    res.json(withProgress);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { label, type, targetValue, targetDate } = req.body;
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'Goal label is required' });
    }
    if (targetValue == null || isNaN(Number(targetValue))) {
      return res.status(400).json({ error: 'A numeric target value is required' });
    }
    const goalType = ['Balance', 'WinRate', 'ProfitFactor', 'Custom'].includes(type) ? type : 'Custom';
    const startValue = (await currentValueFor(goalType)) ?? 0;

    const goal = await Goal.create({
      label: String(label).trim(),
      type: goalType,
      targetValue: Number(targetValue),
      startValue,
      targetDate: targetDate ? new Date(targetDate) : null,
    });
    res.status(201).json(goal);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { label, targetValue, targetDate, achieved } = req.body;
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (label !== undefined) goal.label = label;
    if (targetValue !== undefined) goal.targetValue = Number(targetValue);
    if (targetDate !== undefined) goal.targetDate = targetDate ? new Date(targetDate) : null;
    if (achieved !== undefined) {
      goal.achieved = !!achieved;
      goal.achievedAt = achieved ? new Date() : null;
    }
    await goal.save();
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await Goal.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Goal not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
