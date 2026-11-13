// npm run migrate:payment-accounts [-- --apply]
import { migratePaymentAccounts } from './migrations/paymentAccounts';
import { runMigration } from './migrations/runMigration';

void runMigration('Accounts for expenses in budgets with several to spend from', async apply => {
  const { budgets, found, changed } = await migratePaymentAccounts({ apply });
  console.log(`${budgets} budget(s) with several accounts to spend from, ${found} expense(s) with no account.`);
  if (apply) console.log(`Changed ${changed} payment(s).`);
});
