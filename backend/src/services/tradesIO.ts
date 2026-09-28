// backend/src/services/tradesIO.ts
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export type TradeSymbol = 'GOLD' | 'ETHUSD';

export interface ImportedTrade {
  tradeNumber?: number;
  date: string;
  symbol: TradeSymbol;
  direction: 'Buy' | 'Sell';
  entry: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  closePrice?: number | null;
  lotSize: number;
  swapFee?: number;
  notes?: string;
  /**
   * The broker's own realized profit for this trade, when known exactly
   * (e.g. reconstructed from a MetaTrader Deals ledger). When present,
   * the import route should use this instead of recomputing P&L from
   * entry/close/lotSize — it's ground truth, not an approximation.
   */
  profit?: number;
}

export interface ParseResult {
  trades: ImportedTrade[];
  errors: string[];
}

const norm = (s: string) => String(s).toLowerCase().replace(/[\s_]+/g, '');

/**
 * This journal supports GOLD (XAUUSD, 100oz/lot contract) and ETHUSD.
 * Import-time P&L for both always comes from the broker's own reported
 * Profit (see parseMT5Deals / parseMT5Positions notes) rather than a
 * recomputed price-difference formula, so both reconcile exactly to the
 * broker's numbers on import regardless of each symbol's contract math.
 * Any other symbol is skipped rather than guessed at.
 */
function resolveSymbol(raw: unknown): TradeSymbol | null {
  const s = String(raw ?? '').toUpperCase().replace(/[\s_/]+/g, '');
  if (s === 'GOLD' || s === 'XAUUSD') return 'GOLD';
  if (s === 'ETHUSD' || s === 'ETHUSDT') return 'ETHUSD';
  return null;
}

function parseFlexibleDate(input: unknown): Date | null {
  if (input == null || input === '') return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  const s = String(input).trim();
  if (!s) return null;

  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  const ymd = s.match(
    /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (ymd) {
    const [, y, mo, da, h = '0', mi = '0', se = '0'] = ymd;
    d = new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi, +se));
    if (!isNaN(d.getTime())) return d;
  }

  const dmy = s.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (dmy) {
    const [, da, mo, y, h = '0', mi = '0', se = '0'] = dmy;
    d = new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi, +se));
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function toNumOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

export function normalizeRows(rows: Record<string, any>[]): ParseResult {
  const errors: string[] = [];
  const trades: ImportedTrade[] = [];

  rows.forEach((raw, idx) => {
    const lineNo = idx + 2;
    const r: Record<string, any> = {};
    for (const k of Object.keys(raw)) r[norm(k)] = raw[k];

    const date      = r.date || r.datetime || r.opened || r.opentime;
    const symbolRaw = r.symbol || r.instrument || r.pair || 'GOLD';
    const direction = String(r.direction || r.side || r.type || '').toLowerCase();
    const entryRaw  = r.entry ?? r.entryprice ?? r.open ?? r.openprice;
    const lotRaw    = r.lotsize ?? r.lot ?? r.size ?? r.volume ?? r.quantity ?? '0.01';
    const slRaw     = r.stoploss ?? r.sl ?? '';
    const tpRaw     = r.takeprofit ?? r.tp ?? '';
    const closeRaw  = r.closeprice ?? r.close ?? r.exit ?? r.exitprice ?? '';
   const swapRaw   =
  r.swapfee ??
  r['swap/fee($)'] ??
  r.swap ??
  r.fee ??
  r.commission ??
  '0';
    const notes     = r.notes || r.note || r.comment || '';

    if (!date) {
      errors.push(`Line ${lineNo}: missing date`);
      return;
    }
    if (direction !== 'buy' && direction !== 'sell') {
      errors.push(`Line ${lineNo}: direction must be Buy or Sell (got "${direction}")`);
      return;
    }
    const entry = toNumOrNull(entryRaw);
    if (entry == null || entry <= 0) {
      errors.push(`Line ${lineNo}: invalid entry price "${entryRaw}"`);
      return;
    }
    const lotSize = toNumOrNull(lotRaw);
    if (lotSize == null || lotSize <= 0) {
      errors.push(`Line ${lineNo}: invalid lot size "${lotRaw}"`);
      return;
    }

    const parsedDate = parseFlexibleDate(date);
    if (!parsedDate) {
      errors.push(`Line ${lineNo}: unparseable date "${date}"`);
      return;
    }

    const symbol = resolveSymbol(symbolRaw);
    if (!symbol) {
      errors.push(
        `Line ${lineNo}: skipped "${symbolRaw}" — this journal only supports GOLD and ETHUSD`
      );
      return;
    }

    trades.push({
      date: parsedDate.toISOString(),
      symbol,
      direction: direction === 'buy' ? 'Buy' : 'Sell',
      entry,
      stopLoss: toNumOrNull(slRaw),
      takeProfit: toNumOrNull(tpRaw),
      closePrice: toNumOrNull(closeRaw),
      lotSize,
      swapFee: toNumOrNull(swapRaw) ?? 0,
      notes: notes || undefined,
    });
  });

  trades.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  return { trades, errors };
}

export function parseTradesCSV(csvText: string): ParseResult {
  if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);

  let rows: Record<string, any>[];
  try {
    rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true,
    });
  } catch (e) {
    return { trades: [], errors: [`CSV parse failed: ${(e as Error).message}`] };
  }

  return normalizeRows(rows);
}

/**
 * MT5 / MT4 broker "Trade History Report" exports (XM, Exness, IC Markets,
 * etc. all use this same MetaTrader layout) put closed positions in a
 * "Positions" block whose header row repeats "Time" and "Price" twice —
 * once for the open leg, once for the close leg:
 *
 *   Time | Symbol | Type | Volume | Price | S / L | T / P | Time | Price | Commission | Swap | Profit
 *   (open)                                (open)                (close)  (close)
 *
 * Because the two "Time" / "Price" headers are identical strings, mapping
 * rows to a name-keyed object (what the generic path below does) silently
 * drops the open time/price — the close-leg values just overwrite them.
 * This reads columns by NAME, resolved to positions once from the header
 * row (see `headerIndexMap`) — not by fixed position — because XM has been
 * seen to change the export layout (e.g. adding a "Position"/"Deal" ticket
 * ID column) between report downloads, which would silently shift every
 * fixed-position read by one. It stops as soon as it hits the next section
 * ("Orders", "Deals", "Working Orders", …) so those pending-order / raw-fill
 * rows never get parsed as closed trades.
 */

/**
 * Maps each normalized header name to every column index it appears at
 * (in order), so a report format that repeats a name (open/close "Time",
 * open/close "Price") or inserts an extra column can still be read
 * correctly by name instead of assuming a fixed position.
 */
function headerIndexMap(headers: string[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  headers.forEach((h, i) => {
    const key = norm(h);
    if (!key) return;
    const arr = map.get(key) ?? [];
    arr.push(i);
    map.set(key, arr);
  });
  return map;
}

function isMT5PositionsHeader(headers: string[]): boolean {
  const idx = headerIndexMap(headers);
  return (
    (idx.get('time')?.length ?? 0) >= 2 &&
    (idx.get('price')?.length ?? 0) >= 2 &&
    idx.has('symbol') &&
    idx.has('type') &&
    idx.has('volume')
  );
}

function parseMT5Positions(raw: any[][], headerRowIdx: number): ParseResult {
  const errors: string[] = [];
  const trades: ImportedTrade[] = [];

  const headers = raw[headerRowIdx].map((h: any) =>
    String(h ?? '').replace(/\n/g, ' ').trim()
  );
  const idx = headerIndexMap(headers);
  const [openTimeCol, closeTimeCol] = idx.get('time') ?? [];
  const [openPriceCol, closePriceCol] = idx.get('price') ?? [];
  const symbolCol = idx.get('symbol')?.[0];
  const typeCol = idx.get('type')?.[0];
  const volumeCol = idx.get('volume')?.[0];
  const slCol = idx.get('s/l')?.[0];
  const tpCol = idx.get('t/p')?.[0];
  const commissionCol = idx.get('commission')?.[0];
  const swapCol = idx.get('swap')?.[0];
  const profitCol = idx.get('profit')?.[0];

  if (
    openTimeCol == null || closeTimeCol == null ||
    openPriceCol == null || closePriceCol == null ||
    symbolCol == null || typeCol == null || volumeCol == null
  ) {
    return { trades: [], errors: ['Positions section header did not match the expected MT5 layout — columns could not be located by name'] };
  }

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] ?? [];
    const nonEmpty = row.filter((c) => c !== '' && c != null).length;

    // A section boundary (e.g. "Orders", "Deals") is a near-empty row —
    // stop here rather than trying to parse it as a trade.
    if (nonEmpty <= 3) break;

    const lineNo = i + 1;
    const openTime = row[openTimeCol];
    const symbol = row[symbolCol];
    const type = row[typeCol];
    const volume = row[volumeCol];
    const price = row[openPriceCol];
    const sl = slCol != null ? row[slCol] : null;
    const tp = tpCol != null ? row[tpCol] : null;
    const closeTime = row[closeTimeCol];
    const closePrice = row[closePriceCol];
    const commission = commissionCol != null ? row[commissionCol] : 0;
    const swap = swapCol != null ? row[swapCol] : 0;

    const direction = String(type ?? '').toLowerCase().trim();
    if (direction !== 'buy' && direction !== 'sell') {
      // Not a position row (could be a totals/summary line) — stop.
      break;
    }

    // This journal supports GOLD and ETHUSD. Any other symbol on the same
    // account is skipped and reported rather than guessed at.
    const resolvedSymbol = resolveSymbol(symbol);
    if (!resolvedSymbol) {
      errors.push(
        `Line ${lineNo}: skipped ${String(symbol ?? '').trim() || 'unknown symbol'} trade — this journal only supports GOLD and ETHUSD`
      );
      continue;
    }

    const parsedDate = parseFlexibleDate(openTime);
    if (!parsedDate) {
      errors.push(`Line ${lineNo}: unparseable open time "${openTime}"`);
      continue;
    }
    const entry = toNumOrNull(price);
    if (entry == null || entry <= 0) {
      errors.push(`Line ${lineNo}: invalid entry price "${price}"`);
      continue;
    }
    const lotSize = toNumOrNull(volume);
    if (lotSize == null || lotSize <= 0) {
      errors.push(`Line ${lineNo}: invalid volume "${volume}"`);
      continue;
    }

    const commissionNum = toNumOrNull(commission) ?? 0;
    const swapNum = toNumOrNull(swap) ?? 0;
    const closeTimeParsed = parseFlexibleDate(closeTime);
    // Use the broker's own reported Profit when the report includes it —
    // ground truth, and required for ETHUSD (whose P&L per point isn't a
    // clean multiplier the way GOLD's is). Falls back to a price-diff
    // recompute downstream only when this column is absent.
    const profitRaw = profitCol != null ? row[profitCol] : null;
    const profitNum = toNumOrNull(profitRaw);

    trades.push({
      date: parsedDate.toISOString(),
      symbol: resolvedSymbol,
      direction: direction === 'buy' ? 'Buy' : 'Sell',
      entry,
      stopLoss: toNumOrNull(sl),
      takeProfit: toNumOrNull(tp),
      closePrice: toNumOrNull(closePrice),
      lotSize,
      swapFee: Math.round((swapNum + commissionNum) * 100) / 100,
      ...(profitNum != null ? { profit: profitNum } : {}),
      notes: [symbol, closeTimeParsed ? `closed ${closeTimeParsed.toISOString()}` : null]
        .filter(Boolean)
        .join(' · '),
    });
  }

  trades.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  return { trades, errors };
}

/**
 * The "Deals" section of an MT5 "Trade History Report" is the raw fill
 * ledger — every order execution, going back to account opening — unlike
 * "Positions", which (in this broker's export) only lists recently closed
 * positions. Deals is the source to use for a full-history import.
 *
 * Deals has no position ID, so a closed position has to be inferred: an
 * "in" deal opens exposure, a later "out" deal of the opposite Type closes
 * it. On a hedge account (this one is) several positions of the same
 * symbol can be open at once and don't always close in the order they were
 * opened, and a close can be a different volume than the open it's netted
 * against (a 0.03-lot close matching three separate 0.01-lot opens, for
 * example). This uses FIFO lot matching — the same technique accounting
 * systems use for inventory/cost-basis matching — splitting either leg as
 * needed so every lot of volume is accounted for.
 *
 * Because that matching is inferred rather than given directly by the
 * broker, an individual reconstructed trade's entry/exit pairing is a
 * best-effort approximation when positions overlap or close out of order.
 * What is NOT approximate: every dollar of profit is the broker's own
 * reported Profit for that fill, split across matched lots by volume
 * share, so the imported total always reconciles exactly to the broker's
 * numbers even when a specific pairing is a reasonable guess.
 */
function isMT5DealsHeader(headers: string[]): boolean {
  const idx = headerIndexMap(headers);
  return (
    idx.has('time') &&
    idx.has('symbol') &&
    idx.has('type') &&
    idx.has('direction') &&
    idx.has('volume') &&
    idx.has('price')
  );
}

interface OpenLot {
  remaining: number;
  price: number;
  time: unknown;
  feePerLot: number;
}

function parseMT5Deals(raw: any[][], headerRowIdx: number): ParseResult {
  const errors: string[] = [];
  const trades: ImportedTrade[] = [];
  const skippedSymbols = new Map<string, number>();

  // FIFO queues of still-open lots, one pair per symbol so a GOLD deal
  // never gets matched against an open ETHUSD lot (or vice versa) when
  // both symbols appear in the same Deals ledger.
  const buyLotsBySymbol = new Map<TradeSymbol, OpenLot[]>();
  const sellLotsBySymbol = new Map<TradeSymbol, OpenLot[]>();
  const lotsFor = (sym: TradeSymbol, map: Map<TradeSymbol, OpenLot[]>): OpenLot[] => {
    let arr = map.get(sym);
    if (!arr) { arr = []; map.set(sym, arr); }
    return arr;
  };

  const headers = raw[headerRowIdx].map((h: any) =>
    String(h ?? '').replace(/\n/g, ' ').trim()
  );
  const idx = headerIndexMap(headers);
  const timeCol = idx.get('time')?.[0];
  const symbolCol = idx.get('symbol')?.[0];
  const typeCol = idx.get('type')?.[0];
  const directionCol = idx.get('direction')?.[0];
  const volumeCol = idx.get('volume')?.[0];
  const priceCol = idx.get('price')?.[0];
  const commissionCol = idx.get('commission')?.[0];
  const feeCol = idx.get('fee')?.[0];
  const swapCol = idx.get('swap')?.[0];
  const profitCol = idx.get('profit')?.[0];

  if (
    timeCol == null || symbolCol == null || typeCol == null ||
    directionCol == null || volumeCol == null || priceCol == null
  ) {
    return { trades: [], errors: ['Deals section header did not match the expected MT5 layout — columns could not be located by name'] };
  }

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] ?? [];
    const nonEmpty = row.filter((c) => c !== '' && c != null).length;
    if (nonEmpty <= 3) break; // next section boundary

    const time = row[timeCol];
    const symbol = row[symbolCol];
    const type = row[typeCol];
    const direction = row[directionCol];
    const volumeRaw = row[volumeCol];
    const price = row[priceCol];
    const commission = commissionCol != null ? row[commissionCol] : 0;
    const fee = feeCol != null ? row[feeCol] : 0;
    const swap = swapCol != null ? row[swapCol] : 0;
    const profit = profitCol != null ? row[profitCol] : 0;

    const typeStr = String(type ?? '').toLowerCase().trim();
    if (typeStr === 'balance' || typeStr === 'credit') continue; // deposits/bonuses, not trades
    if (typeStr !== 'buy' && typeStr !== 'sell') continue;

    const symbolStr = String(symbol ?? '').toUpperCase().trim();
    const resolvedSymbol = resolveSymbol(symbolStr);
    if (!resolvedSymbol) {
      skippedSymbols.set(symbolStr, (skippedSymbols.get(symbolStr) ?? 0) + 1);
      continue;
    }

    const vol = toNumOrNull(volumeRaw);
    const priceNum = toNumOrNull(price);
    if (vol == null || vol <= 0 || priceNum == null) {
      errors.push(`Line ${i + 1}: invalid deal row (volume "${volumeRaw}", price "${price}")`);
      continue;
    }
    const feePerLot = ((toNumOrNull(commission) ?? 0) + (toNumOrNull(fee) ?? 0) + (toNumOrNull(swap) ?? 0)) / vol;

    const dirStr = String(direction ?? '').toLowerCase().trim();
    if (dirStr === 'in') {
      lotsFor(resolvedSymbol, typeStr === 'buy' ? buyLotsBySymbol : sellLotsBySymbol).push({
        remaining: vol, price: priceNum, time, feePerLot,
      });
    } else if (dirStr === 'out') {
      // A closing "sell" deal nets against open buy lots, and vice versa.
      const queue = lotsFor(resolvedSymbol, typeStr === 'sell' ? buyLotsBySymbol : sellLotsBySymbol);
      const posDirection: 'Buy' | 'Sell' = typeStr === 'sell' ? 'Buy' : 'Sell';
      const profitPerLot = (toNumOrNull(profit) ?? 0) / vol;
      let remaining = vol;

      while (remaining > 1e-9 && queue.length > 0) {
        const lot = queue[0];
        const matched = Math.min(remaining, lot.remaining);

        trades.push({
          date: (parseFlexibleDate(lot.time) ?? new Date(0)).toISOString(),
          symbol: resolvedSymbol,
          direction: posDirection,
          entry: lot.price,
          stopLoss: null, // not present in a Deals ledger
          takeProfit: null,
          closePrice: priceNum,
          lotSize: Math.round(matched * 10000) / 10000,
          swapFee: Math.round(matched * (lot.feePerLot + feePerLot) * 100) / 100,
          profit: Math.round(matched * profitPerLot * 100) / 100,
          notes: [symbolStr, `closed ${parseFlexibleDate(time)?.toISOString() ?? ''}`]
            .filter(Boolean)
            .join(' · '),
        });

        lot.remaining -= matched;
        remaining -= matched;
        if (lot.remaining <= 1e-9) queue.shift();
      }

      if (remaining > 1e-9) {
        errors.push(
          `Line ${i + 1}: ${remaining.toFixed(2)} lot(s) of this close had no matching open position — skipped`
        );
      }
    }
  }

  for (const [sym, count] of skippedSymbols) {
    errors.push(`Skipped ${count} ${sym} deal(s) — this journal only supports GOLD and ETHUSD`);
  }

  for (const sym of new Set([...buyLotsBySymbol.keys(), ...sellLotsBySymbol.keys()])) {
    const openBuy = (buyLotsBySymbol.get(sym) ?? []).reduce((s, l) => s + l.remaining, 0);
    const openSell = (sellLotsBySymbol.get(sym) ?? []).reduce((s, l) => s + l.remaining, 0);
    if (openBuy > 1e-6 || openSell > 1e-6) {
      errors.push(
        `${(openBuy + openSell).toFixed(2)} lot(s) of ${sym} are still open (no matching close in this report) and were not imported`
      );
    }
  }

  trades.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  return { trades, errors };
}

export function parseTradesXlsx(buffer: Buffer): ParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (e) {
    return { trades: [], errors: [`XLSX read failed: ${(e as Error).message}`] };
  }

  // Prefer a sheet called "Journal" (case-insensitive); else pick the sheet
  // with the most rows, which is usually the data sheet not the instructions.
  let sheetName = wb.SheetNames.find((n) => /journal/i.test(n));
  if (!sheetName) {
    let bestRows = -1;
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) continue;
      const r = XLSX.utils.decode_range(ws['!ref']);
      const rows = r.e.r - r.s.r;
      if (rows > bestRows) { bestRows = rows; sheetName = name; }
    }
  }
  if (!sheetName) return { trades: [], errors: ['Workbook has no sheets'] };

  const ws = wb.Sheets[sheetName];
  if (!ws) return { trades: [], errors: [`Sheet "${sheetName}" not found`] };

  // Read rows as arrays (header: 1) so we can find the real header row,
  // because row 1 is often a title like "TRADE JOURNAL".
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  // A broker "Trade History Report" (MT5/MT4 — XM, Exness, IC Markets…) has
  // several sections, each a single-cell title row ("Positions", "Orders",
  // "Deals", "Working Orders", "Results") followed by its own header row.
  //
  // "Positions" is one row per closed position with the broker's own
  // Profit/Swap/Commission already attached directly — no inference needed.
  // "Deals" is the raw fill ledger; a closed position has to be reconstructed
  // from it via FIFO lot-matching, which is only a best-effort approximation
  // once a Hedge account has several overlapping same-symbol positions open
  // in both directions at once, and was confirmed (against a real XM export)
  // to badly miscount in exactly that case — Deals reconstructed $899.76 of
  // total P&L for an account whose broker-reported Results total was $25.34,
  // while Positions summed to that same $25.34 exactly. So Positions is
  // preferred whenever it's present and looks complete; Deals is only the
  // fallback for a report whose Positions section is genuinely partial (the
  // "Total Trades" figure in the Results section, when present, is what
  // decides "complete" — a broker that truly only lists recent positions
  // there will fail this check and fall through to Deals as before).
  const sectionTitleAt = (title: string): number =>
    raw.findIndex((row) => String(row?.[0] ?? '').trim().toLowerCase() === title);

  // Results section states the report's own trade count, e.g. a row like
  // ['Total Trades:', null, null, 219, 'Short Trades (won %):', ...] — used
  // only to sanity-check Positions' completeness, not as trade data itself.
  const reportedTotalTrades = (): number | null => {
    for (const row of raw) {
      const labelIdx = row.findIndex(
        (c) => String(c ?? '').trim().toLowerCase() === 'total trades:'
      );
      if (labelIdx === -1) continue;
      for (let j = labelIdx + 1; j < row.length; j++) {
        const n = toNumOrNull(row[j]);
        if (n != null) return n;
      }
    }
    return null;
  };

  const positionsSectionIdx = sectionTitleAt('positions');
  let positionsResult: ParseResult | null = null;
  if (positionsSectionIdx !== -1) {
    const headerRowIdx = positionsSectionIdx + 1;
    const headers = raw[headerRowIdx].map((h: any) =>
      String(h ?? '').replace(/\n/g, ' ').trim()
    );
    if (isMT5PositionsHeader(headers)) {
      positionsResult = parseMT5Positions(raw, headerRowIdx);
      const reported = reportedTotalTrades();
      // Allow a margin of 1 for a currently-open position with no close row.
      if (reported == null || positionsResult.trades.length >= reported - 1) {
        return positionsResult;
      }
    }
  }

  const dealsSectionIdx = sectionTitleAt('deals');
  if (dealsSectionIdx !== -1) {
    const headerRowIdx = dealsSectionIdx + 1;
    const headers = raw[headerRowIdx].map((h: any) =>
      String(h ?? '').replace(/\n/g, ' ').trim()
    );
    if (isMT5DealsHeader(headers)) {
      return parseMT5Deals(raw, headerRowIdx);
    }
  }

  // Positions existed but looked incomplete and there was no Deals section
  // to fall back to — better to return the partial Positions data (with a
  // note) than nothing.
  if (positionsResult) {
    positionsResult.errors.push(
      'Positions section looked shorter than the report\'s own Total Trades count, and no Deals section was available as a fallback — imported what was there.'
    );
    return positionsResult;
  }

  // Find the header row: the first row with >= 4 non-empty cells
  // whose content looks like column names (mostly non-numeric).
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const nonEmpty = raw[i].filter((c) => c !== '' && c != null).length;
    if (nonEmpty >= 4) { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) {
    return { trades: [], errors: ['Could not find a header row in sheet'] };
  }

  const headers = raw[headerRowIdx].map((h: any) =>
    String(h ?? '').replace(/\n/g, ' ').trim()
  );

  // Broker "Trade History Report" exports (MT5/MT4 — XM, Exness, IC Markets…)
  // have duplicate Time/Price columns that a name-keyed object can't
  // represent correctly. Detect and handle those with a dedicated parser.
  if (isMT5PositionsHeader(headers)) {
    return parseMT5Positions(raw, headerRowIdx);
  }

  // Convert remaining rows to objects keyed by header name
  const rows: Record<string, any>[] = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = row[idx] ?? '';
    });
    rows.push(obj);
  }

  return normalizeRows(rows);

}

export function tradesToCSV(trades: any[]): string {
  const headers = [
    'TradeNumber', 'Date', 'Symbol', 'Direction', 'Entry', 'StopLoss', 'TakeProfit',
    'ClosePrice', 'LotSize', 'SwapFee', 'BalanceBefore', 'BalanceAfter',
    'Result', 'RMultiple', 'Notes',
  ];

  const escape = (v: any): string => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [headers.join(',')];
  for (const t of trades) {
    lines.push(
      [
        t.tradeNumber,
        t.date instanceof Date ? t.date.toISOString() : t.date,
        t.symbol ?? 'GOLD',
        t.direction, t.entry, t.stopLoss, t.takeProfit, t.closePrice,
        t.lotSize, t.swapFee, t.balanceBefore, t.balanceAfter,
        t.result, t.rMultiple, t.notes,
      ].map(escape).join(',')
    );
  }

  return '\uFEFF' + lines.join('\n');
}

/**
 * Detect whether a buffer is XLSX (ZIP container), legacy XLS (OLE2), or text (CSV).
 */
function detectKind(buf: Buffer): 'xlsx' | 'xls' | 'csv' {
  if (buf.length >= 4) {
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
      return 'xlsx';
    }
    if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
      return 'xls';
    }
  }
  return 'csv';
}

/**
 * Content-sniffing entry point. Ignores file extension; trusts the bytes.
 */
export function parseTradesAuto(
  buf: Buffer,
  _originalName?: string,
  sinceDate?: Date | null
): ParseResult {
  const kind = detectKind(buf);

  const result =
    kind === 'xlsx' || kind === 'xls'
      ? parseTradesXlsx(buf)
      : parseTradesCSV(buf.toString('utf8'));

  if (!sinceDate || isNaN(sinceDate.getTime())) return result;

  const cutoff = sinceDate.getTime();
  const kept = result.trades.filter((t) => new Date(t.date).getTime() >= cutoff);
  const excluded = result.trades.length - kept.length;

  const errors = [...result.errors];
  if (excluded > 0) {
    errors.push(
      `Excluded ${excluded} trade(s) opened before ${sinceDate.toISOString().slice(0, 10)}`
    );
  }

  return { trades: kept, errors };
}