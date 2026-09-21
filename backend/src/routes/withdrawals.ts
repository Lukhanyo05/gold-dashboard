import { Router } from 'express';
import { Withdrawal } from '../models/Withdrawal';
import { getOrCreateAccount, updateAccount } from '../services/accountService';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const list = await Withdrawal.find().sort({ date: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { amount, type, notes } = req.body;
    const account = await getOrCreateAccount();

    const entry = await Withdrawal.create({
      amount,
      type,
      notes,
      taxReserve: 0,
    });

    if (type === 'Withdrawal') {
      await updateAccount({
        currentBalance: account.currentBalance - amount,
        totalWithdrawn: account.totalWithdrawn + amount,
      });
    } else {
      await updateAccount({
        currentBalance: account.currentBalance + amount,
        totalDeposited: account.totalDeposited + amount,
      });
    }

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;