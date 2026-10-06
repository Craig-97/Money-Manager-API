import type {
  BankHolidayRegion,
  PayFrequency,
  PaydayType,
  Weekday
} from '../../constants/payday';

export interface PaydayInput {
  frequency: PayFrequency;
  type: PaydayType;
  dayOfMonth?: number;
  weekday?: Weekday;
  firstPayDate?: string;
  bankHolidayRegion?: BankHolidayRegion;
}
