exports.typeDefs = `
  enum PayFrequency {
    WEEKLY
    FORTNIGHTLY
    FOUR_WEEKLY
    MONTHLY
    QUARTERLY
    BIANNUAL
    ANNUAL
  }

  enum PaydayType {
    LAST_DAY
    LAST_FRIDAY
    SET_DAY
    SET_WEEKDAY
  }

  enum Weekday {
    MONDAY
    TUESDAY
    WEDNESDAY
    THURSDAY
    FRIDAY
  }

  enum BankHolidayRegion {
    ENGLAND_AND_WALES
    SCOTLAND
    NORTHERN_IRELAND
  }

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
