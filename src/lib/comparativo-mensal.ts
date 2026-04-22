export type ComparisonDateType = 'competencia' | 'pagamento';

type InvoiceMonthParams = {
  tipoData: ComparisonDateType;
  competencia: string | null | undefined;
  paymentDate: string | null | undefined;
};

export function getMonthsBetween(start: string, end: string) {
  const result: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);

  let year = sy;
  let month = sm;

  while (year < ey || (year === ey && month <= em)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return result;
}

export function getMonthDateRange(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${monthValue}-01`,
    end: `${monthValue}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getMonthKey(value: string | null | undefined) {
  return value?.substring(0, 7) ?? null;
}

export function resolveInvoiceItemMonth({
  tipoData,
  competencia,
  paymentDate,
}: InvoiceMonthParams) {
  if (tipoData === 'competencia') {
    return getMonthKey(competencia);
  }

  return getMonthKey(paymentDate);
}
