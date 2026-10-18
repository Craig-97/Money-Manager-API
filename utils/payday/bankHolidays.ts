import type { BankHolidayRegion } from '../../constants/payday';
import { logger } from '../logger';
import type { BankHolidays } from './paydays';

// Where gov.uk lists the UK's bank holidays. BANK_HOLIDAYS_URL can point elsewhere, or be set
// empty to go without them, as the tests do.
const DEFAULT_URL = 'https://www.gov.uk/bank-holidays.json';

const REGION_KEYS: Record<BankHolidayRegion, string> = {
  ENGLAND_AND_WALES: 'england-and-wales',
  SCOTLAND: 'scotland',
  NORTHERN_IRELAND: 'northern-ireland'
};

type AllRegions = Partial<Record<string, { events: { date: string }[] }>>;

// The list changes a few times a year, so a fetched copy is good for half a day
const CACHE_MS = 12 * 60 * 60 * 1000;

const NO_HOLIDAYS: BankHolidays = new Set();

const fetchAll = async (): Promise<AllRegions> => {
  const url = process.env.BANK_HOLIDAYS_URL ?? DEFAULT_URL;
  if (!url) return {};
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Bank holidays request failed: ${response.status}`);
  return (await response.json()) as AllRegions;
};

const forRegion = (data: AllRegions, region: BankHolidayRegion): BankHolidays =>
  new Set((data[REGION_KEYS[region]]?.events ?? []).map(event => event.date));

/* A region's bank holidays, straight from gov.uk; throws when it can't be reached */
export const fetchBankHolidays = async (region: BankHolidayRegion) => forRegion(await fetchAll(), region);

let cached: { data: AllRegions; at: number } | null = null;

/*
 * A region's bank holidays, kept for half a day. When gov.uk can't be reached it carries on
 * without them: a payday a day out is better than no calendar at all.
 */
export const bankHolidaysFor = async (region: BankHolidayRegion | null | undefined) => {
  if (!region) return NO_HOLIDAYS;
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    try {
      cached = { data: await fetchAll(), at: Date.now() };
    } catch (error) {
      logger.warn({ err: error }, 'Could not load bank holidays');
      return cached ? forRegion(cached.data, region) : NO_HOLIDAYS;
    }
  }
  return forRegion(cached.data, region);
};
