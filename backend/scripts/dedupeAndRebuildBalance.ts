// One-time repair: some MT5 report re-imports created duplicate trades —
// the same underlying broker trade (same symbol, direction, entry, close
// price, lot size and open time) saved as two separate Trade documents.
// Each duplicate re-applied its own profit/loss to the account balance and
// tax reserve, so both are now inflated/deflated by however much got
// double-counted, and the per-trade balanceBefore/balanceAfter chain in the
// Journal is a mix of two overlapping sequences (hence balances jumping
// around instead of running smoothly).
//
// This script:
//   1. Finds duplicate trades (same fingerprint) and deletes all but the
//      earliest-inserted copy of each.
//   2. Rebuilds the balanceBefore/balanceAfter chain on every remaining
//      trade from scratch, in true chronological order, interleaved with
//      your recorded deposits/withdrawals (also chronological) — instead of
//      trusting the old chain, which was corrupted by the duplicates.
//   3. Recomputes Account.currentBalance and Account.taxReserve to match.
//
// Each trade's OWN profit/loss (closePrice/entry/lotSize/swapFee — or the
// broker's own reported profit for imported trades) is untouched; only the
// running balance/tax-reserve ledger built from those numbers is redone.
//
// Run once from the backend/ folder:
//   npx ts-node scripts/dedupeAndRebuildBalance.ts
//
// It prints a before/after summary and does not ask for confirmation —
// back up your database first if you want to be extra safe (e.g.
// `mongodump`), though everything it changes is derived from data that
// stays in the trades themselves.

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Trade } from '../src/models/Trade';
import { Withdrawal } from '../src/models/Withdrawal';
import { getOrCreateAccount, updateAccount } from '../src/services/accountService';

dotenv.config();

function fingerprint(t: {
  symbol?: string;
  direction: string;
  entry: number;
  closePrice?: number | null;
  lotSize: number;
  date: Date;
}): string {
  return [
    t.symbol ?? 'GOLD',
    t.direction,
    t.entry.toFixed(2),
    t.closePrice != null ? t.closePrice.toFixed(2) : 'open',
    t.lotSize.toFixed(2),
    // Round to the nearest minute rather than exact millisecond — the same
    // broker trade parsed via the MT5 "Positions" section vs the "Deals"
    // section can end up with timestamps a second or two apart even though
    // it's the same real-world trade.
    Math.round(new Date(t.date).getTime() / 60000),
  ].join('|');
}

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
    `Before: currentBalance=$${account.currentBalance.toFixed(2)}  taxReserve=$${account.taxReserve.toFixed(2)}`
  );

  // ---------- 1. Find & remove duplicates ----------
  const allTrades = await Trade.find().sort({ tradeNumber: 1 });
  console.log(`Loaded ${allTrades.length} trade(s)`);

  const groups = new Map<string, typeof allTrades>();
  for (const t of allTrades) {
    const fp = fingerprint(t);
    const arr = groups.get(fp) ?? [];
    arr.push(t);
    groups.set(fp, arr);
  }

  const toDelete: string[] = [];
  let duplicateGroups = 0;
  for (const arr of groups.values()) {
    if (arr.length <= 1) continue;
    duplicateGroups++;
    // Keep the earliest-inserted (lowest tradeNumber), delete the rest.
    const sorted = [...arr].sort((a, b) => a.tradeNumber - b.tradeNumber);
    for (const dup of sorted.slice(1)) {
      toDelete.push(String(dup._id));
    }
  }

  if (toDelete.length > 0) {
    const result = await Trade.deleteMany({ _id: { $in: toDelete } });
    console.log(
      `Removed ${result.deletedCount} duplicate trade(s) across ${duplicateGroups} group(s)`
    );
  } else {
    console.log('No duplicate trades found');
  }

  // ---------- 2. Rebuild the balance/tax ledger chronologically ----------
  const remaining = await Trade.find().sort({ date: 1, tradeNumber: 1 });
  const withdrawals = await Withdrawal.find().sort({ date: 1 });

  type Event =
    | { kind: 'trade'; date: Date; trade: (typeof remaining)[number] }
    | { kind: 'cashflow'; date: Date; amount: number; type: 'Withdrawal' | 'Deposit' };

  const events: Event[] = [
    ...remaining.map((trade) => ({ kind: 'trade' as const, date: trade.date, trade })),
    ...withdrawals.map((w) => ({
      kind: 'cashflow' as const,
      date: w.date,
      amount: w.amount,
      type: w.type,
    })),
  ].sort((a, b) => +new Date(a.date) - +new Date(b.date));

  let runningBalance = account.startingBalance;
  let runningTaxReserve = 0;
  const bulkOps: any[] = [];

  for (const ev of events) {
    if (ev.kind === 'cashflow') {
      runningBalance += ev.type === 'Deposit' ? ev.amount : -ev.amount;
      continue;
    }

    const trade = ev.trade;
    const wasClosed = trade.balanceAfter != null && trade.result !== 'Open';
    const pnl = wasClosed ? (trade.balanceAfter as number) - trade.balanceBefore : null;

    const newBalanceBefore = runningBalance;
    let newBalanceAfter: number | undefined = undefined;

    if (pnl != null) {
      runningBalance += pnl;
      newBalanceAfter = runningBalance;
      if (pnl > 0) {
        runningTaxReserve += Math.round(pnl * account.taxRate * 100) / 100;
      }
    }

    if (
      newBalanceBefore !== trade.balanceBefore ||
      newBalanceAfter !== trade.balanceAfter
    ) {
      bulkOps.push({
        updateOne: {
          filter: { _id: trade._id },
          update: {
            $set: {
              balanceBefore: Math.round(newBalanceBefore * 100) / 100,
              ...(newBalanceAfter != null
                ? { balanceAfter: Math.round(newBalanceAfter * 100) / 100 }
                : {}),
            },
          },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await Trade.bulkWrite(bulkOps);
    console.log(`Rebuilt balanceBefore/balanceAfter on ${bulkOps.length} trade(s)`);
  } else {
    console.log('Balance chain was already consistent — nothing to rebuild');
  }

  const newBalance = Math.round(runningBalance * 100) / 100;
  const newTaxReserve = Math.round(runningTaxReserve * 100) / 100;

  await updateAccount({
    currentBalance: newBalance,
    taxReserve: newTaxReserve,
  });

  console.log(
    `After:  currentBalance=$${newBalance.toFixed(2)}  taxReserve=$${newTaxReserve.toFixed(2)}`
  );
  console.log(
    `Delta:  balance ${(newBalance - account.currentBalance) >= 0 ? '+' : ''}$${(newBalance - account.currentBalance).toFixed(2)}   tax reserve ${(newTaxReserve - account.taxReserve) >= 0 ? '+' : ''}$${(newTaxReserve - account.taxReserve).toFixed(2)}`
  );

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
