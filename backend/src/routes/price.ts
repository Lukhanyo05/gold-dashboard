import { Router } from 'express';
import { getLatestGoldPrice } from '../services/goldPrice';
import { getLatestEthPrice } from '../services/ethPrice';

const router = Router();

router.get('/gold', async (_req, res) => {
  const price = await getLatestGoldPrice();
  if (!price) {
    return res.status(503).json({ error: 'Price feed warming up' });
  }
  res.json(price);
});

router.get('/eth', async (_req, res) => {
  const price = await getLatestEthPrice();
  if (!price) {
    return res.status(503).json({ error: 'Price feed warming up' });
  }
  res.json(price);
});

export default router;