import WebSocket from 'ws';
import { redis } from './redis';

const BINANCE_WS = 'wss://stream.binance.com:9443/ws/paxgusdt@trade';
const PRICE_KEY = 'gold:price';
const PRICE_TTL = 30; // seconds

export interface GoldPrice {
  price: number;
  source: 'paxg' | 'cache';
  updatedAt: string;
}

let lastPrice: number | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function connect() {
  console.log('🔌 Connecting to Binance PAXG stream...');
  ws = new WebSocket(BINANCE_WS);

  ws.on('open', () => console.log('✅ Binance WebSocket connected'));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Binance trade stream: { p: "price", ... }
      const price = parseFloat(msg.p);
      if (!isNaN(price) && price > 0) {
        lastPrice = price;
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
    console.warn('🔌 Binance WebSocket closed — reconnecting in 5s');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('❌ Binance WebSocket error:', err.message);
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
  // Try cache first
  const cached = await redis.get(PRICE_KEY);
  if (cached) {
    return JSON.parse(cached) as GoldPrice;
  }

  // Fallback: memory
  if (lastPrice != null) {
    return {
      price: lastPrice,
      source: 'cache',
      updatedAt: new Date().toISOString(),
    };
  }

  return null;
}

export function stopGoldPriceFeed() {
  if (ws) ws.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
}