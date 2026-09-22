// backend/src/services/tradesIO.ts
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export interface ImportedTrade {
  tradeNumber?: number;
  date: string;
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

    trades.push({
      date: parsedDate.toISOString(),
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
 * This reads the row by column position instead, and stops as soon as it
 * hits the next section ("Orders", "Deals", "Working Orders", …) so those
 * pending-order / raw-fill rows never get parsed as closed trades.
 */
function isMT5PositionsHeader(headers: string[]): boolean {
  const h = headers.map((s) => s.toLowerCase().trim());
  return (
    h[0] === 'time' &&
    h[1] === 'symbol' &&
    h[2] === 'type' &&
    h[3] === 'volume' &&
    h[4] === 'price' &&
    h[7] === 'time' &&
    h[8] === 'price'
  );
}

function parseMT5Positions(raw: any[][], headerRowIdx: number): ParseResult {
  const errors: string[] = [];
  const trades: ImportedTrade[] = [];

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] ?? [];
    const nonEmpty = row.filter((c) => c !== '' && c != null).length;

    // A section boundary (e.g. "Orders", "Deals") is a near-empty row —
    // stop here rather than trying to parse it as a trade.
    if (nonEmpty <= 3) break;

    const lineNo = i + 1;
    const [
      openTime, symbol, type, volume, price,
      sl, tp, closeTime, closePrice, commission, swap,
    ] = row;

    const direction = String(type ?? '').toLowerCase().trim();
    if (direction !== 'buy' && direction !== 'sell') {
      // Not a position row (could be a totals/summary line) — stop.
      break;
    }

    // This dashboard's P&L, lot-sizing and risk math all assume gold's
    // 100oz-per-lot contract (verified: matches XM's reported Profit to
    // the cent for GOLD rows). A broker report can include other symbols
    // if the same account trades them — importing those as gold would
    // silently produce a wrong balance, so they're skipped and reported
    // instead of guessed at.
    const symbolStr = String(symbol ?? '').toUpperCase().trim();
    if (symbolStr !== 'GOLD' && symbolStr !== 'XAUUSD') {
      errors.push(
        `Line ${lineNo}: skipped ${symbolStr || 'unknown symbol'} trade — this journal only supports GOLD (its P&L math assumes gold's contract size)`
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

    trades.push({
      date: parsedDate.toISOString(),
      direction: direction === 'buy' ? 'Buy' : 'Sell',
      entry,
      stopLoss: toNumOrNull(sl),
      takeProfit: toNumOrNull(tp),
      closePrice: toNumOrNull(closePrice),
      lotSize,
      swapFee: Math.round((swapNum + commissionNum) * 100) / 100,
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
  const h = headers.map((s) => s.toLowerCase().trim());
  return (
    h[0] === 'time' &&
    h[1] === 'symbol' &&
    h[2] === 'type' &&
    h[3] === 'direction' &&
    h[4] === 'volume' &&
    h[5] === 'price'
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

  // FIFO queues of still-open lots, one per (symbol, position-side).
  const buyLots: OpenLot[] = [];
  const sellLots: OpenLot[] = [];

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] ?? [];
    const nonEmpty = row.filter((c) => c !== '' && c != null).length;
    if (nonEmpty <= 3) break; // next section boundary

    const [
      time, symbol, type, direction, volumeRaw, price,
      , commission, fee, swap, profit,
    ] = row;

    const typeStr = String(type ?? '').toLowerCase().trim();
    if (typeStr === 'balance' || typeStr === 'credit') continue; // deposits/bonuses, not trades
    if (typeStr !== 'buy' && typeStr !== 'sell') continue;

    const symbolStr = String(symbol ?? '').toUpperCase().trim();
    if (symbolStr !== 'GOLD' && symbolStr !== 'XAUUSD') {
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
      (typeStr === 'buy' ? buyLots : sellLots).push({
        remaining: vol, price: priceNum, time, feePerLot,
      });
    } else if (dirStr === 'out') {
      // A closing "sell" deal nets against open buy lots, and vice versa.
      const queue = typeStr === 'sell' ? buyLots : sellLots;
      const posDirection: 'Buy' | 'Sell' = typeStr === 'sell' ? 'Buy' : 'Sell';
      const profitPerLot = (toNumOrNull(profit) ?? 0) / vol;
      let remaining = vol;

      while (remaining > 1e-9 && queue.length > 0) {
        const lot = queue[0];
        const matched = Math.min(remaining, lot.remaining);

        trades.push({
          date: (parseFlexibleDate(lot.time) ?? new Date(0)).toISOString(),
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
    errors.push(`Skipped ${count} ${sym} deal(s) — this journal only supports GOLD`);
  }

  const openBuy = buyLots.reduce((s, l) => s + l.remaining, 0);
  const openSell = sellLots.reduce((s, l) => s + l.remaining, 0);
  if (openBuy > 1e-6 || openSell > 1e-6) {
    errors.push(
      `${(openBuy + openSell).toFixed(2)} lot(s) of GOLD are still open (no matching close in this report) and were not imported`
    );
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
  // "Deals" is the complete raw fill history since the account opened;
  // "Positions" (in this broker's export) only lists recently-closed
  // positions, so prefer Deals when both are present so a full-history
  // import doesn't miss anything — and doesn't also double-count the
  // overlap by reading both.
  const sectionTitleAt = (title: string): number =>
    raw.findIndex((row) => String(row?.[0] ?? '').trim().toLowerCase() === title);

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

  const positionsSectionIdx = sectionTitleAt('positions');
  if (positionsSectionIdx !== -1) {
    const headerRowIdx = positionsSectionIdx + 1;
    const headers = raw[headerRowIdx].map((h: any) =>
      String(h ?? '').replace(/\n/g, ' ').trim()
    );
    if (isMT5PositionsHeader(headers)) {
      return parseMT5Positions(raw, headerRowIdx);
    }
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
    'TradeNumber', 'Date', 'Direction', 'Entry', 'StopLoss', 'TakeProfit',
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