export const commonTypeDefs = `
  # For operations with nothing to give back but whether they worked
  type SuccessResponse {
    success: Boolean!
  }

  # Every delete answers the same way, whether it removed one record or several
  type DeleteResponse {
    success: Boolean!
    deletedCount: Int!
    ids: [ID!]!
  }
`;
