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

 input CreateAccountInput {
    bankBalance: Float!
    monthlyIncome: Float!
    bills: [BillInput]  
    oneOffPayments: [OneOffPaymentInput] 
    userId: ID!
  }

  input EditAccountInput {
    bankBalance: Float
    monthlyIncome: Float
  }


  type AccountResponse {
    account: Account
    success: Boolean
  }

  type Mutation {
    createAccount(account: CreateAccountInput!): AccountResponse!
    editAccount(id: ID!, account: EditAccountInput!): AccountResponse!
    deleteAccount(id: ID!): AccountResponse!
  }
`;
