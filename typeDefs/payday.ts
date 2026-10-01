import { BankHolidayRegion, PayFrequency, PaydayType, Weekday } from '../models/Payday';
import { gqlEnum } from '../utils/helpers/enumHelpers';

export const typeDefs = `
  ${gqlEnum('PayFrequency', PayFrequency)}

  ${gqlEnum('PaydayType', PaydayType)}

  ${gqlEnum('Weekday', Weekday)}

  ${gqlEnum('BankHolidayRegion', BankHolidayRegion)}

  type Query {
    paydays: [Payday!]!
    payday(id: ID): Payday
  }

  type Payday {
    id: ID!
    account: ID!
    frequency: PayFrequency!
    type: PaydayType!
    dayOfMonth: Int
    weekday: Weekday
    firstPayDate: String
    bankHolidayRegion: BankHolidayRegion
  }

  input PaydayInput {
    account: ID
    frequency: PayFrequency!
    type: PaydayType!
    dayOfMonth: Int
    weekday: Weekday
    firstPayDate: String
    bankHolidayRegion: BankHolidayRegion
  }

  type PaydayResponse {
    payday: Payday
    success: Boolean
  }

  type Mutation {
    createPayday(payday: PaydayInput!): PaydayResponse!
    editPayday(id: ID!, payday: PaydayInput!): PaydayResponse!
    deletePayday(id: ID!): PaydayResponse!
  }
`;
