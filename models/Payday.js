import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const PayFrequency = {
  WEEKLY: 'WEEKLY',
  FORTNIGHTLY: 'FORTNIGHTLY',
  FOUR_WEEKLY: 'FOUR_WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  BIANNUAL: 'BIANNUAL',
  ANNUAL: 'ANNUAL'
};

const PaydayType = {
  LAST_DAY: 'LAST_DAY',
  LAST_FRIDAY: 'LAST_FRIDAY',
  SET_DAY: 'SET_DAY',
  SET_WEEKDAY: 'SET_WEEKDAY'
};

const Weekday = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY'
};

const BankHolidayRegion = {
  ENGLAND_AND_WALES: 'ENGLAND_AND_WALES',
  SCOTLAND: 'SCOTLAND',
  NORTHERN_IRELAND: 'NORTHERN_IRELAND'
};

export const Payday = mongoose.model('Payday', {
  frequency: {
    type: String,
    enum: Object.values(PayFrequency),
    required: true
  },
  type: {
    type: String,
    enum: Object.values(PaydayType),
    required: true
  },
  dayOfMonth: {
    type: Number,
    min: 1,
    max: 31
  },
  weekday: {
    type: String,
    enum: Object.values(Weekday)
  },
  firstPayDate: {
    type: Date
  },
  bankHolidayRegion: {
    type: String,
    enum: Object.values(BankHolidayRegion)
  },
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: 'Account ID required'
  }
});
