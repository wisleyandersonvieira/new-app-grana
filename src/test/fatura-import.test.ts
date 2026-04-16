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

describe('Sicoob parser – large invoice with multiple cardholders', () => {
  const CTX = { competencia: '2026-04' };

  it('parses all purchase transactions from multi-cardholder Sicoob invoice', () => {
    const text = `SICOOB CARD
Olá, JESSICA!
Esta é a fatura de abril
no valor total de R$ 20.511,34.
4340 - SICOOB METROPOLITANO
VENCIMENTO 11 ABR 2026
RESUMO DA FATURA
FATURA ANTERIOR 10.813,32
PAGAMENTOS RECEBIDOS - 10.887,91
MOVIMENTAÇÕES DA CONTA
SALDO ANTERIOR R$ 10.813,32
01 OUT ANUIDADE MASTERCARD (5468) 06/12 R$ 149,17
01 OUT DESC ANUIDADE POR USO MAS -R$ 74,59
07 MAR IOF OPERACAO EXTERIOR R$ 5,55
Proteção Perda ou Roubo
11 MAR PAGAMENTO DEBITO EM CONTA -R$ 10.813,32
14 MAR IOF OPERACAO EXTERIOR R$ 8,27
26 MAR IOF OPERACAO EXTERIOR R$ 28,94
DATA DESCRIÇÃO CIDADE VALOR EM R$
JESSICA L R S VIEIRA 7372
30 OUT COMPARTILHAV 06/06 SAO PAULO R$ 226,65
05 JAN GOCASE *GocaseV 03/03 EXTREMA R$ 95,24
16 JAN CASA DOS UNIFORMES M 03/05 MARINGA R$ 363,18
19 JAN OTICA LEONEL 03/03 MARINGA R$ 933,34
19 FEV CULTURA INGLESAV 02/05 MARINGA R$ 1.925,02
26 FEV MEDICINAL FARMACIA E 02/02 MARINGA R$ 671,50
TOTAL DE JESSICA R$ 4.214,93
WISLEY ANDERSON VIEIRA 8834
08 JUL RECANTO CATARATAS HO 09/10 FOZ DO IGUACU R$ 1.162,35
21 OUT CLINICA RITHA CAPELA 06/06 MARINGA R$ 3.766,65
28 FEV Google YouTubePremiu SAO PAULO R$ 26,90
03 MAR Google OneV SAO PAULO R$ 12,50
TOTAL DE WISLEY R$ 4.968,40
JESSICA L R S VIEIRA 5468
07 MAR LIVELO S.A.*Clube Li SANTANA DE PA R$ 44,90
07 MAR LIVELO SANTANA DE PA R$ 42,00
07 MAR UNITED01643766419805 HOUNSLOW US$ 29,99 U$ 29,99
V.DOL 5,2878
R$ 158,58
07 MAR UNITED AIRLId02ae270 01/04 SAO PAULO R$ 1.397,42
14 MAR WWW.F1.COMV LONDON US$ 44,99 U$ 44,99
V.DOL 5,2541
R$ 236,38
17 MAR COBASI MARINGA 01/03 MARINGA R$ 112,34
19 MAR MP *VILLEENFANCEV 01/02 MARINGA R$ 109,95
20 MAR IG*OrigoEnergiaV 01/12 Sao Paulo R$ 700,11
26 MAR RAIA1732 GUARULHOS R$ 48,89
26 MAR ASICS CorporationV Irvine US$ 158,15 U$ 158,15
V.DOL 5,2275
R$ 826,73
26 MAR AMAZON MKTPL*B58WW5E SEATTLE US$ 211,94 U$ 211,94
V.DOL 5,2308
R$ 1.108,62
26 MAR ESBELA COMERCIO DE P SAO PAULO R$ 25,80
SICOOB CARD
DATA DESCRIÇÃO CIDADE VALOR EM R$
26 MAR FAST SLEEP-CUMBICA GUARULHOS R$ 434,72
27 MAR AMAZON MARK* BC12H9C SEATTLE US$ 74,82 U$ 74,82
V.DOL 5,2308
R$ 391,37
27 MAR POSTO CATEDRAL MARINGA R$ 350,06
30 MAR ARENA TENNISTORMV MARINGA R$ 342,00
31 MAR JOAO PAULINO MARINGA R$ 724,24
TOTAL DE JESSICA R$ 7.054,11
WISLEY ANDERSON VIEIRA 5476
25 MAR adidas 6144 Orlando Orlando US$ 63,88 U$ 63,88
V.DOL 5,2275
R$ 333,93
25 MAR WALGREENS #15023 WINTER GARDEN US$ 62,18 U$ 62,18
V.DOL 5,2599
R$ 327,06
25 MAR CADRI MARKET & DELI WINTER GARDEN US$ 122,88 U$ 122,88
V.DOL 5,2275
R$ 642,36
25 MAR PETER GLENN #18 ORLANDO US$ 244,91 U$ 244,91
V.DOL 5,2275
R$ 1.280,27
29 MAR AMAZON RETA* B57NS59 SEATTLE US$ 13,76 U$ 13,76
V.DOL 5,2376
R$ 72,07
30 MAR Google YouTubePremiu SAO PAULO R$ 26,90
31 MAR AMAZON MARK* BG5PJ4P SEATTLE US$ 149,32 U$ 149,32
V.DOL 5,2353
R$ 781,73
31 MAR AMAZON MARK* BG15U9P SEATTLE US$ 95,86 U$ 95,86
V.DOL 5,2353
R$ 501,86
TOTAL DE WISLEY R$ 3.966,18
TOTAL R$ 20.511,34`;

    const items = parseStatementText(text, CTX);
    // Should find all 34 purchase transactions (excluding IOF, anuidade, pagamento)
    // 6 (JESSICA 7372) + 4 (WISLEY 8834) + 16 (JESSICA 5468) + 8 (WISLEY 5476) = 34
    // But dedup removes Google YouTubePremiu (appears for both cardholders with same date/value)
    // Actually they are on different dates (28 FEV vs 30 MAR) so no dedup
    expect(items.length).toBeGreaterThanOrEqual(34);

    // Verify international transactions are parsed with R$ values
    const united = items.find(i => i.descricao_normalizada.includes('united'));
    expect(united).toBeDefined();
    expect(united!.valor).toBeCloseTo(158.58, 1);

    const asics = items.find(i => i.descricao_normalizada.includes('asics'));
    expect(asics).toBeDefined();
    expect(asics!.valor).toBeCloseTo(826.73, 1);

    const adidas = items.find(i => i.descricao_normalizada.includes('adidas'));
    expect(adidas).toBeDefined();
    expect(adidas!.valor).toBeCloseTo(333.93, 1);
  });
});
