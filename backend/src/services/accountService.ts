import { Account } from '../models/Account';
import { IAccount } from '../types';

export async function getOrCreateAccount(): Promise<
  ReturnType<typeof Account.findOne> extends Promise<infer T> ? NonNullable<T> : never
> {
  let account = await Account.findOne();
  if (!account) {
    account = await Account.create({
      startingBalance: 285,
      currentBalance: 285,
    });
  }
  return account;
}

export async function updateAccount(
  updates: Partial<IAccount>
) {
  const account = await getOrCreateAccount();
  Object.assign(account, updates);
  await account.save();
  return account;
}