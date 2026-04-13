import { describe, expect, it } from 'vitest';
import { extractInstallmentInfo, normalizeInstallmentText, normalizeStatementDescription } from '@/lib/fatura-import/normalization';
import { identifyBankFromText, parseStatementText } from '@/lib/fatura-import/service';

describe('fatura import helpers', () => {
  it('normaliza descricoes e extrai parcelas', () => {
    expect(normalizeInstallmentText('08/08')).toBe('8/8');
    expect(extractInstallmentInfo('LATAM AIR 08/08')).toEqual({
      parcelas: '8/8',
      descricaoSemParcelas: 'LATAM AIR',
    });
    expect(normalizeStatementDescription('APPLE.COM/BILL 01/10')).toBe('apple com bill');
  });

  it('identifica o banco suportado', () => {
    expect(identifyBankFromText('Itaú\nResumo da fatura\nLançamentos: compras e saques')).toBe('itau');
    expect(identifyBankFromText('Sicoob Card\nResumo da fatura\nMovimentações da conta')).toBe('sicoob');
  });

  it('parseia linhas de lancamento com data, valor e parcelas', () => {
    const items = parseStatementText(
      [
        'Itaú',
        'Resumo da fatura',
        'Lançamentos: compras e saques',
        '08/03 LATAM AIR 08/08 1.234,56',
        '10/03 IFOOD 54,90',
      ].join('\n'),
      { competencia: '2026-04' },
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      descricao_original: 'LATAM AIR 08/08',
      descricao_normalizada: 'latam air',
      data_compra: '2026-03-08',
      valor: 1234.56,
      parcelas: '8/8',
      banco_origem: 'itau',
    });
  });
});
