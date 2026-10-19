// npm run migrate:accounts [-- --apply]
import { balancesToAccounts } from './migrations/balancesToAccounts';
import { runMigration } from './migrations/runMigration';

void runMigration('Bank balances to accounts', async apply => {
  const { budgets, created, cleared, converted } = await balancesToAccounts({ apply });
  const did = (done: string, todo: string) => (apply ? done : `would ${todo}`);
  console.log(`${budgets} budget(s).`);
  console.log(`${did('Made', 'make')} ${converted} current account(s) the spending account pay lands in.`);
  console.log(`${did('Gave', 'give')} ${created} budget(s) a spending account holding their balance.`);
  console.log(`${did('Took', 'take')} the stored balance off ${cleared} budget(s).`);
});
