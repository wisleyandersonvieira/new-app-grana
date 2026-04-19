import { describe, expect, it } from 'vitest';
import {
  extractInstallmentInfo,
  inferTransactionDate,
  normalizeInstallmentText,
  normalizeStatementDescription,
  parseBrazilianCurrency,
} from '@/lib/fatura-import/normalization';
import { identifyBankFromText, parseStatementText } from '@/lib/fatura-import/service';
import { splitIntoColumns } from '@/lib/fatura-import/pdf-text';
import {
  classifyItauLine,
  debugItauParsing,
  rebuildBrokenItauTransactionLines,
} from '@/lib/fatura-import/parsers/itau-helpers';
import {
  cleanItauNoisePrefix,
  extractItauTransactionParts,
  isItauCardSummaryLine,
  isItauCategoryCityLine,
  isItauFutureInstallmentSectionStart,
  isItauInternationalMetadataLine,
  isItauTransactionLine,
  parseItauStatement,
  preprocessItauText,
  rebuildBrokenItauTransactionLines,
} from '@/lib/fatura-import/parsers/itau-helpers';

// ── splitIntoColumns ──────────────────────────────────────────────────────────

describe('splitIntoColumns', () => {
  const PAGE_WIDTH = 595; // A4 em pontos PDF
  const MID = PAGE_WIDTH / 2; // 297,5

  it('não divide página de coluna única (apenas valor à direita por linha)', () => {
    // Cada linha: data + descrição à esquerda, valor bem à direita
    // → somente 1 token no lado direito por linha → NÃO é duas colunas
    const tokens = [
      { x: 36, y: 700, str: '22/08', width: 28 },
      { x: 70, y: 700, str: 'VIVARA MOR', width: 80 },
      { x: 520, y: 700, str: '930,15', width: 40 },
      { x: 36, y: 685, str: '28/08', width: 28 },
      { x: 70, y: 685, str: 'LATAM AIR', width: 70 },
      { x: 520, y: 685, str: '1.765,52', width: 50 },
      { x: 36, y: 670, str: '07/03', width: 28 },
      { x: 70, y: 670, str: 'KANPAI', width: 55 },
      { x: 520, y: 670, str: '101,90', width: 40 },
    ];
    const cols = splitIntoColumns(tokens, PAGE_WIDTH);
    expect(cols).toHaveLength(1); // sem split
  });

  it('divide corretamente página com duas colunas de transações (layout Itaú)', () => {
    // Itaú: transações das duas colunas ficam na MESMA linha Y.
    // O bug anterior usava minX da linha → sempre era o da coluna esquerda,
    // então rightRowCount nunca crescia e o split era ignorado.
    const makeRow = (y: number, leftStr: string, rightStr: string) => [
      { x: 36,        y, str: leftStr.slice(0, 5),  width: 28 },  // data esq
      { x: 70,        y, str: leftStr.slice(6),      width: 120 }, // desc esq
      { x: 250,       y, str: '930,15',               width: 40 },  // valor esq
      { x: MID + 20,  y, str: rightStr.slice(0, 5),  width: 28 },  // data dir
      { x: MID + 55,  y, str: rightStr.slice(6),     width: 120 }, // desc dir
      { x: MID + 230, y, str: '435,00',               width: 40 },  // valor dir
    ];

    const tokens = [
      ...makeRow(700, '22/08 VIVARA MOR', '03/03 ARENA TENNISTORM'),
      ...makeRow(685, '28/08 LATAM AIR', '04/03 KANPAI'),
      ...makeRow(670, '07/03 POSTO PRES', '05/03 DUO MERCATO'),
      ...makeRow(655, '08/03 JOAO PAUL', '06/03 OH WHEY'),
    ];

    const cols = splitIntoColumns(tokens, PAGE_WIDTH);
    expect(cols).toHaveLength(2); // dividido em 2 colunas

    // Coluna esquerda: todos os tokens com centro < midpoint
    const leftCol = cols[0];
    expect(leftCol.every((t) => t.x + t.width / 2 < MID)).toBe(true);

    // Coluna direita: todos os tokens com centro >= midpoint
    const rightCol = cols[1];
    expect(rightCol.every((t) => t.x + t.width / 2 >= MID)).toBe(true);
  });
});

// ── fatura import helpers ─────────────────────────────────────────────────────

describe('fatura import helpers', () => {
  it('normaliza descricoes e extrai parcelas', () => {
    expect(normalizeInstallmentText('08/08')).toBe('8/8');
    expect(extractInstallmentInfo('LATAM AIR 08/08')).toEqual({
      parcelas: '8/8',
      descricaoSemParcelas: 'LATAM AIR',
    });
    expect(normalizeStatementDescription('APPLE.COM/BILL 01/10')).toBe('apple com bill');
  });

  it('converte moeda brasileira e infere datas por competencia', () => {
    expect(parseBrazilianCurrency('930,15')).toBe(930.15);
    expect(parseBrazilianCurrency('1.765,52')).toBe(1765.52);
    expect(parseBrazilianCurrency('- 52,50')).toBe(-52.5);
    expect(parseBrazilianCurrency('R$ 1.234,56')).toBe(1234.56);

    expect(inferTransactionDate('07/03', '2026-03')).toBe('2026-03-07');
    expect(inferTransactionDate('22/12', '2026-01')).toBe('2025-12-22');
  });

  it('identifica o banco suportado', () => {
    expect(identifyBankFromText('Itaú\nResumo da fatura\nLançamentos: compras e saques')).toBe('itau');
    expect(identifyBankFromText('Sicoob Card\nResumo da fatura\nMovimentações da conta')).toBe('sicoob');
  });

  it('não elimina lançamentos legítimos repetidos com mesma descrição e valor', () => {
    const items = parseStatementText(
      [
        'Itaú',
        'Resumo da fatura',
        'Lançamentos: compras e saques',
        '10/03 LOVABLE 167,74',
        '10/03 LOVABLE 167,74',
      ].join('\n'),
      { competencia: '2026-03' },
    );

    expect(items).toHaveLength(2);
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

  describe('helpers específicos do Itaú', () => {
    const ctx = { competencia: '2026-03' };

    it('classifica linhas do Itaú corretamente', () => {
      expect(cleanItauNoisePrefix(')))02/03 AV SAO PAULO-CT 02/02 269,88')).toBe('02/03 AV SAO PAULO-CT 02/02 269,88');
      expect(cleanItauNoisePrefix('@10/03 LOVABLE 167,74')).toBe('10/03 LOVABLE 167,74');

      expect(isItauCategoryCityLine('ALIMENTAÇÃO .MARINGA')).toBe(true);
      expect(isItauCategoryCityLine('DIVERSOS .SAO PAULO')).toBe(true);
      expect(isItauCardSummaryLine('Lançamentos no cartão (final 8275) 11.096,14')).toBe(true);
      expect(isItauInternationalMetadataLine('SEATTLE 87,53 USD 87,53')).toBe(true);
      expect(isItauInternationalMetadataLine('Dólar de Conversão R$ 5,65')).toBe(true);
      expect(isItauInternationalMetadataLine('DOVER 160,50 BRL 30,61')).toBe(true);
      expect(isItauFutureInstallmentSectionStart('Compras parceladas - próximas faturas')).toBe(true);
      expect(isItauTransactionLine('22/08 VIVARA MOR 08/10 930,15')).toBe(true);
      expect(isItauTransactionLine('03/04 ESTORNO DE ANUIDADE DIF - 52,50')).toBe(true);
    });

    it('reconstrói linhas quebradas do Itaú antes do parser principal', () => {
      const rebuilt = rebuildBrokenItauTransactionLines([
        '22/08',
        'VIVARA MOR',
        '08/10',
        '930,15',
        'ALIMENTAÇÃO .MARINGA',
        '07/03',
        'KANPAI',
        '101,90',
      ]);

      expect(rebuilt).toEqual([
        '22/08 VIVARA MOR 08/10 930,15',
        '07/03 KANPAI 101,90',
      ]);
    });

    it('preprocessa o texto do Itaú removendo ruído e parando em próximas faturas', () => {
      const lines = preprocessItauText([
        'Banco Itaú S.A.',
        'Resumo da fatura em R$',
        'Lançamentos: compras e saques',
        '22/08',
        'VIVARA MOR',
        '08/10',
        '930,15',
        'DIVERSOS .SAO PAULO',
        '10/03 LOVABLE 167,74',
        'DOVER 160,50 BRL 30,61',
        'Dólar de Conversão R$ 5,48',
        'Compras parceladas - próximas faturas',
        '27/09 CLUBE LIVELO*Clube08/12 24,90',
      ].join('\n'));

      expect(lines).toEqual([
        '22/08 VIVARA MOR 08/10 930,15',
        '10/03 LOVABLE 167,74',
      ]);
    });

    it('extrai partes da transação do Itaú com descrição colada e estorno', () => {
      expect(extractItauTransactionParts('18/02 FARMACIA E DROGARI02/02 182,01', ctx)).toMatchObject({
        descricao_original: 'FARMACIA E DROGARI02/02',
        descricao_normalizada: 'farmacia e drogari',
        data_compra: '2026-02-18',
        valor: 182.01,
        parcelas: '2/2',
        banco_origem: 'itau',
      });

      expect(extractItauTransactionParts('03/04 ESTORNO DE ANUIDADE DIF - 52,50', ctx)).toMatchObject({
        descricao_original: 'ESTORNO DE ANUIDADE DIF',
        descricao_normalizada: 'estorno de anuidade dif',
        data_compra: '2025-04-03',
        valor: -52.5,
        parcelas: null,
        banco_origem: 'itau',
      });
    });

    it('parseia o Itaú pela pipeline específica de preprocessamento + parser', () => {
      const items = parseItauStatement([
        '22/08 VIVARA MOR 08/10 930,15',
        '03/03 AMAZON MKTPL*BE8ZQ41X1 494,54',
        '07/03 KANPAI 101,90',
      ], ctx);

      expect(items).toHaveLength(3);
      expect(items[0].banco_origem).toBe('itau');
      expect(items.find((item) => item.descricao_normalizada.includes('vivara'))?.parcelas).toBe('8/10');
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

    it('ignora prefixos de ícone de pagamento ())) do símbolo NFC/contactless)', () => {
      // pdfjs-dist extrai o ícone de pagamento sem contato do Itaú como ")))".
      // Esses caracteres aparecem antes da data e quebravam a detecção de data.
      const text = withHeader(
        [
          '22/08 VIVARA MOR 08/10 930,15',
          'DIVERSOS .SAO PAULO',
          ')))02/03 AV SAO PAULO-CT 02/02 269,88',
          'ALIMENTAÇÃO .MARINGA',
          '@10/03 LOVABLE 167,74',
          'DIVERSOS .Osasco',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);
      expect(items.length).toBeGreaterThanOrEqual(3);

      const avSaoPaulo = items.find((i) => i.descricao_normalizada.includes('av sao paulo'));
      expect(avSaoPaulo).toBeDefined();
      expect(avSaoPaulo?.valor).toBe(269.88);
      expect(avSaoPaulo?.parcelas).toBe('2/2');

      const lovable = items.find((i) => i.descricao_normalizada.includes('lovable'));
      expect(lovable).toBeDefined();
      expect(lovable?.valor).toBe(167.74);
    });

    it('extrai parcelas de nomes truncados colados ao código (ex: DROGARI02/02)', () => {
      // Itaú trunca o nome do estabelecimento e cola o código de parcela diretamente,
      // sem espaço. Ex: "FARMACIA E DROGARI02/02" em vez de "DROGARI 02/02".
      const text = withHeader(
        [
          '18/02 FARMACIA E DROGARI02/02 182,01',
          'SAÚDE .MARINGA',
          '29/01 DEVILLE HOTEIS E T03/03 634,80',
          'TURISMO E ENTRETENIM.CAMPO GRANDE',
          '21/12 7076 SHOP BATEL C04/04 487,89',
          'VESTUÁRIO .CURITIBA',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);
      expect(items).toHaveLength(3);

      const farmacia = items.find((i) => i.descricao_normalizada.includes('farmacia'));
      expect(farmacia?.parcelas).toBe('2/2');
      expect(farmacia?.valor).toBe(182.01);

      const deville = items.find((i) => i.descricao_normalizada.includes('deville'));
      expect(deville?.parcelas).toBe('3/3');

      const shopBatel = items.find((i) => i.descricao_normalizada.includes('shop batel'));
      expect(shopBatel?.parcelas).toBe('4/4');
    });

    it('filtra linhas BRL da seção de lançamentos internacionais', () => {
      // A seção "Lançamentos internacionais" repete cada transação com o detalhamento
      // em moeda original. Linhas com "BRL" são breakdown — não devem virar transações.
      const text = withHeader(
        [
          '10/03 LOVABLE 167,74',
          'DOVER 160,50 BRL 30,61',
          'Dólar de Conversão R$ 5,48',
          '07/03 KANPAI 101,90',
          'ALIMENTAÇÃO .MARINGA',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);
      // LOVABLE e KANPAI devem ser capturados; a linha BRL deve ser ignorada
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.descricao_normalizada.includes('lovable'))?.valor).toBe(167.74);
      expect(items.find((i) => i.descricao_normalizada.includes('kanpai'))?.valor).toBe(101.90);
    });

    it('parseia fatura completa com múltiplos cartões e lançamentos internacionais', () => {
      // Simula o texto extraído de uma fatura Itaú real com:
      // - múltiplos titulares/cartões
      // - ícones NFC antes de datas
      // - nomes truncados com parcelas coladas
      // - seção de lançamentos internacionais (duplicatas + linhas BRL/USD)
      const text = withHeader(
        [
          // JESSICA R S VIEIRA (final 8275)
          '22/08 VIVARA MOR 08/10 930,15',
          'DIVERSOS .SAO PAULO',
          '18/02 FARMACIA E DROGARI02/02 182,01',
          'SAÚDE .MARINGA',
          ')))02/03 AV SAO PAULO-CT 02/02 269,88',
          'ALIMENTAÇÃO .MARINGA',
          '03/03 AMAZON MKTPL*BE8ZQ41X1 494,54',
          'SEATTLE 87,53 USD 87,53',
          'Dólar de Conversão R$ 5,65',
          '07/03 KANPAI 101,90',
          'ALIMENTAÇÃO .MARINGA',
          '03/04 ESTORNO DE ANUIDADE DIF - 52,50',
          // Summary lines – must be ignored
          'Lançamentos no cartão (final 8275) 11.096,14',
          // JESSICA R S VIEIRA (final 9286) – international section
          'Lançamentos internacionais',
          '10/03 LOVABLE 167,74',
          'DOVER 160,50 BRL 30,61',
          'Dólar de Conversão R$ 5,48',
          '18/03 UI BAKERY INC. 66,36',
          'AUSTIN 12,00 USD 12,00',
          'Dólar de Conversão R$ 5,53',
          'Total transações inter. em R$ 717,44',
          'Repasse de IOF em R$ 25,14',
          'Total lançamentos inter. em R$ 742,58',
        ].join('\n'),
      );

      const items = parseStatementText(text, CTX);

      // Core transactions must be present
      expect(items.find((i) => i.descricao_normalizada.includes('vivara'))).toBeDefined();
      expect(items.find((i) => i.descricao_normalizada.includes('farmacia'))).toBeDefined();
      expect(items.find((i) => i.descricao_normalizada.includes('av sao paulo'))).toBeDefined();
      expect(items.find((i) => i.descricao_normalizada.includes('amazon'))).toBeDefined();
      expect(items.find((i) => i.descricao_normalizada.includes('kanpai'))).toBeDefined();
      expect(items.find((i) => i.descricao_normalizada.includes('lovable'))).toBeDefined();

      // Estorno deve ter valor negativo
      const estorno = items.find((i) => i.descricao_normalizada.includes('estorno'));
      expect(estorno?.valor).toBe(-52.50);

      // Nenhuma transação espúria de linhas BRL/USD/totais
      expect(items.find((i) => i.descricao_normalizada.includes('dover'))).toBeUndefined();
      expect(items.find((i) => i.descricao_normalizada.includes('seattle'))).toBeUndefined();
      expect(items.find((i) => i.descricao_normalizada.includes('austin'))).toBeUndefined();
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
    expect(items).toHaveLength(35);
    expect(items.reduce((sum, item) => sum + item.valor, 0)).toBeCloseTo(20203.62, 2);

    const united = items.find((i) => i.descricao_normalizada.includes('united'));
    expect(united).toBeDefined();
    expect(united!.valor).toBeCloseTo(158.58, 1);

    const asics = items.find((i) => i.descricao_normalizada.includes('asics'));
    expect(asics).toBeDefined();
    expect(asics!.valor).toBeCloseTo(826.73, 1);

    const adidas = items.find((i) => i.descricao_normalizada.includes('adidas'));
    expect(adidas).toBeDefined();
    expect(adidas!.valor).toBeCloseTo(333.93, 1);
  });

  it('parses the exact text structure produced by the PDF extractor for this invoice', () => {
    const text = `SICOOB CARD
JESSICA L R S VIEIRA
REF 2 MAR A 1 ABR
DATA DESCRIÇÃO CIDADE VALOR EM R$
JESSICA L R S VIEIRA 7372
30 OUT COMPARTILHAV 06/06 SAO PAULO R$ 226,65
05 JAN GOCASE *GocaseV 03/03 EXTREMA R$ 95,24
CASA DOS UNIFORMES M
16 JAN MARINGA R$ 363,18
03/05
19 JAN OTICA LEONEL 03/03 MARINGA R$ 933,34
CULTURA INGLESAV
19 FEV MARINGA R$ 1.925,02
02/05
MEDICINAL FARMACIA E
26 FEV MARINGA R$ 671,50
02/02
TOTAL DE JESSICA R$ 4.214,93
WISLEY ANDERSON VIEIRA 8834
RECANTO CATARATAS HO
08 JUL FOZ DO IGUACU R$ 1.162,35
09/10
CLINICA RITHA CAPELA
21 OUT MARINGA R$ 3.766,65
06/06
28 FEV Google YouTubePremiu SAO PAULO R$ 26,90
03 MAR Google OneV SAO PAULO R$ 12,50
TOTAL DE WISLEY R$ 4.968,40
JESSICA L R S VIEIRA 5468
07 MAR LIVELO S.A.*Clube Li SANTANA DE PA R$ 44,90
07 MAR LIVELO SANTANA DE PA R$ 42,00
07 MAR UNITED01643766419805 HOUNSLOW
US$ 29,99 U$ 29,99
R$ 158,58
V.DOL 5,2878
UNITED AIRLId02ae270
07 MAR SAO PAULO R$ 1.397,42
01/04
14 MAR WWW.F1.COMV LONDON
US$ 44,99 U$ 44,99
R$ 236,38
V.DOL 5,2541
17 MAR COBASI MARINGA 01/03 MARINGA R$ 112,34
MP *VILLEENFANCEV
19 MAR MARINGA R$ 109,95
01/02
20 MAR IG*OrigoEnergiaV 01/12 Sao Paulo R$ 700,11
26 MAR RAIA1732 GUARULHOS R$ 48,89
26 MAR ASICS CorporationV Irvine
US$ 158,15 U$ 158,15
R$ 826,73
V.DOL 5,2275
26 MAR AMAZON MKTPL*B58WW5E SEATTLE
US$ 211,94 U$ 211,94
R$ 1.108,62
V.DOL 5,2308
26 MAR ESBELA COMERCIO DE P SAO PAULO R$ 25,80
DATA DESCRIÇÃO CIDADE VALOR EM R$
26 MAR FAST SLEEP-CUMBICA GUARULHOS R$ 434,72
27 MAR AMAZON MARK* BC12H9C SEATTLE
US$ 74,82 U$ 74,82
R$ 391,37
V.DOL 5,2308
27 MAR POSTO CATEDRAL MARINGA R$ 350,06
30 MAR ARENA TENNISTORMV MARINGA R$ 342,00
31 MAR JOAO PAULINO MARINGA R$ 724,24
TOTAL DE JESSICA R$ 7.054,11
WISLEY ANDERSON VIEIRA 5476
25 MAR adidas 6144 Orlando Orlando
US$ 63,88 U$ 63,88
R$ 333,93
V.DOL 5,2275
25 MAR WALGREENS #15023 WINTER GARDEN
US$ 62,18 U$ 62,18
R$ 327,06
V.DOL 5,2599
25 MAR CADRI MARKET & DELI WINTER GARDEN
US$ 122,88 U$ 122,88
R$ 642,36
V.DOL 5,2275
25 MAR PETER GLENN #18 ORLANDO
US$ 244,91 U$ 244,91
R$ 1.280,27
V.DOL 5,2275
29 MAR AMAZON RETA* B57NS59 SEATTLE
US$ 13,76 U$ 13,76
R$ 72,07
V.DOL 5,2376
30 MAR Google YouTubePremiu SAO PAULO R$ 26,90
31 MAR AMAZON MARK* BG5PJ4P SEATTLE
US$ 149,32 U$ 149,32
R$ 781,73
V.DOL 5,2353
31 MAR AMAZON MARK* BG15U9P SEATTLE
US$ 95,86 U$ 95,86
R$ 501,86
V.DOL 5,2353
TOTAL DE WISLEY R$ 3.966,18
TOTAL R$ 20.511,34`;

    const items = parseStatementText(text, CTX);
    expect(items).toHaveLength(35);
    expect(items.reduce((sum, item) => sum + item.valor, 0)).toBeCloseTo(20203.62, 2);
    expect(20511.34 - items.reduce((sum, item) => sum + item.valor, 0)).toBeCloseTo(307.72, 2);

    expect(items.find((i) => i.descricao_normalizada.includes('casa dos uniformes'))?.parcelas).toBe('3/5');
    expect(items.find((i) => i.descricao_normalizada.includes('clinica ritha capela'))?.parcelas).toBe('6/6');
    expect(items.find((i) => i.descricao_normalizada.includes('adidas'))?.valor).toBeCloseTo(333.93, 2);
    expect(items.find((i) => i.descricao_normalizada.includes('amazon mark bg15u9p'))?.valor).toBeCloseTo(501.86, 2);
  });
});

// ── rebuildBrokenItauTransactionLines – partial-line coverage ─────────────────

describe('rebuildBrokenItauTransactionLines', () => {
  it('reconstrói linha parcial (data+desc sem valor) quando valor vem na linha seguinte', () => {
    const lines = [
      '22/08 VIVARA MOR 08/10',
      '930,15',
    ];
    const result = rebuildBrokenItauTransactionLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('22/08 VIVARA MOR 08/10 930,15');
  });

  it('reconstrói linha parcial sem parcela (data+desc sem valor)', () => {
    const lines = [
      '28/08 LATAM AIR',
      '1.765,52',
    ];
    const result = rebuildBrokenItauTransactionLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('28/08 LATAM AIR 1.765,52');
  });

  it('mantém linha completa sem alteração', () => {
    const lines = ['07/03 KANPAI 101,90'];
    const result = rebuildBrokenItauTransactionLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('07/03 KANPAI 101,90');
  });

  it('reconstrói data-only seguida de descrição e valor', () => {
    const lines = ['22/08', 'VIVARA MOR', '08/10', '930,15'];
    const result = rebuildBrokenItauTransactionLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('22/08 VIVARA MOR 08/10 930,15');
  });

  it('processa múltiplas linhas mistas (completas e parciais) sem perda', () => {
    const lines = [
      '07/03 KANPAI 101,90',        // completa
      '22/08 VIVARA MOR 08/10',     // parcial — sem valor
      '930,15',                      // valor da anterior
      '28/08 LATAM AIR 08/08',      // parcial
      '1.765,52',                    // valor da anterior
    ];
    const result = rebuildBrokenItauTransactionLines(lines);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('07/03 KANPAI 101,90');
    expect(result[1]).toBe('22/08 VIVARA MOR 08/10 930,15');
    expect(result[2]).toBe('28/08 LATAM AIR 08/08 1.765,52');
  });

  it('descarta linha parcial sem valor correspondente e não corrompe o próximo lançamento', () => {
    const lines = [
      '22/08 VIVARA MOR 08/10',     // parcial, sem valor
      '28/08 LATAM AIR 1.765,52',   // próxima transação completa
    ];
    const result = rebuildBrokenItauTransactionLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('28/08 LATAM AIR 1.765,52');
  });
});

// ── classifyItauLine ──────────────────────────────────────────────────────────

describe('classifyItauLine', () => {
  it('classifica transação completa', () => {
    expect(classifyItauLine('07/03 KANPAI 101,90')).toBe('transaction');
  });

  it('classifica linha parcial (data+desc sem valor)', () => {
    expect(classifyItauLine('22/08 VIVARA MOR 08/10')).toBe('partial-transaction');
  });

  it('classifica data-only', () => {
    expect(classifyItauLine('22/08')).toBe('date-only');
  });

  it('classifica valor-only', () => {
    expect(classifyItauLine('930,15')).toBe('amount-only');
  });

  it('classifica linha de categoria/cidade', () => {
    expect(classifyItauLine('ALIMENTAÇÃO .MARINGA')).toBe('category-city');
  });

  it('classifica resumo de cartão', () => {
    expect(classifyItauLine('Lançamentos no cartão (final 8275) 11.096,14')).toBe('card-summary');
  });

  it('classifica metadata internacional', () => {
    expect(classifyItauLine('Dólar de Conversão R$ 5,65')).toBe('international-metadata');
  });

  it('classifica início de seção futura', () => {
    expect(classifyItauLine('Compras parceladas - próximas faturas')).toBe('future-section');
  });
});

// ── debugItauParsing ──────────────────────────────────────────────────────────

describe('debugItauParsing', () => {
  const CTX = { competencia: '2026-03' };
  const withHeader = (body: string) =>
    `Banco Itaú S.A.\nResumo da fatura em R$\nLançamentos: compras e saques\n${body}`;

  it('retorna estrutura de debug com contagens corretas', () => {
    const text = withHeader(
      [
        '07/03 KANPAI 101,90',
        'ALIMENTAÇÃO .MARINGA',
        'Dólar de Conversão R$ 5,65',
        '22/08 VIVARA MOR 08/10',
        '930,15',
      ].join('\n'),
    );

    const result = debugItauParsing(text, CTX);

    expect(result.totalSourceLines).toBeGreaterThan(0);
    expect(result.classificationCounts['transaction']).toBeGreaterThanOrEqual(1);
    expect(result.classificationCounts['category-city']).toBeGreaterThanOrEqual(1);
    expect(result.classificationCounts['international-metadata']).toBeGreaterThanOrEqual(1);
    expect(result.classificationCounts['partial-transaction']).toBeGreaterThanOrEqual(1);
    expect(result.finalTransactions).toBeGreaterThanOrEqual(2);
  });

  it('não importa menos de 8 lançamentos da fatura completa de exemplo', () => {
    const text = withHeader(
      [
        '22/08 VIVARA MOR 08/10 930,15',
        'DIVERSOS .SAO PAULO',
        '18/02 FARMACIA E DROGARI02/02 182,01',
        'SAÚDE .MARINGA',
        ')))02/03 AV SAO PAULO-CT 02/02 269,88',
        'ALIMENTAÇÃO .MARINGA',
        '03/03 AMAZON MKTPL*BE8ZQ41X1 494,54',
        'SEATTLE 87,53 USD 87,53',
        'Dólar de Conversão R$ 5,65',
        '07/03 KANPAI 101,90',
        'ALIMENTAÇÃO .MARINGA',
        '03/04 ESTORNO DE ANUIDADE DIF - 52,50',
        'Lançamentos internacionais',
        '10/03 LOVABLE 167,74',
        'DOVER 160,50 BRL 30,61',
        'Dólar de Conversão R$ 5,48',
        '18/03 UI BAKERY INC. 66,36',
        'AUSTIN 12,00 USD 12,00',
        'Dólar de Conversão R$ 5,53',
        'Lançamentos no cartão (final 8275) 11.096,14',
      ].join('\n'),
    );

    const result = debugItauParsing(text, CTX);

    // Com a fatura acima, nenhuma cobertura abaixo de 8 é aceitável
    expect(result.finalTransactions).toBeGreaterThanOrEqual(8);
  });
});
