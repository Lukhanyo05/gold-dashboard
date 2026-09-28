import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import accountRoutes from './routes/account';
import tradeRoutes from './routes/trades';
import withdrawalRoutes from './routes/withdrawals';
import authRoutes from './routes/auth';
import priceRoutes from './routes/price';
import analyticsRoutes from './routes/analytics';
import playbookRoutes from './routes/playbooks';
import goalRoutes from './routes/goals';
import dailyJournalRoutes from './routes/dailyJournal';
import newsRoutes from './routes/news';
import eventsRoutes from './routes/events';

import { requireAuth } from './middleware/auth';
import { getOrCreateAccount } from './services/accountService';
import { startGoldPriceFeed } from './services/goldPrice';
import { startEthPriceFeed } from './services/ethPrice';
import './services/redis'; // ensures Redis connects on startup

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- Middleware ----------
app.use(helmet());
// Vite auto-increments its port (5173, 5174, 5175, ...) whenever something
// else is already holding the one before it, so a single hardcoded origin
// here breaks the moment that happens. Accept any localhost/127.0.0.1 dev
// port instead of pinning to one — this is a local dev server, not a
// public API, so there's no real security trade-off in being flexible here.
const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;
// In production, only the exact origin(s) in CORS_ORIGINS (comma-separated,
// e.g. "https://app.goldholdings.co.za") are allowed — the open localhost
// regex is a dev convenience and has no place once this is on the public
// internet.
const allowedProdOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const isProd = process.env.NODE_ENV === 'production';
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin / server-to-server / curl
      const allowed = isProd ? allowedProdOrigins.includes(origin) : localhostOrigin.test(origin);
      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan('dev'));

// ---------- Health ----------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ---------- Routes ----------
app.use('/api/auth', authRoutes);                         // public
app.use('/api/price', priceRoutes);                       // public (live gold + ETHUSD)
app.use('/api/news', newsRoutes);                         // public (external RSS, no account data)
app.use('/api/events', eventsRoutes);                     // public (macro calendar, no account data)
app.use('/api/account', requireAuth, accountRoutes);      // protected
app.use('/api/trades', requireAuth, tradeRoutes);         // protected
app.use('/api/withdrawals', requireAuth, withdrawalRoutes); // protected
app.use('/api/analytics', requireAuth, analyticsRoutes);   // protected
app.use('/api/playbooks', requireAuth, playbookRoutes);    // protected
app.use('/api/goals', requireAuth, goalRoutes);            // protected
app.use('/api/daily-journal', requireAuth, dailyJournalRoutes); // protected

// ---------- Startup ----------
async function start() {
  try {
    // Fail fast and loud on a misconfigured deploy, rather than crashing
    // confusingly on the first request that touches Mongo or signs a JWT.
    const required = ['MONGO_URI', 'JWT_SECRET'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
    }
    if (isProd && allowedProdOrigins.length === 0) {
      console.warn('⚠️  NODE_ENV=production but CORS_ORIGINS is unset — no browser origin will be allowed.');
    }

    // 1. MongoDB
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ MongoDB connected');

    // 2. Ensure the singleton account exists
    const account = await getOrCreateAccount();
    console.log(`💼 Account ready — balance: $${account.currentBalance}`);

    // 3. Start the live price feeds (WebSocket → Redis)
    console.log('📈 Gold price feed starting...');
    startGoldPriceFeed();
    console.log('📈 ETHUSD price feed starting...');
    startEthPriceFeed();

    // 4. Start the HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Startup error:', err);
    process.exit(1);
  }
}

start();