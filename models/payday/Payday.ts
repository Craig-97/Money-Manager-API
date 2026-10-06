import mongoose, { Schema, Types } from 'mongoose';
import { BankHolidayRegion, PayFrequency, PaydayType, Weekday } from '../../constants/payday';
import { enumValues } from '../../utils/helpers/enumHelpers';

// One payday moved for a single pay date: `for` is the date the rule gave, `date` is when pay arrives
export interface PaydayOverride {
  for: string;
  date: string;
}

export interface Payday {
  frequency: PayFrequency;
  type: PaydayType;
  dayOfMonth?: number;
  weekday?: Weekday;
  firstPayDate?: string;
  bankHolidayRegion?: BankHolidayRegion;
  overrides: PaydayOverride[];
  account: Types.ObjectId;
}

const isoDate = {
  type: String,
  required: true,
  validate: {
    validator: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    message: (props: { value: string }) => `${props.value} is not a valid date format! Use YYYY-MM-DD`
  }
};

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
  overrides: {
    type: [new Schema({ for: isoDate, date: isoDate }, { _id: false })],
    default: []
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
