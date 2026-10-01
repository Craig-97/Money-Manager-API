import { mergeTypeDefs } from '@graphql-tools/merge';
import { typeDefs as user } from './user';
import { typeDefs as account } from './account';
import { typeDefs as bill } from './bill';
import { typeDefs as oneOffPayment } from './oneOffPayment';
import { typeDefs as recurringPayment } from './recurringPayment';
import { typeDefs as note } from './note';
import { typeDefs as payday } from './payday';

export const typeDefs = mergeTypeDefs([
  user,
  account,
  bill,
  oneOffPayment,
  recurringPayment,
  note,
  payday
]);
