// One-time reset for the Tradezella-style rebuild: wipes ALL trades and
// withdrawals/deposits so you start the new journal from a clean slate,
// and resets the account's running numbers back to your starting balance.
//
// Your login (User collection) is left untouched — no need to re-register.
// Playbooks are left untouched too, in case you want to set those up
// before importing anything.
//
// Run once from the backend/ folder:
//   npx ts-node scripts/resetTradingData.ts
//
// This is destructive and does not ask for confirmation. If you want to
// keep the old numbers around just in case, back up first with mongodump.

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Trade } from '../src/models/Trade';
import { Withdrawal } from '../src/models/Withdrawal';
import { Account } from '../src/models/Account';
import { getOrCreateAccount } from '../src/services/accountService';

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set (check backend/.env)');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const account = await getOrCreateAccount();
  console.log(
    `Before: currentBalance=$${account.currentBalance.toFixed(2)}  taxReserve=$${account.taxReserve.toFixed(2)}  totalWithdrawn=$${account.totalWithdrawn.toFixed(2)}  totalDeposited=$${account.totalDeposited.toFixed(2)}`
  );

  const tradeCount = await Trade.countDocuments();
  const withdrawalCount = await Withdrawal.countDocuments();

  await Trade.deleteMany({});
  await Withdrawal.deleteMany({});
  console.log(`Deleted ${tradeCount} trade(s) and ${withdrawalCount} withdrawal/deposit record(s)`);

  await Account.updateOne(
    { _id: account._id },
    {
      $set: {
        currentBalance: account.startingBalance,
        taxReserve: 0,
        totalWithdrawn: 0,
        totalDeposited: 0,
      },
    }
  );

  const after = await Account.findById(account._id);
  console.log(
    `After:  currentBalance=$${after?.currentBalance.toFixed(2)}  taxReserve=$${after?.taxReserve.toFixed(2)}  totalWithdrawn=$${after?.totalWithdrawn.toFixed(2)}  totalDeposited=$${after?.totalDeposited.toFixed(2)}`
  );

  await mongoose.disconnect();
  console.log('Done. Your journal is now empty and ready for a clean start.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
