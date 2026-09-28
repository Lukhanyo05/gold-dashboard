import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Trade } from '../src/models/Trade';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  const total = await Trade.countDocuments();
  const recent = await Trade.find({ date: { $gte: new Date('2026-09-20T00:00:00.000Z') } }).sort({ date: 1 });
  const latest5 = await Trade.find().sort({ date: -1 }).limit(5);
  console.log('Total trades in DB:', total);
  console.log('Trades with date >= Sep 20:', recent.length);
  recent.forEach(t => console.log(' -', t.tradeNumber, t.date.toISOString(), t.symbol, t.direction, t.result));
  console.log('--- Most recent 5 by date ---');
  latest5.forEach(t => console.log(' -', t.tradeNumber, t.date.toISOString(), t.symbol, t.direction, t.result));
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
