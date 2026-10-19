import { userResolvers } from './user';
import { budgetResolvers } from './budget';
import { accountResolvers } from './account';
import { oneOffPaymentResolvers, paymentRecordResolvers, recurringPaymentResolvers } from './payment';
import { noteResolvers } from './note';
import { paydayResolvers } from './payday';
import { reminderResolvers } from './reminder';

// Every topic's resolvers; makeExecutableSchema merges them
export const resolvers = [
  userResolvers,
  budgetResolvers,
  accountResolvers,
  oneOffPaymentResolvers,
  recurringPaymentResolvers,
  paymentRecordResolvers,
  noteResolvers,
  paydayResolvers,
  reminderResolvers
];
