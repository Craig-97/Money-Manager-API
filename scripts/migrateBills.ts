// npm run migrate:bills [-- --apply]
import type { BankHolidayRegion } from '../constants/payday';
import { migrateBills } from './migrations/billsToRecurring';
import { runMigration } from './migrations/runMigration';
import { fetchBankHolidays } from '../utils/payday/bankHolidays';
import type { BankHolidays } from '../utils/payday/paydays';

// Fetched once per region. If gov.uk can't be reached the migration stops rather than guess at paydays.
const loaded = new Map<BankHolidayRegion, Promise<BankHolidays>>();
const loadHolidays = (region: BankHolidayRegion) => {
  if (!loaded.has(region)) loaded.set(region, fetchBankHolidays(region));
  return loaded.get(region)!;
};

void runMigration('Bills to recurring payments', async apply => {
  const results = await migrateBills({ apply, today: new Date(), loadHolidays });
  if (!results.length) {
    console.log('No bills found.');
    return;
  }

  for (const result of results) {
    if (result.skipped) {
      console.log(`Account ${result.account}: skipped, ${result.skipped}`);
      continue;
    }
    console.log(`Account ${result.account}: ${result.moved.length} bill(s), first due ${result.firstPaymentDate}`);
    for (const { name, amount } of result.moved) console.log(`  ${name}  £${amount.toFixed(2)}`);
    for (const bill of result.unusable) console.log(`  bill ${bill} has no name or amount, left out`);
  }

  const moved = results.reduce((total, result) => total + result.moved.length, 0);
  const accounts = results.filter(result => result.moved.length).length;
  console.log(`\n${apply ? 'Created' : 'Would create'} ${moved} recurring payment(s) on ${accounts} account(s).`);
  if (apply) console.log('The bills collection is untouched; drop it once you are happy with the result.');
});
