import { resolvers as user } from './user';
import { resolvers as account } from './account';
import { resolvers as bill } from './bill';
import { resolvers as oneOffPayment } from './oneOffPayment';
import { resolvers as note } from './note';
import { resolvers as payday } from './payday';
import { resolvers as recurringPayment } from './recurringPayment';

export const resolvers = [user, account, bill, oneOffPayment, recurringPayment, note, payday];
