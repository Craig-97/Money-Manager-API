import type { Request } from 'express';
import { isValidObjectId, type ClientSession, type Model, type Types } from 'mongoose';
import { checkBudgetAccess } from '../../middleware/isAuth';
import { Budget } from '../../models/budget/Budget';
import { BUDGET_NOT_FOUND } from '../errors/budget/budgetErrors';

const incrementVersion = <T extends { __v?: number }>(doc: T): T => {
  doc.__v = (doc.__v || 0) + 1;
  return doc;
};

export { incrementVersion };

/* A budget by id, in the transaction when there is one */
export const budgetOrThrow = async (id: Types.ObjectId | string, session?: ClientSession) => {
  const budget = await Budget.findById(id).session(session ?? null);
  if (!budget) throw BUDGET_NOT_FOUND(id);
  return budget;
};

/*
 * A document the signed-in user can change: it has to be in one of their budgets. An id that isn't
 * one is not found, the same as one that doesn't exist.
 */
export const ownDocumentOrThrow = async <T extends { budget: Types.ObjectId }>(
  model: Model<T>,
  { id, req, notFound }: { id: string; req: Request; notFound: (id: string) => Error }
) => {
  const document = isValidObjectId(id) ? await model.findById(id) : null;
  if (!document) throw notFound(id);
  await checkBudgetAccess(document.budget, req);
  return document;
};
