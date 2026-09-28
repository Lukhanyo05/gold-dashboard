// One-time cleanup: earlier versions of the import/close logic computed
// an R-multiple of exactly ±1 for any trade with no real Stop Loss (since
// "risked" defaulted to the trade's own |profit|, which always divides to
// ±1 — not a real risk ratio). The code no longer does this, but trades
// already saved before the fix still carry that fake value.
//
// This unsets rMultiple on every trade that has no stopLoss, so the
// Journal shows "—" instead of a misleading ±1. It does NOT touch entry,
// close price, balance, or anything else — those were already correct.
//
// Run once from the backend/ folder:
//   npx ts-node scripts/fixRMultiple.ts

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Trade } from '../src/models/Trade';

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set (check backend/.env)');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const affected = await Trade.countDocuments({
    stopLoss: null,
    rMultiple: { $ne: null },
  });
  console.log(`Found ${affected} trade(s) with a fake R-multiple (no real Stop Loss)`);

  if (affected > 0) {
    const result = await Trade.updateMany(
      { stopLoss: null, rMultiple: { $ne: null } },
      { $unset: { rMultiple: '' } }
    );
    console.log(`Cleared rMultiple on ${result.modifiedCount} trade(s)`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
