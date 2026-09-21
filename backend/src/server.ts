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

import { requireAuth } from './middleware/auth';
import { getOrCreateAccount } from './services/accountService';
import { startGoldPriceFeed } from './services/goldPrice';
import './services/redis'; // ensures Redis connects on startup

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- Middleware ----------
app.use(helmet());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
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
app.use('/api/price', priceRoutes);                       // public (live gold)
app.use('/api/account', requireAuth, accountRoutes);      // protected
app.use('/api/trades', requireAuth, tradeRoutes);         // protected
app.use('/api/withdrawals', requireAuth, withdrawalRoutes); // protected

// ---------- Startup ----------
async function start() {
  try {
    // 1. MongoDB
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ MongoDB connected');

    // 2. Ensure the singleton account exists
    const account = await getOrCreateAccount();
    console.log(`💼 Account ready — balance: $${account.currentBalance}`);

    // 3. Start the gold price feed (WebSocket → Redis)
    console.log('📈 Gold price feed starting...');
    startGoldPriceFeed();

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