// backend/src/services/ethPrice.ts
// Same Kraken WebSocket pattern as goldPrice.ts, for the ETH/USD pair, so
// the Dashboard's ETHUSD tile is backed by the same live feed
// infrastructure as gold rather than a one-off fetch.
import WebSocket from 'ws';
import { redis } from './redis';
import { recordPrice, getSentiment, type Sentiment } from './priceSentiment';

const KRAKEN_WS = 'wss://ws.kraken.com/v2';
const KRAKEN_SYMBOL = 'ETH/USD';
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
  console.log('🔌 Connecting to Kraken ETH/USD stream...');
  ws = new WebSocket(KRAKEN_WS);

  ws.on('open', () => {
    console.log('✅ Kraken ETH/USD WebSocket connected');
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
    console.warn('🔌 Kraken ETH/USD WebSocket closed — reconnecting in 5s');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('❌ Kraken ETH/USD WebSocket error:', err.message);
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
