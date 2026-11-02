// npm run migrate:account-interest [-- --apply]
import { migrateAccountInterest } from './migrations/accountInterest';
import { runMigration } from './migrations/runMigration';

void runMigration('Account interest rates to interest', async apply => {
  const { found, withRate, changed } = await migrateAccountInterest({ apply });
  console.log(`${found} account(s) still have interestRate, ${withRate} with a rate to carry over.`);
  if (apply) console.log(`Changed ${changed} account(s).`);
});
