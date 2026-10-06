// npm run migrate:bills [-- --apply]
import type { BankHolidayRegion } from '../constants/payday';
import { migrateBills } from './migrations/billsToRecurring';
import { runMigration } from './migrations/runMigration';

const BANK_HOLIDAYS_API = 'https://www.gov.uk/bank-holidays.json';

const REGION_KEYS: Record<BankHolidayRegion, string> = {
  ENGLAND_AND_WALES: 'england-and-wales',
  SCOTLAND: 'scotland',
  NORTHERN_IRELAND: 'northern-ireland'
};

type AllRegions = Partial<Record<string, { events: { date: string }[] }>>;

// Fetched once. If gov.uk can't be reached the migration stops rather than guess at paydays.
let allRegions: Promise<AllRegions> | null = null;
const loadHolidays = async (region: BankHolidayRegion) => {
  allRegions ??= fetch(BANK_HOLIDAYS_API).then(response => {
    if (!response.ok) throw new Error(`Bank holidays request failed: ${response.status}`);
    return response.json() as Promise<AllRegions>;
  });
  const data = await allRegions;
  return new Set((data[REGION_KEYS[region]]?.events ?? []).map(event => event.date));
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
