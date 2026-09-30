import WebSocket from 'ws';
import { redis } from './redis';
import { recordPrice, getSentiment, type Sentiment } from './priceSentiment';

// Binance geo-blocks connections from the US (451 Unavailable For Legal
// Reasons), which is where Render's free-tier servers run — so this uses
// Kraken's public ticker feed instead (Kraken is US-licensed and doesn't
// block it). PAXG/USD (a gold-backed token) stands in for spot XAU/USD,
// same approach as before, just a different exchange.
const KRAKEN_WS = 'wss://ws.kraken.com/v2';
const KRAKEN_SYMBOL = 'PAXG/USD';
const PRICE_KEY = 'gold:price';
const PRICE_TTL = 30; // seconds
const SENTIMENT_SYMBOL = 'GOLD';

export interface GoldPrice {
  price: number;
  source: 'paxg' | 'cache';
  updatedAt: string;
  sentiment?: Sentiment | null;
}

let lastPrice: number | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function connect() {
  console.log('🔌 Connecting to Kraken PAXG/USD stream...');
  ws = new WebSocket(KRAKEN_WS);

  ws.on('open', () => {
    console.log('✅ Kraken WebSocket connected');
    ws?.send(
      JSON.stringify({
        method: 'subscribe',
        params: { channel: 'ticker', symbol: [KRAKEN_SYMBOL] },
      })
    );
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Kraken v2 ticker messages: { channel: 'ticker', data: [{ symbol, last, ... }] }
      if (msg.channel !== 'ticker' || !Array.isArray(msg.data)) return;
      const price = parseFloat(msg.data[0]?.last);
      if (!isNaN(price) && price > 0) {
        lastPrice = price;
        recordPrice(SENTIMENT_SYMBOL, price);
        await redis.setex(
          PRICE_KEY,
          PRICE_TTL,
          JSON.stringify({
            price,
            source: 'paxg',
            updatedAt: new Date().toISOString(),
          })
        );
      }
    } catch (err) {
      console.error('Parse error:', (err as Error).message);
    }
  });

  ws.on('close', () => {
    console.warn('🔌 Kraken WebSocket closed — reconnecting in 5s');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('❌ Kraken WebSocket error:', err.message);
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

export function startGoldPriceFeed() {
  connect();
}

export async function getLatestGoldPrice(): Promise<GoldPrice | null> {
  const sentiment = getSentiment(SENTIMENT_SYMBOL);

  // Try cache first
  const cached = await redis.get(PRICE_KEY);
  if (cached) {
    return { ...(JSON.parse(cached) as GoldPrice), sentiment };
  }

  // Fallback: memory
  if (lastPrice != null) {
    return {
      price: lastPrice,
      source: 'cache',
      updatedAt: new Date().toISOString(),
      sentiment,
    };
  }

  return null;
}

export function stopGoldPriceFeed() {
  if (ws) ws.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
}
