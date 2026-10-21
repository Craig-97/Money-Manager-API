// npm run migrate:payment-categories [-- --apply]
import { migratePaymentCategories } from './migrations/paymentCategories';
import { runMigration } from './migrations/runMigration';

void runMigration('Payment categories to the shared list', async apply => {
  const { recurring, oneOff, records, changed } = await migratePaymentCategories({ apply });
  console.log(`${recurring} recurring payment(s), ${oneOff} one-off payment(s) and ${records} payment record(s) have an old category.`);
  if (apply) console.log(`Changed ${changed}.`);
});
