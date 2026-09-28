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
import type { TradeSymbol } from '../types';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// Trade screenshots are stored inline as base64 data: URIs (no external
// storage configured), so they're capped well below Mongo's 16MB document
// limit — ~2MB of image data, which base64 inflates by ~33%.
const SCREENSHOT_MAX_CHARS = 2.8 * 1024 * 1024;

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
      Symbol: t.symbol ?? 'GOLD',
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
      Setup: t.setup ?? '',
      Tags: Array.isArray(t.tags) ? t.tags.join(';') : '',
      FollowedPlan: t.followedPlan == null ? '' : t.followedPlan ? 'Yes' : 'No',
      Notes: t.notes ?? '',
    }));

    const headers = [
      'TradeNumber', 'Date', 'Symbol', 'Direction', 'Entry', 'StopLoss', 'TakeProfit',
      'ClosePrice', 'LotSize', 'SwapFee', 'BalanceBefore', 'BalanceAfter',
      'Result', 'RMultiple', 'Setup', 'Tags', 'FollowedPlan', 'Notes',
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

    // multer puts non-file fields on req.body even for multipart/form-data
    const sinceRaw = (req.body?.since as string | undefined)?.trim();
    const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
    if (sinceRaw && sinceDate && isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: `Invalid "since" date: "${sinceRaw}"` });
    }

    const { trades: parsed, errors } = parseTradesAuto(
      req.file.buffer,
      req.file.originalname,
      sinceDate
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
    let duplicates = 0;

    const lastTrade = await Trade.findOne().sort({ tradeNumber: -1 });
    let nextNumber = (lastTrade?.tradeNumber ?? 0) + 1;

    const createdTrades = [];

    // Guard against importing the same underlying broker trade twice (e.g.
    // re-uploading an overlapping date range, or the same report a second
    // time). Two trades are the same one if they share symbol, direction,
    // entry, close price, lot size and open time — that combination is
    // effectively unique for a real trade. Loaded once up front rather than
    // querying per row.
    const fingerprint = (x: {
      symbol?: string;
      direction: string;
      entry: number;
      closePrice?: number | null;
      lotSize: number;
      date: string | Date;
    }) =>
      [
        x.symbol ?? 'GOLD',
        x.direction,
        x.entry.toFixed(2),
        x.closePrice != null ? x.closePrice.toFixed(2) : 'open',
        x.lotSize.toFixed(2),
        // Round to the nearest minute rather than exact millisecond — the
        // same broker trade parsed via the MT5 "Positions" section vs the
        // "Deals" section can end up with timestamps a second or two apart
        // even though it's the same real-world trade.
        Math.round(new Date(x.date).getTime() / 60000),
      ].join('|');

    const existingTrades = await Trade.find(
      {},
      'symbol direction entry closePrice lotSize date'
    ).lean();
    const seen = new Set(existingTrades.map((x) => fingerprint(x as any)));

    for (const t of parsed) {
      if (seen.has(fingerprint(t))) {
        duplicates++;
        errors.push(
          `Skipped duplicate ${t.symbol ?? 'GOLD'} trade opened ${t.date} — already in your journal`
        );
        continue;
      }
      seen.add(fingerprint(t));
      const slPoints = t.stopLoss != null ? Math.abs(t.entry - t.stopLoss) : 0;

      let result: 'Win' | 'Loss' | 'Breakeven' | 'Manual' | 'Open' = 'Open';
      let pnl: number | null = null;
      let rMultiple: number | undefined;
      let balanceAfter: number | undefined;

      if (t.closePrice != null) {
        // When the parser already knows the broker's own realized profit
        // for this trade (e.g. reconstructed from an MT5 Deals ledger),
        // use that directly rather than re-deriving it from entry/close —
        // it's ground truth and avoids compounding rounding drift across
        // a large import. This is required (not just preferred) for any
        // symbol other than GOLD, since the (close - entry) * lot * 100
        // formula only holds for GOLD's 100oz contract.
        let totalPnl: number;
        if (t.profit != null) {
          // t.profit is the broker's raw trading profit for this fill —
          // it does NOT include swap/commission (those are the separate
          // Swap/Commission columns in the MT5 report, already captured
          // in t.swapFee). The balance-affecting total has to add them
          // back in, the same as every other branch below does, or the
          // journal's balance silently drifts from the broker's real
          // account balance by the sum of every trade's swap/commission.
          pnl = t.profit;
          totalPnl = pnl + (t.swapFee ?? 0);
        } else if (t.symbol === 'GOLD') {
          pnl =
            t.direction === 'Buy'
              ? (t.closePrice - t.entry) * t.lotSize * 100
              : (t.entry - t.closePrice) * t.lotSize * 100;
          totalPnl = pnl + (t.swapFee ?? 0);
        } else {
          errors.push(
            `Skipped a ${t.symbol} trade (opened ${t.date}) — no broker profit figure to import it accurately`
          );
          continue;
        }

        if (t.takeProfit != null && Math.abs(t.closePrice - t.takeProfit) < 0.05) {
          result = 'Win';
        } else if (t.stopLoss != null && Math.abs(t.closePrice - t.stopLoss) < 0.05) {
          result = 'Loss';
        } else if (Math.abs(totalPnl) < 0.5) {
          result = 'Breakeven';
        } else {
          result = 'Manual';
        }

        // R-multiple needs a real Stop Loss to mean anything — without one
        // there's no "amount risked" to divide by, so leaving it unset
        // (rather than defaulting to |pnl|, which makes every trade a
        // meaningless exactly-±1) is the honest answer for imported trades
        // that don't carry SL (e.g. from an MT5 Deals ledger).
        if (slPoints > 0) {
          const risked = slPoints * t.lotSize * 100;
          rMultiple = risked === 0 ? 0 : Math.round((totalPnl / risked) * 100) / 100;
        }

        balanceAfter = balance + totalPnl;
        if (totalPnl > 0) {
          taxReserveDelta += Math.round(totalPnl * account.taxRate * 100) / 100;
        }
      }

      const doc = await Trade.create({
        tradeNumber: nextNumber++,
        date: new Date(t.date),
        symbol: t.symbol ?? 'GOLD',
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
      duplicates,
      parseErrors: errors.slice(0, 20),
      newBalance: balance,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const KNOWN_SYMBOLS: TradeSymbol[] = ['GOLD', 'ETHUSD'];

/**
 * GET /api/trades/tags — distinct tag values in use, for filter chips /
 * autocomplete. Registered before "/:id" isn't needed here since this is
 * mounted before the param routes below, but keep it above "/" too so it
 * never gets shadowed if routes are reordered.
 */
router.get('/meta/tags', async (_req, res) => {
  try {
    const tags = await Trade.distinct('tags');
    res.json((tags as string[]).filter(Boolean).sort());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/', async (req, res) => {
  try {
    const raw = (req.query.symbol as string | undefined)?.trim().toUpperCase();
    const filter: { symbol?: TradeSymbol; tags?: string; setup?: string } = {};
    if (raw && KNOWN_SYMBOLS.includes(raw as TradeSymbol)) {
      filter.symbol = raw as TradeSymbol;
    }
    const tag = (req.query.tag as string | undefined)?.trim();
    if (tag) filter.tags = tag;
    const setup = (req.query.setup as string | undefined)?.trim();
    if (setup) filter.setup = setup;
    const trades = await Trade.find(filter).sort({ date: -1 }).limit(500);
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
      symbol = 'GOLD',
      direction,
      entry,
      stopLoss,
      takeProfit,
      lotSize: providedLot,
      swapFee = 0,
      closePrice,
      notes,
      tags,
      setup,
      followedPlan,
      mistakes,
      screenshot,
    } = req.body;

    if (screenshot && String(screenshot).length > SCREENSHOT_MAX_CHARS) {
      return res.status(400).json({ error: 'Screenshot is too large — please use an image under ~2MB' });
    }

    // Manual entry/edit math (lot sizing, P&L, R-multiple) assumes GOLD's
    // 100oz contract throughout this route. ETHUSD trades come in fine via
    // import (which uses the broker's own reported profit), but a manually
    // closed ETHUSD trade can't be priced accurately here yet.
    if (symbol === 'ETHUSD' && closePrice != null) {
      return res.status(400).json({
        error: 'Manually closing an ETHUSD trade isn’t supported yet — import it from your broker report instead so the real profit is used.',
      });
    }

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
      symbol,
      direction,
      entry,
      stopLoss,
      takeProfit,
      lotSize,
      swapFee,
      balanceBefore: account.currentBalance,
      closePrice,
      notes,
      tags: Array.isArray(tags) ? tags : [],
      setup: setup || null,
      followedPlan: followedPlan ?? null,
      mistakes: Array.isArray(mistakes) ? mistakes : [],
      screenshot: screenshot || null,
    });

    if (closePrice != null) {
      const pnl = calculatePnL(direction, entry, closePrice, lotSize);
      const totalPnl = pnl + swapFee;
      trade.balanceAfter = account.currentBalance + totalPnl;
      // See note in POST /import — no real Stop Loss means no meaningful
      // R-multiple, so it's left unset rather than faked as ±1.
      if (slPoints > 0) {
        const risked = slPoints * lotSize * 100;
        trade.rMultiple = calculateRMultiple(totalPnl, risked);
      }

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

    const {
      closePrice,
      stopLoss,
      takeProfit,
      lotSize,
      swapFee,
      notes,
      tags,
      setup,
      followedPlan,
      mistakes,
      screenshot,
    } = req.body;

    if (screenshot && String(screenshot).length > SCREENSHOT_MAX_CHARS) {
      return res.status(400).json({ error: 'Screenshot is too large — please use an image under ~2MB' });
    }

    // See note in POST / — manual close/edit math assumes GOLD's contract
    // size, so a manually-set close price on an ETHUSD trade can't be
    // priced accurately here yet. Only block an actual change — resaving
    // the same value (e.g. editing just the notes on an already-imported,
    // already-closed ETHUSD trade) is fine since nothing gets recomputed.
    const closePriceChanged =
      closePrice != null &&
      (trade.closePrice == null || Math.abs(closePrice - trade.closePrice) > 1e-9);
    if (trade.symbol === 'ETHUSD' && closePriceChanged) {
      return res.status(400).json({
        error: 'Manually closing or re-pricing an ETHUSD trade isn’t supported yet — import it from your broker report instead so the real profit is used.',
      });
    }

    if (closePrice !== undefined) trade.closePrice = closePrice;
    if (stopLoss !== undefined) trade.stopLoss = stopLoss;
    if (takeProfit !== undefined) trade.takeProfit = takeProfit;
    if (lotSize !== undefined) trade.lotSize = lotSize;
    if (swapFee !== undefined) trade.swapFee = swapFee;
    if (notes !== undefined) trade.notes = notes;
    if (tags !== undefined) trade.tags = Array.isArray(tags) ? tags : [];
    if (setup !== undefined) trade.setup = setup || null;
    if (followedPlan !== undefined) trade.followedPlan = followedPlan;
    if (mistakes !== undefined) trade.mistakes = Array.isArray(mistakes) ? mistakes : [];
    if (screenshot !== undefined) trade.screenshot = screenshot || null;

    if (wasOpen && trade.closePrice != null) {
      const slPoints =
        trade.stopLoss != null ? Math.abs(trade.entry - trade.stopLoss) : 0;

      const pnl =
        trade.direction === 'Buy'
          ? (trade.closePrice - trade.entry) * trade.lotSize * 100
          : (trade.entry - trade.closePrice) * trade.lotSize * 100;

      const totalPnl = pnl + trade.swapFee;

      trade.balanceAfter = trade.balanceBefore + totalPnl;
      // No real Stop Loss → no meaningful R-multiple; leave unset rather
      // than faking ±1 (see note in POST /import).
      if (slPoints > 0) {
        const risked = slPoints * trade.lotSize * 100;
        trade.rMultiple = risked === 0 ? 0 : Math.round((totalPnl / risked) * 100) / 100;
      } else {
        trade.rMultiple = undefined;
      }

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
    } else if (
      !wasOpen &&
      trade.closePrice != null &&
      previousBalanceAfter != null &&
      trade.symbol !== 'ETHUSD'
      // ETHUSD trades are only ever closed via import (broker-exact
      // profit) — skip this GOLD-formula recompute entirely so re-saving
      // an unrelated field (notes, say) on an already-closed ETHUSD trade
      // can't silently overwrite its correct imported P&L with a wrong one.
    ) {
      const slPoints =
        trade.stopLoss != null ? Math.abs(trade.entry - trade.stopLoss) : 0;

      const pnl =
        trade.direction === 'Buy'
          ? (trade.closePrice - trade.entry) * trade.lotSize * 100
          : (trade.entry - trade.closePrice) * trade.lotSize * 100;

      const totalPnl = pnl + trade.swapFee;

      const newBalanceAfter = trade.balanceBefore + totalPnl;
      const balanceAdjustment = newBalanceAfter - previousBalanceAfter;

      trade.balanceAfter = newBalanceAfter;
      // No real Stop Loss → no meaningful R-multiple; leave unset rather
      // than faking ±1 (see note in POST /import).
      if (slPoints > 0) {
        const risked = slPoints * trade.lotSize * 100;
        trade.rMultiple = risked === 0 ? 0 : Math.round((totalPnl / risked) * 100) / 100;
      } else {
        trade.rMultiple = undefined;
      }

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