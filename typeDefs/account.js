exports.typeDefs = `
  type Query {
    accounts: [Account!]!
    account(id: ID): Account
  }

  type Account {
    id: ID!
    user: User
    bankBalance: Float!
    monthlyIncome: Float!
    bills: [Bill]
    oneOffPayments: [OneOffPayment]
    notes: [Note]
  }

  input AccountInput {
    bankBalance: Float
    monthlyIncome: Float
  }

  type AccountResponse {
    account: Account
    success: Boolean
  }

  type Mutation {
    createAccount(account: AccountInput!): AccountResponse!
    editAccount(id: ID!, account: AccountInput!): AccountResponse!
    deleteAccount(id: ID!): AccountResponse!
  }
`;
