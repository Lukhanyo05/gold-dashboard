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
export function parseTradesAuto(buf: Buffer, _originalName?: string): ParseResult {
  const kind = detectKind(buf);

  if (kind === 'xlsx' || kind === 'xls') {
    return parseTradesXlsx(buf);
  }

  const text = buf.toString('utf8');
  return parseTradesCSV(text);
}