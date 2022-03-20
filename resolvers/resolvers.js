const account = require('./account');
const bill = require('./bill');
const oneOffPayment = require('./oneOffPayment');
const note = require('./note');

export const resolvers = [
  account.resolvers,
  bill.resolvers,
  oneOffPayment.resolvers,
  note.resolvers
];
