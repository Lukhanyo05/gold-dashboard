import { Router } from 'express';
import { getOrCreateAccount, updateAccount } from '../services/accountService';
import { calculateLotSize } from '../services/lotSizing';
import { calculateAnnualTax, effectiveTaxRate } from '../services/taxCalculator';
import { projectGrowth } from '../services/projection';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const account = await getOrCreateAccount();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/', async (req, res) => {
  try {
    const account = await updateAccount(req.body);
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/lot-size', async (req, res) => {
  try {
    const { stopLossPoints, riskPercent } = req.body;
    const account = await getOrCreateAccount();
    const result = calculateLotSize({
      balance: account.currentBalance,
      riskPercent: riskPercent ?? account.riskPerTrade,
      stopLossPoints: stopLossPoints ?? 20,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/tax-estimate', async (req, res) => {
  try {
    const { annualProfit } = req.body;
    const account = await getOrCreateAccount();
    const profit = annualProfit ?? account.currentBalance - account.startingBalance;

    res.json({
      annualProfit: profit,
      tax: calculateAnnualTax(profit),
      effectiveRate: effectiveTaxRate(profit),
      bracketTaxRate: account.taxRate,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/projection', async (req, res) => {
  try {
    const { monthlyPnL } = req.body;
    const account = await getOrCreateAccount();
    const result = projectGrowth({
      currentBalance: account.currentBalance,
      monthlyPnL: monthlyPnL ?? 0,
      withdrawalRate: account.withdrawalRate,
      targetBalance: account.targetBalance,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;