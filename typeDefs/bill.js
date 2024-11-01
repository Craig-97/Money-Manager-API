exports.typeDefs = `
  type Query {
    bills(accountId: ID): [Bill!]!
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

  input BatchBillUpdateInput {
    ids: [ID!]!
    paid: Boolean!
  }

  type BillResponse {
    bill: Bill
    success: Boolean
  }

  type BatchBillResponse {
    bills: [Bill]!
    success: Boolean!
    updatedCount: Int!
  }

  type BatchDeleteResponse {
    success: Boolean!
    deletedCount: Int!
  }

  type Mutation {
    createBill(bill: BillInput!): BillResponse!
    editBill(id: ID!, bill: BillInput!): BillResponse!
    deleteBill(id: ID!): BillResponse!
    batchUpdateBills(input: BatchBillUpdateInput!): BatchBillResponse!
    batchDeleteBills(ids: [ID!]!): BatchDeleteResponse!
  }
`;
