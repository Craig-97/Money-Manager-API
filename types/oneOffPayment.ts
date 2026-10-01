export interface OneOffPaymentInput {
  account?: string;
  name?: string;
  amount?: number;
  dueDate?: string;
  type?: string;
  category?: string;
}

// Create mutations rely on these fields being present even though the schema marks them optional
export type CreateOneOffPaymentInput = OneOffPaymentInput & {
  account: string;
  name: string;
  type: string;
};
