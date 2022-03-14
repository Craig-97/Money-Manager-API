const account = require('./account');
const bill = require('./bill');
const oneOffPayment = require('./oneOffPayment');

export const resolvers = [account.resolvers, bill.resolvers, oneOffPayment.resolvers];
