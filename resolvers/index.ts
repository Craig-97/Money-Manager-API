import { userResolvers } from './user';
import { accountResolvers } from './account';
import { oneOffPaymentResolvers, paymentRecordResolvers, recurringPaymentResolvers } from './payment';
import { noteResolvers } from './note';
import { paydayResolvers } from './payday';

// Every topic's resolvers; makeExecutableSchema merges them
export const resolvers = [
  userResolvers,
  accountResolvers,
  oneOffPaymentResolvers,
  recurringPaymentResolvers,
  paymentRecordResolvers,
  noteResolvers,
  paydayResolvers
];
