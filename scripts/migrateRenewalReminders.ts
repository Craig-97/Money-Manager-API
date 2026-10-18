// npm run migrate:renewal-reminders [-- --apply]
import { migrateRenewalReminders } from './migrations/renewalReminders';
import { runMigration } from './migrations/runMigration';

void runMigration('Renewal reminders to reminder timings', async apply => {
  const { found, kept, off, usual, changed } = await migrateRenewalReminders({ apply });
  console.log(`${found} recurring payment(s) still have renewalReminderDays.`);
  console.log(`  ${kept} keep their days, ${off} stay off, ${usual} follow the usual timing.`);
  if (apply) console.log(`Changed ${changed} payment(s).`);
});
