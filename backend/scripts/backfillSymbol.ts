// One-time backfill: every trade imported/created before the ETHUSD support
// was added has no `symbol` field stored in MongoDB at all (the schema's
// `default: 'GOLD'` only applies to documents created from here on). This
// sets symbol: 'GOLD' explicitly on any trade that doesn't already have one,
// so the new GOLD/ETHUSD/All filter on the Journal page works correctly for
// existing trades too.
//
// Run once from the backend/ folder:
//   npx ts-node scripts/backfillSymbol.ts

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
    $or: [{ symbol: { $exists: false } }, { symbol: null }],
  });
  console.log(`Found ${affected} trade(s) with no symbol set`);

  if (affected > 0) {
    const result = await Trade.updateMany(
      { $or: [{ symbol: { $exists: false } }, { symbol: null }] },
      { $set: { symbol: 'GOLD' } }
    );
    console.log(`Set symbol: 'GOLD' on ${result.modifiedCount} trade(s)`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
