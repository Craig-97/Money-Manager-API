// npm run migrate:budget-ids [-- --apply]
import { BUDGET_ID_FIELDS, removeBudgetIdLists } from './migrations/removeBudgetIdLists';
import { runMigration } from './migrations/runMigration';

void runMigration('Remove stored id lists from budgets', async apply => {
  const { found, cleaned } = await removeBudgetIdLists({ apply });
  console.log(`${found} budget(s) still carry ${BUDGET_ID_FIELDS.join(', ')}.`);
  if (apply) console.log(`Removed them from ${cleaned} budget(s).`);
});
