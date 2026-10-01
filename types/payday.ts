export interface PaydayInput {
  account?: string;
  frequency: string;
  type: string;
  dayOfMonth?: number;
  weekday?: string;
  firstPayDate?: string;
  bankHolidayRegion?: string;
}

// Create mutations rely on this field being present even though the schema marks it optional
export type CreatePaydayInput = PaydayInput & { account: string };
