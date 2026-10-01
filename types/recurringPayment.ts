export interface RecurringPaymentFields {
  name: string;
  amount: number;
  category: string;
  frequency: string;
  type: string;
  firstPaymentDate: string;
  lastPaymentDate?: string;
}

export interface CreateRecurringPaymentInput extends RecurringPaymentFields {
  accountId: string;
}

export type UpdateRecurringPaymentInput = Partial<RecurringPaymentFields>;

export type BatchUpdateRecurringPaymentInput = UpdateRecurringPaymentInput & { id: string };
