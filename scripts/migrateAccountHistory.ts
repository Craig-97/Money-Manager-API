// npm run migrate:account-history [-- --apply]
import { migrateAccountHistory } from './migrations/accountHistory';
import { runMigration } from './migrations/runMigration';

void runMigration('Opening balances for accounts from before account history', async apply => {
  const { found, changed } = await migrateAccountHistory({ apply });
  console.log(`${found} account(s) with no history yet.`);
  if (apply) console.log(`Started the history of ${changed} account(s).`);
});
