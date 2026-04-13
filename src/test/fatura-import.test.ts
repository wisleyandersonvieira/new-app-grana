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

  // ── Itaú real-PDF scenarios ──────────────────────────────────────────────

  describe('Itaú – formato real da fatura', () => {
    const CTX = { competencia: '2026-03' };

    // Helper: minimal Itaú header so canParse() passes
    const withHeader = (body: string) =>
      `Banco Itaú S.A.\nResumo da fatura em R$\nLançamentos: compras e saques\n${body}`;

    it('parseia lançamentos em formato de linha completa', () => {
      const text = withHeader(
        [
          '22/08 VIVARA MOR 08/10 930,15',
          'DIVERSOS .SAO PAULO',
          '28/08 LATAM AIR 08/08 1.765,52',
          'SAO PAULO',
          '07/03 KANPAI 101,90',
          'ALIMENTAÇÃO .MARINGA',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);
      expect(items.length).toBeGreaterThanOrEqual(3);

      const vivara = items.find((i) => i.descricao_normalizada.includes('vivara'));
      expect(vivara).toBeDefined();
      expect(vivara?.valor).toBe(930.15);
      expect(vivara?.parcelas).toBe('8/10');

      const latam = items.find((i) => i.descricao_normalizada.includes('latam'));
      expect(latam).toBeDefined();
      expect(latam?.valor).toBe(1765.52);
      expect(latam?.parcelas).toBe('8/8');
    });

    it('reconstrói lançamentos de PDFs com um token por célula', () => {
      // Simulates a PDF extractor that puts each table cell on its own line.
      const text = withHeader(
        [
          '22/08',
          'VIVARA MOR',
          '08/10',
          '930,15',
          'DIVERSOS .SAO PAULO',
          '07/03',
          'KANPAI',
          '101,90',
          'ALIMENTAÇÃO .MARINGA',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);
      expect(items.length).toBeGreaterThanOrEqual(2);

      const vivara = items.find((i) => i.descricao_normalizada.includes('vivara'));
      expect(vivara).toBeDefined();
      expect(vivara?.valor).toBe(930.15);
      expect(vivara?.parcelas).toBe('8/10');
    });

    it('exclui lançamentos da seção "Compras parceladas – próximas faturas"', () => {
      const text = withHeader(
        [
          '07/03 KANPAI 101,90',
          // Future-instalment section – must NOT be imported
          'Compras parceladas - próximas faturas',
          '22/08 VIVARA MOR 09/10 930,15',
          '27/09 CLUBE LIVELO*Clube08/12 24,90',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);
      // Only KANPAI (current period) should be found; future instalments excluded
      expect(items).toHaveLength(1);
      expect(items[0].descricao_normalizada).toContain('kanpai');
    });

    it('filtra linhas de resumo por cartão (com acento)', () => {
      const text = withHeader(
        [
          '07/03 KANPAI 101,90',
          'Lançamentos no cartão (final 8275) 11.096,14',
          'Lançamentos no cartão (final 9286) 687,13',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);
      expect(items).toHaveLength(1);
      expect(items[0].descricao_normalizada).toContain('kanpai');
    });

    it('filtra linhas internacionais com USD', () => {
      const text = withHeader(
        [
          '03/03 AMAZON MKTPL*BE8ZQ41X1 494,54',
          'SEATTLE 87,53 USD 87,53',
          'Dólar de Conversão R$ 5,65',
          '07/03 KANPAI 101,90',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);
      const amazon = items.find((i) => i.descricao_normalizada.includes('amazon'));
      expect(amazon).toBeDefined();
      expect(amazon?.valor).toBe(494.54);

      // USD metadata lines must not appear as extra transactions
      const usdLine = items.find((i) => i.descricao_normalizada.includes('seattle'));
      expect(usdLine).toBeUndefined();
    });

    it('parseia estornos com valor negativo "- 52,50"', () => {
      const text = withHeader('03/04 ESTORNO DE ANUIDADE DIF - 52,50');
      const items = parseStatementText(text, CTX);
      expect(items).toHaveLength(1);
      expect(items[0].valor).toBe(-52.50);
    });
  });
});
