export interface BillInput {
  account?: string;
  name?: string;
  amount?: number;
  paid?: boolean;
}

// Create mutations rely on these fields being present even though the schema marks them optional
export type CreateBillInput = BillInput & { account: string; name: string };

export interface BatchBillUpdateInput {
  ids: string[];
  paid: boolean;
}
