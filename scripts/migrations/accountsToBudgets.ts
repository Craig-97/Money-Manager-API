import mongoose from 'mongoose';

/*
 * What holds a user's payday, income, payments, notes and reminder settings used to be called an
 * account. It's a budget now, so "account" can mean a bank account. This renames the accounts
 * collection to budgets and every record's account field to budget, then drops the indexes built
 * on the old field: a unique one would clash once the field is gone from every record. The
 * indexes on budget are built straight after, as the API would when it starts.
 *
 * "accounts" now holds bank accounts, so the collection is only renamed while it still holds the
 * old documents, which have a user. One holding both means bank accounts were added before the
 * rename, which is a job for a person.
 *
 * Run it before the other migrations, which use the new names. Running it again changes nothing.
 */

// Every collection whose records point at their budget. Bills only until they're moved and dropped.
export const LINKED_COLLECTIONS = [
  'users',
  'notes',
  'oneoffpayments',
  'recurringpayments',
  'paymentrecords',
  'paydays',
  'reminderstates',
  'bills'
];

interface LinkedResult {
  collection: string;
  // Records still carrying the old field
  records: number;
  // Indexes on the old field, dropped on --apply
  indexes: string[];
}

const OLD_FIELD = { account: { $exists: true } };

export const accountsToBudgets = async ({ apply }: { apply: boolean }) => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Not connected to a database');

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = new Set(collections.map(collection => collection.name));
  const accounts = db.collection('accounts');
  const oldDocuments = names.has('accounts')
    ? await accounts.countDocuments({ user: { $exists: true } })
    : 0;
  const renamesCollection = oldDocuments > 0;
  if (renamesCollection && (await accounts.countDocuments({ budget: { $exists: true } })) > 0) {
    throw new Error('The accounts collection holds old budgets and bank accounts. Check it by hand first.');
  }

  // The API makes an empty budgets collection as soon as it connects, so one may be waiting. One
  // with budgets in means a half-done run or data written since: merging them is a job for a person.
  const replacesEmptyBudgets = renamesCollection && names.has('budgets');
  if (replacesEmptyBudgets && (await db.collection('budgets').countDocuments()) > 0) {
    throw new Error('Both an accounts and a budgets collection have data. Check them by hand first.');
  }

  const budgets = oldDocuments;
  if (apply && replacesEmptyBudgets) await db.collection('budgets').drop();
  if (apply && renamesCollection) await db.renameCollection('accounts', 'budgets');

  const linked: LinkedResult[] = [];
  // Sequential, so a failure part way leaves a clear point to pick up from
  for (const name of LINKED_COLLECTIONS) {
    if (!names.has(name)) continue;
    const collection = db.collection(name);
    const records = await collection.countDocuments(OLD_FIELD);
    const indexes = (await collection.indexes())
      .filter(index => Object.keys(index.key).includes('account'))
      .map(index => index.name as string);
    if (records === 0 && indexes.length === 0) continue;

    if (apply) {
      for (const index of indexes) await collection.dropIndex(index);
      if (records) await collection.updateMany(OLD_FIELD, { $rename: { account: 'budget' } });
    }
    linked.push({ collection: name, records, indexes });
  }

  // Indexes as the models declare them: new ones built, and any the new models made on the old
  // collection before it moved dropped
  if (apply) {
    await Promise.all(Object.values(mongoose.models).map(model => model.syncIndexes()));
  }
  return { renamesCollection, replacesEmptyBudgets, budgets, linked };
};
