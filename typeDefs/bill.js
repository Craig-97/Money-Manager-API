exports.typeDefs = `
  type Query {
    bills: [Bill!]!
    bill(id: ID): Bill
  }

  type Bill {
    id: ID!
    account: ID!
    name: String!
    amount: Float!
    paid: Boolean!
  }

  input BillInput {
    account: ID
    name: String
    amount: Float
    paid: Boolean
  }

  type BillResponse {
    bill: Bill
    success: Boolean
  }

  type Mutation {
    createBill(bill: BillInput!): BillResponse!
    editBill(id: ID!, bill: BillInput!): BillResponse!
    deleteBill(id: ID!): BillResponse!
  }
`;
