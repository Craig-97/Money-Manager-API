import mongoose from 'mongoose';
import { PaymentCategory } from '../../constants/payment';

/*
 * One-off and recurring payments had their own category lists. They now share one, so each old
 * category moves to the new one it fits. Payments, and the copies the payment records keep of
 * them, are both changed, so history adds up under the new categories.
 *
 * Food is split by the payment's name: takeaways, restaurants, pubs and cafés go to Eating out,
 * and everything else to Groceries.
 *
 * Only categories that aren't in the new list are changed, so running it again does nothing.
 */

const MOVES: Record<string, PaymentCategory> = {
  // Recurring
  MORTGAGE: 'BILLS',
  RENT: 'BILLS',
  UTILITIES: 'BILLS',
  HOME_MAINTENANCE: 'BILLS',
  TAX: 'BILLS',
  VEHICLE: 'TRANSPORT',
  LOAN: 'FINANCES',
  CREDIT_CARD: 'FINANCES',
  INVESTMENT: 'SAVINGS',
  INSURANCE: 'FINANCES',
  HEALTHCARE: 'PERSONAL_CARE',
  CHILDCARE: 'FAMILY',
  EDUCATION: 'FAMILY',
  SUBSCRIPTION: 'SUBSCRIPTIONS',
  MEMBERSHIP: 'SUBSCRIPTIONS',
  BUSINESS: 'EXPENSES',
  OTHER: 'GENERAL',
  // One-off, besides those above
  TRANSFER: 'TRANSFERS',
  FEES: 'FINANCES',
  TAXES: 'BILLS',
  HOME: 'SHOPPING',
  TRAVEL: 'HOLIDAYS',
  GIFT: 'GIFTS',
  PETS: 'FAMILY',
  SALARY: 'INCOME'
};

// Whole words, so a "Barclays" or "crowbar" payment isn't taken for a bar
const EATING_OUT =
  /\b(deliveroo|just ?eat|uber ?eats|take ?away|restaurant|pub|bar|cafe|coffee|starbucks|costa|pret|greggs|pizza|nando'?s|mcdonald'?s|kfc|burger|dinner|lunch|breakfast|brunch|meal out|curry|chinese|indian|thai|sushi|kebab|chippy|chip shop)s?\b|café/i;

export const newCategory = (category: string, name: string): PaymentCategory | null => {
  if (category === 'FOOD') return EATING_OUT.test(name) ? 'EATING_OUT' : 'GROCERIES';
  return MOVES[category] ?? null;
};

export interface PaymentCategoriesResult {
  // How many of each were found with an old category, and how many changed
  recurring: number;
  oneOff: number;
  records: number;
  changed: number;
}

interface StoredPayment {
  _id: mongoose.Types.ObjectId;
  name: string;
  category: string;
}

interface StoredRecord {
  _id: mongoose.Types.ObjectId;
  payment: { name: string; category: string };
}

const OLD = { $nin: Object.values(PaymentCategory) };

export const migratePaymentCategories = async ({ apply }: { apply: boolean }) => {
  const db = mongoose.connection;
  const result: PaymentCategoriesResult = { recurring: 0, oneOff: 0, records: 0, changed: 0 };

  const movePayments = async (name: string) => {
    const payments = db.collection<StoredPayment>(name);
    const found = await payments.find({ category: OLD }).toArray();
    const writes = found.flatMap(payment => {
      const category = newCategory(payment.category, payment.name);
      return category
        ? [{ updateOne: { filter: { _id: payment._id }, update: { $set: { category } } } }]
        : [];
    });
    if (apply && writes.length) result.changed += (await payments.bulkWrite(writes)).modifiedCount;
    return found.length;
  };

  result.recurring = await movePayments('recurringpayments');
  result.oneOff = await movePayments('oneoffpayments');

  const records = db.collection<StoredRecord>('paymentrecords');
  const found = await records.find({ 'payment.category': OLD }).toArray();
  result.records = found.length;
  const writes = found.flatMap(record => {
    const category = newCategory(record.payment.category, record.payment.name);
    return category
      ? [
          {
            updateOne: {
              filter: { _id: record._id },
              update: { $set: { 'payment.category': category } }
            }
          }
        ]
      : [];
  });
  if (apply && writes.length) result.changed += (await records.bulkWrite(writes)).modifiedCount;

  return result;
};
