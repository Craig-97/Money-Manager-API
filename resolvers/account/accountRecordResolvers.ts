import type { ClientSession } from 'mongoose';
import { AccountChangeKind } from '../../constants/account/accountChangeKind';
import { AccountRecordKind } from '../../constants/account/accountRecordKind';
import { Account, type InterestAdded } from '../../models/account/Account';
import { AccountRecord } from '../../models/account/AccountRecord';
import { PaymentRecord } from '../../models/payment/PaymentRecord';
import { roundPence, ukDay } from '../../utils';

type AccountDocument = InstanceType<typeof Account>;

// Something that moved an account's balance, as its history lists it
interface AccountChange {
  id: string;
  kind: AccountChangeKind;
  date: Date;
  change: number;
  balanceAfter: number;
  // The payment, or for money moved, the other account
  name: string | null;
  createdAt: Date;
}

const NEWEST_FIRST = { createdAt: -1, _id: -1 } as const;
const MAX_HISTORY = 200;

/*
 * Notes a change to an account's balance that isn't a payment, at the balance it leaves: its
 * opening balance, one typed in, or interest added
 */
export const recordAccountChange = (
  account: AccountDocument,
  {
    kind,
    change,
    date = ukDay(),
    session
  }: { kind: AccountRecordKind; change: number; date?: Date; session?: ClientSession }
) =>
  new AccountRecord({
    budget: account.budget,
    account: account._id,
    kind,
    date,
    change,
    balanceAfter: account.balance
  }).save({ session: session ?? null });

// Where an account's history starts, at the balance it has
export const recordOpeningBalance = (account: AccountDocument, session?: ClientSession) =>
  recordAccountChange(account, {
    kind: AccountRecordKind.OPENING,
    change: account.balance,
    session
  });

// Interest the app added, each on its own date, at the balance each one left
export const recordInterestAdded = (account: AccountDocument, added: InterestAdded[]) =>
  AccountRecord.insertMany(
    added.map(({ date, amount, balanceAfter }) => ({
      budget: account.budget,
      account: account._id,
      kind: AccountRecordKind.INTEREST,
      date,
      change: amount,
      balanceAfter
    }))
  );

// Its own records keep the balance they left exactly; the rest is worked out from them
const ANCHORS: AccountChangeKind[] = [AccountChangeKind.OPENING, AccountChangeKind.BALANCE_SET];

/*
 * Everything that moved an account's balance since its history started, newest first: its own
 * records, payments out of or into it, and money payments moved into it. The balance after each is
 * worked back from today's, starting again from each balance that was typed in, so a payment that's
 * undone or deleted simply drops out.
 */
const loadChanges = async (account: AccountDocument): Promise<AccountChange[]> => {
  const own = await AccountRecord.find({ account: account._id }).sort(NEWEST_FIRST).exec();
  const opening = own.find(record => record.kind === AccountRecordKind.OPENING);
  const since = opening?.createdAt ?? account.get('createdAt');
  const [payments, accounts] = await Promise.all([
    PaymentRecord.find({
      $or: [{ account: account._id }, { 'transfer.account': account._id }],
      createdAt: { $gte: since }
    }).exec(),
    Account.find({ budget: account.budget }).select({ name: 1, paidInto: 1 }).exec()
  ]);
  const nameOf = (id: unknown) => accounts.find(other => String(other._id) === String(id))?.name;
  const paidIntoName = accounts.find(other => other.paidInto)?.name ?? null;
  const id = String(account._id);

  const fromPayments = payments.flatMap(record => {
    const entries: Omit<AccountChange, 'balanceAfter'>[] = [];
    const at = { date: ukDay(record.createdAt), createdAt: record.createdAt };
    const into = record.transfer?.account;
    if (String(record.account) === id && record.balanceChange) {
      entries.push({
        id: record.id,
        kind: into ? AccountChangeKind.MOVE_OUT : AccountChangeKind.PAYMENT,
        change: record.balanceChange,
        name: into ? (nameOf(into) ?? null) : record.payment.name,
        ...at
      });
    }
    if (record.transfer && String(into) === id) {
      entries.push({
        id: `${record.id}:in`,
        kind: AccountChangeKind.MOVE_IN,
        change: record.transfer.amount,
        // A record that moved nothing out names no account: it came from where pay lands
        name: record.account ? (nameOf(record.account) ?? null) : paidIntoName,
        ...at
      });
    }
    return entries;
  });
  const fromOwn = own.map(record => ({
    id: record.id,
    kind: record.kind,
    change: record.change,
    name: null,
    date: record.date,
    createdAt: record.createdAt,
    stored: record.balanceAfter
  }));

  const all = [...fromOwn, ...fromPayments].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  let running = account.balance;
  return all.map(
    ({ stored, ...entry }: Omit<AccountChange, 'balanceAfter'> & { stored?: number }) => {
      const balanceAfter = ANCHORS.includes(entry.kind) && stored !== undefined ? stored : running;
      running = roundPence(balanceAfter - entry.change);
      return { ...entry, balanceAfter: roundPence(balanceAfter) };
    }
  );
};

// Loaded once however many of its fields ask
const changesOf = (account: AccountDocument): Promise<AccountChange[]> =>
  (account.$locals.changes as Promise<AccountChange[]> | undefined) ??
  (account.$locals.changes = loadChanges(account));

/* The latest `limit` changes, or all of one year's, newest first */
const history = async (
  account: AccountDocument,
  { limit, year }: { limit?: number | null; year?: number | null }
) => {
  const changes = await changesOf(account);
  if (year == null) return changes.slice(0, Math.min(Math.max(limit ?? 50, 1), MAX_HISTORY));
  return changes.filter(change => change.date.getUTCFullYear() === year).slice(0, MAX_HISTORY);
};

// The years it has changes in, newest first, for paging through its history by year
const historyYears = async (account: AccountDocument) =>
  [...new Set((await changesOf(account)).map(change => change.date.getUTCFullYear()))].sort(
    (a, b) => b - a
  );

export const accountRecordResolvers = {
  Account: { history, historyYears }
};
