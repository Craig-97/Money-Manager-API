import type {
  BankHolidayRegion,
  PayFrequency,
  PaydayType,
  Weekday
} from '../models/Payday';

export interface PaydayInput {
  account?: string;
  frequency: PayFrequency;
  type: PaydayType;
  dayOfMonth?: number;
  weekday?: Weekday;
  firstPayDate?: string;
  bankHolidayRegion?: BankHolidayRegion;
}

// Create mutations rely on this field being present even though the schema marks it optional
export type CreatePaydayInput = PaydayInput & { account: string };
