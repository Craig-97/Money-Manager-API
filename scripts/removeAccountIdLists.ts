// npm run migrate:account-ids [-- --apply]
import { ACCOUNT_ID_FIELDS, removeAccountIdLists } from './migrations/removeAccountIdLists';
import { runMigration } from './migrations/runMigration';

void runMigration('Remove stored id lists from accounts', async apply => {
  const { found, cleaned } = await removeAccountIdLists({ apply });
  console.log(`${found} account(s) still carry ${ACCOUNT_ID_FIELDS.join(', ')}.`);
  if (apply) console.log(`Removed them from ${cleaned} account(s).`);
});
