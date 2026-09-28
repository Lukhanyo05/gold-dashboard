// backend/src/services/priceSentiment.ts
//
// A lightweight, honest "market sentiment" signal derived from the same
// live price ticks already streaming in from Binance for GOLD (PAXGUSDT)
// and ETHUSD (ETHUSDT) — no separate news/sentiment API, no fabricated
// data. It's a momentum read (price now vs price ~1h ago), not a real
// sentiment index — labelled that way in the API response so the frontend
// doesn't overstate it.
//
// There is deliberately no "Dollar" sentiment here: the price feeds this
// app has (Binance crypto pairs, both quoted in USDT) don't give a real
// USD strength/index reading. Faking one from unrelated data would just
// be another wrong number on the Dashboard. A real DXY/forex feed would
// need a separate data source (e.g. a forex API) — flagged as a possible
// follow-up rather than guessed at here.

export type SentimentLabel = 'Bullish' | 'Bearish' | 'Neutral';

export interface Sentiment {
  changePercent: number;
  label: SentimentLabel;
  windowMinutes: number;
}

interface Sample {
  price: number;
  ts: number;
}

const WINDOW_MS = 60 * 60 * 1000; // track the trailing 1 hour of ticks
const BULLISH_THRESHOLD = 0.15; // %
const BEARISH_THRESHOLD = -0.15; // %

const history = new Map<string, Sample[]>();

export function recordPrice(symbol: string, price: number): void {
  const now = Date.now();
  const arr = history.get(symbol) ?? [];
  arr.push({ price, ts: now });

  const cutoff = now - WINDOW_MS;
  while (arr.length > 0 && arr[0].ts < cutoff) arr.shift();

  history.set(symbol, arr);
}

export function getSentiment(symbol: string): Sentiment | null {
  const arr = history.get(symbol);
  if (!arr || arr.length < 2) return null;

  const oldest = arr[0];
  const latest = arr[arr.length - 1];
  if (oldest.price <= 0) return null;

  const changePercent =
    Math.round(((latest.price - oldest.price) / oldest.price) * 10000) / 100;

  const label: SentimentLabel =
    changePercent > BULLISH_THRESHOLD
      ? 'Bullish'
      : changePercent < BEARISH_THRESHOLD
        ? 'Bearish'
        : 'Neutral';

  const windowMinutes = Math.max(1, Math.round((latest.ts - oldest.ts) / 60000));

  return { changePercent, label, windowMinutes };
}
