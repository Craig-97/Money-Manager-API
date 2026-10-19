import { mergeTypeDefs } from '@graphql-tools/merge';
import { commonTypeDefs } from './common';
import { userTypeDefs } from './user';
import { budgetTypeDefs } from './budget';
import { oneOffPaymentTypeDefs, recurringPaymentTypeDefs } from './payment';
import { noteTypeDefs } from './note';
import { paydayTypeDefs } from './payday';
import { reminderTypeDefs } from './reminder';

// Every topic's part of the schema, merged into one
export const typeDefs = mergeTypeDefs([
  commonTypeDefs,
  userTypeDefs,
  budgetTypeDefs,
  oneOffPaymentTypeDefs,
  recurringPaymentTypeDefs,
  noteTypeDefs,
  paydayTypeDefs,
  reminderTypeDefs
]);
