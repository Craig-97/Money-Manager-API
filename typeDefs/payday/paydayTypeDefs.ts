import { BankHolidayRegion, PayFrequency, PaydayType, Weekday } from '../../constants/payday';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const paydayTypeDefs = `
  ${gqlEnum('PayFrequency', PayFrequency)}
  ${gqlEnum('PaydayType', PaydayType)}
  ${gqlEnum('Weekday', Weekday)}
  ${gqlEnum('BankHolidayRegion', BankHolidayRegion)}

  type PaydayOverride {
    for: String!
    date: String!
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
    overrides: [PaydayOverride!]!
  }

  # How someone is paid. Set up with the account, and replaced whole when it changes.
  input PaydayInput {
    frequency: PayFrequency!
    type: PaydayType!
    dayOfMonth: Int
    weekday: Weekday
    firstPayDate: String
    bankHolidayRegion: BankHolidayRegion
  }

  type PaydayResponse {
    payday: Payday
    success: Boolean!
  }

  type Mutation {
    updatePayday(id: ID!, input: PaydayInput!): PaydayResponse!
    setPaydayOverride(id: ID!, for: String!, date: String): PaydayResponse!
  }
`;
