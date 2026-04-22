import { describe, expect, it } from 'vitest';

import { resolveInvoiceStatus } from '@/lib/invoice-status';

describe('invoice status', () => {
  it('mantém a fatura quitada quando não existe despesa vinculada, mas o status salvo já é quitada', () => {
    expect(resolveInvoiceStatus('quitada', [])).toBe('quitada');
  });

  it('marca como quitada quando existe ao menos uma despesa vinculada paga', () => {
    expect(
      resolveInvoiceStatus('aberta', [
        { paga: false, data_pagamento: null },
        { paga: true, data_pagamento: '2026-04-20' },
      ]),
    ).toBe('quitada');
  });

  it('mantém aberta quando só existem despesas vinculadas em aberto', () => {
    expect(
      resolveInvoiceStatus('quitada', [
        { paga: false, data_pagamento: null },
      ]),
    ).toBe('aberta');
  });
});
