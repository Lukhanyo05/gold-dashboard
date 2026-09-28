// backend/src/services/ethPrice.ts
// Same Binance WebSocket pattern as goldPrice.ts, for the ETHUSDT pair,
// so the Dashboard's ETHUSD tile is backed by the same live feed
// infrastructure as gold rather than a one-off fetch.
import WebSocket from 'ws';
import { redis } from './redis';
import { recordPrice, getSentiment, type Sentiment } from './priceSentiment';

const BINANCE_WS = 'wss://stream.binance.com:9443/ws/ethusdt@trade';
const PRICE_KEY = 'eth:price';
const PRICE_TTL = 30; // seconds
const SENTIMENT_SYMBOL = 'ETHUSD';

export interface EthPrice {
  price: number;
  source: 'ethusdt' | 'cache';
  updatedAt: string;
  sentiment?: Sentiment | null;
}

let lastPrice: number | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function connect() {
  console.log('🔌 Connecting to Binance ETHUSDT stream...');
  ws = new WebSocket(BINANCE_WS);

  ws.on('open', () => console.log('✅ Binance ETHUSDT WebSocket connected'));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const price = parseFloat(msg.p);
      if (!isNaN(price) && price > 0) {
        lastPrice = price;
        recordPrice(SENTIMENT_SYMBOL, price);
        await redis.setex(
          PRICE_KEY,
          PRICE_TTL,
          JSON.stringify({
            price,
            source: 'ethusdt',
            updatedAt: new Date().toISOString(),
          })
        );
      }
    } catch (err) {
      console.error('Parse error:', (err as Error).message);
    }
  });

  ws.on('close', () => {
    console.warn('🔌 Binance ETHUSDT WebSocket closed — reconnecting in 5s');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('❌ Binance ETHUSDT WebSocket error:', err.message);
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

export function startEthPriceFeed() {
  connect();
}

export async function getLatestEthPrice(): Promise<EthPrice | null> {
  const sentiment = getSentiment(SENTIMENT_SYMBOL);

  const cached = await redis.get(PRICE_KEY);
  if (cached) {
    return { ...(JSON.parse(cached) as EthPrice), sentiment };
  }

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

export function stopEthPriceFeed() {
  if (ws) ws.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
}
