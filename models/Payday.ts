import mongoose, { Schema, Types } from 'mongoose';
import { enumValues } from '../utils/helpers/enumHelpers';

export const PayFrequency = {
  WEEKLY: 'WEEKLY',
  FORTNIGHTLY: 'FORTNIGHTLY',
  FOUR_WEEKLY: 'FOUR_WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  BIANNUAL: 'BIANNUAL',
  ANNUAL: 'ANNUAL'
} as const;

export type PayFrequency = (typeof PayFrequency)[keyof typeof PayFrequency];

export const PaydayType = {
  LAST_DAY: 'LAST_DAY',
  LAST_FRIDAY: 'LAST_FRIDAY',
  SET_DAY: 'SET_DAY',
  SET_WEEKDAY: 'SET_WEEKDAY'
} as const;

export type PaydayType = (typeof PaydayType)[keyof typeof PaydayType];

export const Weekday = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY'
} as const;

export type Weekday = (typeof Weekday)[keyof typeof Weekday];

export const BankHolidayRegion = {
  ENGLAND_AND_WALES: 'ENGLAND_AND_WALES',
  SCOTLAND: 'SCOTLAND',
  NORTHERN_IRELAND: 'NORTHERN_IRELAND'
} as const;

export type BankHolidayRegion = (typeof BankHolidayRegion)[keyof typeof BankHolidayRegion];


export interface Payday {
  frequency: PayFrequency;
  type: PaydayType;
  dayOfMonth?: number;
  weekday?: Weekday;
  firstPayDate?: string;
  bankHolidayRegion?: BankHolidayRegion;
  account: Types.ObjectId;
}

const PaydaySchema = new Schema<Payday>({
  frequency: {
    type: String,
    enum: enumValues(PayFrequency),
    required: true
  },
  type: {
    type: String,
    enum: enumValues(PaydayType),
    required: true
  },
  dayOfMonth: {
    type: Number,
    min: 1,
    max: 31
  },
  weekday: {
    type: String,
    enum: enumValues(Weekday)
  },
  firstPayDate: {
    type: String,
    validate: {
      validator: function (v) {
        return !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
      },
      message: props => `${props.value} is not a valid date format! Use YYYY-MM-DD`
    }
  },
  bankHolidayRegion: {
    type: String,
    enum: enumValues(BankHolidayRegion)
  },
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'Account ID required']
  }
});

// Each account can only have one payday setup
PaydaySchema.index({ account: 1 }, { unique: true });

export const Payday = mongoose.model<Payday>('Payday', PaydaySchema);
