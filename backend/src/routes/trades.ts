import { Router } from 'express';
import { Trade } from '../models/Trade';
import { getOrCreateAccount, updateAccount } from '../services/accountService';
import {
  calculateLotSize,
  calculatePnL,
  calculateRMultiple,
} from '../services/lotSizing';
import { reserveForTax } from '../services/taxCalculator';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { parseTradesAuto, tradesToCSV } from '../services/tradesIO';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/**
 * GET /api/trades/export — download all trades as CSV or XLSX.
 * Query: ?format=csv|xlsx
 */
router.get('/export', async (req, res) => {
  try {
    const format = (req.query.format as string) || 'csv';
    const trades = await Trade.find().sort({ tradeNumber: 1 }).lean();

    const rows = trades.map((t: any) => ({
      TradeNumber: t.tradeNumber ?? '',
      Date: t.date ? new Date(t.date).toISOString() : '',
      Direction: t.direction ?? '',
      Entry: t.entry ?? '',
      StopLoss: t.stopLoss ?? '',
      TakeProfit: t.takeProfit ?? '',
      ClosePrice: t.closePrice ?? '',
      LotSize: t.lotSize ?? '',
      SwapFee: t.swapFee ?? 0,
      BalanceBefore: t.balanceBefore ?? '',
      BalanceAfter: t.balanceAfter ?? '',
      Result: t.result ?? '',
      RMultiple: t.rMultiple ?? '',
      Notes: t.notes ?? '',
    }));

    const headers = [
      'TradeNumber', 'Date', 'Direction', 'Entry', 'StopLoss', 'TakeProfit',
      'ClosePrice', 'LotSize', 'SwapFee', 'BalanceBefore', 'BalanceAfter',
      'Result', 'RMultiple', 'Notes',
    ];

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Trades');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="gold-trades-${stamp}.xlsx"`
      );
      return res.send(buf);
    }

    const csv = tradesToCSV(trades);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="gold-trades-${stamp}.csv"`
    );
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/trades/import — accept multipart file (CSV or XLSX), parse, insert,
 * recompute balance cascade + tax reserve.
 */
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded. Send multipart/form-data with a "file" field.',
      });
    }

    const { trades: parsed, errors } = parseTradesAuto(
      req.file.buffer,
      req.file.originalname
    );

    if (parsed.length === 0) {
      return res.status(400).json({
        error: 'No valid trades found in file',
        parseErrors: errors.slice(0, 20),
      });
    }

    const account = await getOrCreateAccount();
    let balance = account.currentBalance;
    let taxReserveDelta = 0;
    let inserted = 0;

    const lastTrade = await Trade.findOne().sort({ tradeNumber: -1 });
    let nextNumber = (lastTrade?.tradeNumber ?? 0) + 1;

    const createdTrades = [];

    for (const t of parsed) {
      const slPoints = t.stopLoss != null ? Math.abs(t.entry - t.stopLoss) : 0;

      let result: 'Win' | 'Loss' | 'Breakeven' | 'Manual' | 'Open' = 'Open';
      let pnl: number | null = null;
      let rMultiple: number | undefined;
      let balanceAfter: number | undefined;

      if (t.closePrice != null) {
        pnl =
          t.direction === 'Buy'
            ? (t.closePrice - t.entry) * t.lotSize * 100
            : (t.entry - t.closePrice) * t.lotSize * 100;
        const totalPnl = pnl + (t.swapFee ?? 0);

        if (t.takeProfit != null && Math.abs(t.closePrice - t.takeProfit) < 0.05) {
          result = 'Win';
        } else if (t.stopLoss != null && Math.abs(t.closePrice - t.stopLoss) < 0.05) {
          result = 'Loss';
        } else if (Math.abs(totalPnl) < 0.5) {
          result = 'Breakeven';
        } else {
          result = 'Manual';
        }

        const risked = slPoints > 0 ? slPoints * t.lotSize * 100 : Math.abs(totalPnl);
        rMultiple = risked === 0 ? 0 : Math.round((totalPnl / risked) * 100) / 100;

        balanceAfter = balance + totalPnl;
        if (totalPnl > 0) {
          taxReserveDelta += Math.round(totalPnl * account.taxRate * 100) / 100;
        }
      }

      const doc = await Trade.create({
        tradeNumber: nextNumber++,
        date: new Date(t.date),
        direction: t.direction,
        entry: t.entry,
        stopLoss: t.stopLoss ?? null,
        takeProfit: t.takeProfit ?? null,
        closePrice: t.closePrice ?? null,
        lotSize: t.lotSize,
        swapFee: t.swapFee ?? 0,
        balanceBefore: balance,
        balanceAfter,
        result,
        rMultiple,
        notes: t.notes,
      });

      if (balanceAfter != null) balance = balanceAfter;
      createdTrades.push(doc);
      inserted++;
    }

    await updateAccount({
      currentBalance: balance,
      taxReserve: account.taxReserve + taxReserveDelta,
    });

    res.json({
      inserted,
      skipped: errors.length,
      parseErrors: errors.slice(0, 20),
      newBalance: balance,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/', async (_req, res) => {
  try {
    const trades = await Trade.find().sort({ date: -1 }).limit(500);
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/trades — create a new trade.
 */
router.post('/', async (req, res) => {
  try {
    const account = await getOrCreateAccount();
    const {
      date,
      direction,
      entry,
      stopLoss,
      takeProfit,
      lotSize: providedLot,
      swapFee = 0,
      closePrice,
      notes,
    } = req.body;

    const slPoints = stopLoss ? Math.abs(entry - stopLoss) : 0;
    const lotSize =
      providedLot ??
      (slPoints > 0
        ? calculateLotSize({
            balance: account.currentBalance,
            riskPercent: account.riskPerTrade,
            stopLossPoints: slPoints,
          }).lot
        : 0.01);

    const lastTrade = await Trade.findOne().sort({ tradeNumber: -1 });
    const tradeNumber = (lastTrade?.tradeNumber ?? 0) + 1;

    const trade = new Trade({
      tradeNumber,
      date: date ? new Date(date) : new Date(),
      direction,
      entry,
      stopLoss,
      takeProfit,
      lotSize,
      swapFee,
      balanceBefore: account.currentBalance,
      closePrice,
      notes,
    });

    if (closePrice != null) {
      const pnl = calculatePnL(direction, entry, closePrice, lotSize);
      const totalPnl = pnl + swapFee;
      const risked = slPoints > 0 ? slPoints * lotSize * 100 : Math.abs(totalPnl);

      trade.balanceAfter = account.currentBalance + totalPnl;
      trade.rMultiple = calculateRMultiple(totalPnl, risked);

      if (trade.takeProfit && Math.abs(closePrice - trade.takeProfit) < 0.05) {
        trade.result = 'Win';
      } else if (stopLoss && Math.abs(closePrice - stopLoss) < 0.05) {
        trade.result = 'Loss';
      } else if (Math.abs(totalPnl) < 0.5) {
        trade.result = 'Breakeven';
      } else {
        trade.result = 'Manual';
      }

      const taxReserve = reserveForTax(totalPnl, account.taxRate);
      await updateAccount({
        currentBalance: trade.balanceAfter,
        taxReserve: account.taxReserve + taxReserve,
      });
    } else {
      trade.result = 'Open';
    }

    await trade.save();
    res.status(201).json(trade);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const trade = await Trade.findById(req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const account = await getOrCreateAccount();
    const trade = await Trade.findById(req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    const wasOpen = trade.result === 'Open' || trade.balanceAfter == null;
    const previousBalanceAfter = trade.balanceAfter;

    const { closePrice, stopLoss, takeProfit, lotSize, swapFee, notes } = req.body;

    if (closePrice !== undefined) trade.closePrice = closePrice;
    if (stopLoss !== undefined) trade.stopLoss = stopLoss;
    if (takeProfit !== undefined) trade.takeProfit = takeProfit;
    if (lotSize !== undefined) trade.lotSize = lotSize;
    if (swapFee !== undefined) trade.swapFee = swapFee;
    if (notes !== undefined) trade.notes = notes;

    if (wasOpen && trade.closePrice != null) {
      const slPoints =
        trade.stopLoss != null ? Math.abs(trade.entry - trade.stopLoss) : 0;

      const pnl =
        trade.direction === 'Buy'
          ? (trade.closePrice - trade.entry) * trade.lotSize * 100
          : (trade.entry - trade.closePrice) * trade.lotSize * 100;

      const totalPnl = pnl + trade.swapFee;
      const risked = slPoints > 0 ? slPoints * trade.lotSize * 100 : Math.abs(totalPnl);

      trade.balanceAfter = trade.balanceBefore + totalPnl;
      trade.rMultiple =
        risked === 0 ? 0 : Math.round((totalPnl / risked) * 100) / 100;

      if (trade.takeProfit != null && Math.abs(trade.closePrice - trade.takeProfit) < 0.05) {
        trade.result = 'Win';
      } else if (trade.stopLoss != null && Math.abs(trade.closePrice - trade.stopLoss) < 0.05) {
        trade.result = 'Loss';
      } else if (Math.abs(totalPnl) < 0.5) {
        trade.result = 'Breakeven';
      } else {
        trade.result = 'Manual';
      }

      const balanceDelta = totalPnl;
      const taxReserve =
        totalPnl > 0 ? Math.round(totalPnl * account.taxRate * 100) / 100 : 0;

      await updateAccount({
        currentBalance: account.currentBalance + balanceDelta,
        taxReserve: account.taxReserve + taxReserve,
      });
    } else if (!wasOpen && trade.closePrice != null && previousBalanceAfter != null) {
      const slPoints =
        trade.stopLoss != null ? Math.abs(trade.entry - trade.stopLoss) : 0;

      const pnl =
        trade.direction === 'Buy'
          ? (trade.closePrice - trade.entry) * trade.lotSize * 100
          : (trade.entry - trade.closePrice) * trade.lotSize * 100;

      const totalPnl = pnl + trade.swapFee;
      const risked = slPoints > 0 ? slPoints * trade.lotSize * 100 : Math.abs(totalPnl);

      const newBalanceAfter = trade.balanceBefore + totalPnl;
      const balanceAdjustment = newBalanceAfter - previousBalanceAfter;

      trade.balanceAfter = newBalanceAfter;
      trade.rMultiple =
        risked === 0 ? 0 : Math.round((totalPnl / risked) * 100) / 100;

      if (trade.takeProfit != null && Math.abs(trade.closePrice - trade.takeProfit) < 0.05) {
        trade.result = 'Win';
      } else if (trade.stopLoss != null && Math.abs(trade.closePrice - trade.stopLoss) < 0.05) {
        trade.result = 'Loss';
      } else if (Math.abs(totalPnl) < 0.5) {
        trade.result = 'Breakeven';
      } else {
        trade.result = 'Manual';
      }

      await updateAccount({
        currentBalance: account.currentBalance + balanceAdjustment,
      });
    }

    await trade.save();
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await Trade.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Trade not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;