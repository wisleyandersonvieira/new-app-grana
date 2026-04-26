import { describe, expect, it } from 'vitest';

import {
  buildInvoicePaymentDateMap,
  getPaidInvoiceIds,
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

  it('monta o mapa de pagamento das faturas pelo lançamento consolidado', () => {
    const rows = [
      { lote_id: 'fatura-1', data_pagamento: '2026-04-05' },
      { lote_id: 'fatura-2', data_pagamento: null },
      { lote_id: null, data_pagamento: '2026-04-10' },
      { lote_id: 'fatura-1', data_pagamento: '2026-04-07' },
    ];

    const paymentMap = buildInvoicePaymentDateMap(rows);

    expect(paymentMap.get('fatura-1')).toBe('2026-04-07');
    expect(paymentMap.has('fatura-2')).toBe(false);
    expect(getPaidInvoiceIds(rows)).toEqual(['fatura-1']);
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
