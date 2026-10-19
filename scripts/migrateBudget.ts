// npm run migrate:budget [-- --apply]
import '../models';
import { accountsToBudgets } from './migrations/accountsToBudgets';
import { runMigration } from './migrations/runMigration';

void runMigration('Rename accounts to budgets', async apply => {
  const { renamesCollection, replacesEmptyBudgets, budgets, linked } = await accountsToBudgets({ apply });
  // "Renamed …" once applied, "Would rename …" on a dry run
  const did = (done: string, todo: string) => (apply ? done : `would ${todo}`);

  if (replacesEmptyBudgets) console.log(`budgets: ${did('dropped', 'drop')} the empty one first.`);
  console.log(
    renamesCollection
      ? `accounts: ${did('renamed', 'rename')} to budgets (${budgets} budget(s)).`
      : 'accounts: already renamed to budgets.'
  );
  for (const { collection, records, indexes } of linked) {
    const dropped = indexes.length ? `, ${did('dropped', 'drop')} ${indexes.join(', ')}` : '';
    console.log(`${collection}: ${did('renamed', 'rename')} account to budget on ${records} record(s)${dropped}.`);
  }
  if (!linked.length) console.log('No records still use the account field.');
});
