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

export function resolveInvoiceItemDate({
  tipoData,
  competencia,
  paymentDate,
}: InvoiceMonthParams) {
  if (tipoData === 'competencia') {
    return competencia ?? null;
  }

  return paymentDate ?? null;
}

export function resolveInvoiceItemMonth({
  tipoData,
  competencia,
  paymentDate,
}: InvoiceMonthParams) {
  return getMonthKey(resolveInvoiceItemDate({ tipoData, competencia, paymentDate }));
}

type InvoiceRangeParams = InvoiceMonthParams & {
  startMonth: string;
  endMonth: string;
  startDate: string;
  endDate: string;
};

export function isInvoiceItemWithinRange({
  tipoData,
  competencia,
  paymentDate,
  startMonth,
  endMonth,
  startDate,
  endDate,
}: InvoiceRangeParams) {
  if (tipoData === 'competencia') {
    const month = resolveInvoiceItemMonth({ tipoData, competencia, paymentDate });
    return Boolean(month && month >= startMonth && month <= endMonth);
  }

  const date = resolveInvoiceItemDate({ tipoData, competencia, paymentDate });
  return Boolean(date && date >= startDate && date <= endDate);
}
