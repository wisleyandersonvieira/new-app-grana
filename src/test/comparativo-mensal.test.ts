import { describe, expect, it } from 'vitest';

import {
  getMonthDateRange,
  getMonthsBetween,
  isInvoiceItemWithinRange,
  resolveInvoiceItemDate,
  resolveInvoiceItemMonth,
} from '@/lib/comparativo-mensal';

describe('comparativo mensal helpers', () => {
  it('lista todos os meses dentro do intervalo', () => {
    expect(getMonthsBetween('2026-01', '2026-04')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
  });

  it('retorna o último dia real do mês', () => {
    expect(getMonthDateRange('2026-02')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('usa a competência quando o filtro é por competência', () => {
    expect(
      resolveInvoiceItemMonth({
        tipoData: 'competencia',
        competencia: '2026-03-01',
        paymentDate: '2026-04-05',
      }),
    ).toBe('2026-03');
  });

  it('usa apenas a data real de pagamento quando o filtro é por pagamento', () => {
    expect(
      resolveInvoiceItemDate({
        tipoData: 'pagamento',
        competencia: '2026-03-01',
        paymentDate: '2026-04-05',
      }),
    ).toBe('2026-04-05');

    expect(
      resolveInvoiceItemMonth({
        tipoData: 'pagamento',
        competencia: '2026-03-01',
        paymentDate: '2026-04-05',
      }),
    ).toBe('2026-04');

    expect(
      resolveInvoiceItemMonth({
        tipoData: 'pagamento',
        competencia: '2026-03-01',
        paymentDate: null,
      }),
    ).toBeNull();
  });

  it('considera o intervalo correto ao filtrar itens de fatura por pagamento', () => {
    expect(
      isInvoiceItemWithinRange({
        tipoData: 'pagamento',
        competencia: '2026-03-01',
        paymentDate: '2026-04-05',
        startMonth: '2026-04',
        endMonth: '2026-04',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      }),
    ).toBe(true);

    expect(
      isInvoiceItemWithinRange({
        tipoData: 'pagamento',
        competencia: '2026-03-01',
        paymentDate: '2026-05-01',
        startMonth: '2026-04',
        endMonth: '2026-04',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      }),
    ).toBe(false);
  });
});
