import { Router } from 'express';
import { Playbook } from '../models/Playbook';
import { Trade } from '../models/Trade';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const playbooks = await Playbook.find().sort({ name: 1 });
    res.json(playbooks);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, rules, color } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Playbook name is required' });
    }
    const playbook = await Playbook.create({
      name: String(name).trim(),
      description,
      rules: Array.isArray(rules) ? rules : [],
      color,
    });
    res.status(201).json(playbook);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'A playbook with that name already exists' });
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { name, description, rules, color } = req.body;
    const playbook = await Playbook.findById(req.params.id);
    if (!playbook) return res.status(404).json({ error: 'Playbook not found' });
    if (name !== undefined) playbook.name = name;
    if (description !== undefined) playbook.description = description;
    if (rules !== undefined) playbook.rules = Array.isArray(rules) ? rules : [];
    if (color !== undefined) playbook.color = color;
    await playbook.save();
    res.json(playbook);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await Playbook.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Playbook not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/playbooks/:id/adherence — how trades tagged with this playbook's
 * name (Trade.setup) have actually performed: win rate, net P&L, and how
 * often the trade's own "followed the plan" flag was true.
 */
router.get('/:id/adherence', async (req, res) => {
  try {
    const playbook = await Playbook.findById(req.params.id);
    if (!playbook) return res.status(404).json({ error: 'Playbook not found' });

    const trades = await Trade.find({ setup: playbook.name, balanceAfter: { $ne: null } });
    const wins = trades.filter((t) => t.result === 'Win').length;
    const losses = trades.filter((t) => t.result === 'Loss').length;
    const netPnL = trades.reduce((sum, t) => sum + ((t.balanceAfter ?? 0) - t.balanceBefore), 0);
    const tracked = trades.filter((t) => t.followedPlan != null);
    const followed = tracked.filter((t) => t.followedPlan === true).length;

    res.json({
      trades: trades.length,
      wins,
      losses,
      winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : null,
      netPnL: Math.round(netPnL * 100) / 100,
      adherenceRate: tracked.length > 0 ? Math.round((followed / tracked.length) * 1000) / 10 : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
