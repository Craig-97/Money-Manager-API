// npm run migrate:payment-records [-- --apply]
import { moveHandledToRecords } from './migrations/handledToRecords';
import { runMigration } from './migrations/runMigration';

void runMigration('Move paid and skipped dates into payment records', async apply => {
  const { payments, records, moved } = await moveHandledToRecords({ apply });
  console.log(`${payments} payment(s) carry a handled list, holding ${records} entr${records === 1 ? 'y' : 'ies'}.`);
  if (apply) console.log(`Created ${records} record(s) and cleared the list from ${moved} payment(s).`);
});
