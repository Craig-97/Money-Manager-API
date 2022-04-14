const user = require('./user');
const account = require('./account');
const bill = require('./bill');
const oneOffPayment = require('./oneOffPayment');
const note = require('./note');

export const resolvers = [
  user.resolvers,
  account.resolvers,
  bill.resolvers,
  oneOffPayment.resolvers,
  note.resolvers
];
