export type InvoiceStatus = 'aberta' | 'quitada';

type InvoiceLinkedExpense = {
  paga?: boolean | null;
  data_pagamento?: string | null;
};

export function resolveInvoiceStatus(
  storedStatus: string | null | undefined,
  linkedExpenses: InvoiceLinkedExpense[],
): InvoiceStatus {
  const hasPaidExpense = linkedExpenses.some(
    (expense) => expense.paga === true || Boolean(expense.data_pagamento),
  );

  if (hasPaidExpense) {
    return 'quitada';
  }

  if (linkedExpenses.length > 0) {
    return 'aberta';
  }

  return storedStatus === 'quitada' ? 'quitada' : 'aberta';
}
