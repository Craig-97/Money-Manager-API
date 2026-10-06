import { userResolvers } from './user';
import { accountResolvers } from './account';
import { oneOffPaymentResolvers, recurringPaymentResolvers } from './payment';
import { noteResolvers } from './note';
import { paydayResolvers } from './payday';

// Every topic's resolvers; makeExecutableSchema merges them
export const resolvers = [
  userResolvers,
  accountResolvers,
  oneOffPaymentResolvers,
  recurringPaymentResolvers,
  noteResolvers,
  paydayResolvers
];
