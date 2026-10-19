// npm run migrate:accounts [-- --apply]
import { balancesToAccounts } from './migrations/balancesToAccounts';
import { runMigration } from './migrations/runMigration';

void runMigration('Bank balances to current accounts', async apply => {
  const { budgets, created, cleared } = await balancesToAccounts({ apply });
  const did = (done: string, todo: string) => (apply ? done : `would ${todo}`);
  console.log(`${budgets} budget(s).`);
  console.log(`${did('Gave', 'give')} ${created} budget(s) a current account holding their balance.`);
  console.log(`${did('Took', 'take')} the stored balance off ${cleared} budget(s).`);
});
