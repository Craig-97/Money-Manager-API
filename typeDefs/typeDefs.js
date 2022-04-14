const { mergeTypeDefs } = require('@graphql-tools/merge');
const user = require('./user');
const account = require('./account');
const bill = require('./bill');
const oneOffPayment = require('./oneOffPayment');
const note = require('./note');

const types = [
  user.typeDefs,
  account.typeDefs,
  bill.typeDefs,
  oneOffPayment.typeDefs,
  note.typeDefs
];

export const typeDefs = mergeTypeDefs(types);
