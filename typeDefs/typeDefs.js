const { mergeTypeDefs } = require('@graphql-tools/merge');
const user = require('./user');
const account = require('./account');
const bill = require('./bill');
const oneOffPayment = require('./oneOffPayment');
const note = require('./note');
const payday = require('./payday');
const recurringPayment = require('./recurringPayment');

const types = [
  user.typeDefs,
  account.typeDefs,
  bill.typeDefs,
  oneOffPayment.typeDefs,
  recurringPayment.typeDefs,
  note.typeDefs,
  payday.typeDefs
];

export const typeDefs = mergeTypeDefs(types);
