import type { PdfExtractedDocument, PdfRawTextItem } from '../pdf-text';
import type { ParsedStatementItem, ParserContext } from '../types';
import type { ItauParseResult, ItauParsingDiagnostics } from './itau-helpers';
import {
  cleanItauNoisePrefix,
  extractItauTransactionParts,
  isItauCardSummaryLine,
  isItauCategoryCityLine,
  isItauInternationalMetadataLine,
} from './itau-helpers';
import { normalizeStatementDescription, parseBrazilianCurrency, stripAccents } from '../normalization';

const LINE_Y_TOLERANCE = 3;
const DATE_START = /^\d{1,2}\/\d{2}(?!\/\d{2,4})\b/;
const DATE_GLOBAL = /\b\d{1,2}\/\d{2}\b/g;
const AMOUNT_ONLY = /^(?:R\$\s*)?-?\s*\d{1,3}(?:\.\d{3})*,\d{2}$|^-\s*\d{1,3}(?:\.\d{3})*,\d{2}$/;
const AMOUNT_AT_END = /((?:R\$\s*)?-?\s*\d{1,3}(?:\.\d{3})*,\d{2}|-\s*\d{1,3}(?:\.\d{3})*,\d{2})$/;
const TOTAL_CURRENT_CHARGES = /total dos lancamentos atuais.*?(\d{1,3}(?:\.\d{3})*,\d{2})/i;
const IOF_REPASSE = /^repasse de iof em r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/i;

export type ItauSection =
  | 'none'
  | 'purchases'
  | 'international'
  | 'services'
  | 'future'
  | 'limits'
  | 'fees'
  | 'simulation';

type ItauVisualItem = PdfRawTextItem & {
  x: number;
  y: number;
  width: number;
};

type ItauVisualLine = {
  text: string;
  items: ItauVisualItem[];
  pageNumber: number;
  columnIndex: number;
  y: number;
  xMin: number;
  xMax: number;
  section: ItauSection;
  cardLast4: string | null;
};

function normalize(text: string): string {
  return stripAccents(cleanItauNoisePrefix(text)).toLowerCase();
}

function isSimulationLine(text: string): boolean {
  const value = normalize(text);
  return /^simulacao\b/.test(value) || /^parcelamento da fatura\b/.test(value);
}

function isFeesLine(text: string): boolean {
  return /^encargos cobrados nesta fatura\b/.test(normalize(text));
}

function isLimitsLine(text: string): boolean {
  return /^limites de credito\b/.test(normalize(text));
}

function isSectionHeader(text: string): ItauSection | null {
  const value = normalize(text);

  if (/^lancamentos:\s*compras e saques$/.test(value)) return 'purchases';
  if (/^lancamentos internacionais$/.test(value)) return 'international';
  if (/^lancamentos:\s*produtos e servicos$/.test(value)) return 'services';
  if (/compras parceladas.*proximas faturas/.test(value)) return 'future';
  if (isLimitsLine(text)) return 'limits';
  if (isFeesLine(text)) return 'fees';
  if (isSimulationLine(text)) return 'simulation';

  return null;
}

function isCardholderLine(text: string): boolean {
  return /^[\p{L}\s.'-]+\(\s*final \d{4}\s*\)$/iu.test(cleanItauNoisePrefix(text));
}

function extractCardLast4(text: string): string | null {
  const match = cleanItauNoisePrefix(text).match(/final\s+(\d{4})/i);
  return match?.[1] ?? null;
}

function isLooseNoise(text: string): boolean {
  const value = normalize(text);

  return [
    /^banco ita/,
    /^itau$/,
    /^resumo da fatura/,
    /^resumo da fatura em r\$/,
    /^data estabelecimento(?: valor em r\$)?$/,
    /^data estabelecimento us\$ r\$$/,
    /^data produtos\/servicos$/,
    /^valor em r\$$/,
    /^data estabelecimento valor em r\$$/,
    /^lancamentos no cartao \(final \d{4}\)/,
    /^total transacoes inter\./,
    /^total lancamentos inter\./,
    /^dolar de conversao\b/,
    /^continua/,
    /^pc\s*-\s*\d+/,
    /^4004\s+\d+/,
    /^0800\s+\d+/,
    /^\d{4}\s+\d{4}$/,
  ].some((pattern) => pattern.test(value));
}

function isIgnorableLine(text: string): boolean {
  return (
    isLooseNoise(text) ||
    isItauCategoryCityLine(text) ||
    isItauCardSummaryLine(text) ||
    isItauInternationalMetadataLine(text) ||
    isCardholderLine(text)
  );
}

function toVisualItems(items: PdfRawTextItem[]): ItauVisualItem[] {
  return items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => ({
      ...item,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? 0,
    }));
}

function groupItemsIntoLines(items: ItauVisualItem[]): ItauVisualLine[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: ItauVisualItem[][] = [];
  let current: ItauVisualItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let index = 1; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (Math.abs(item.y - currentY) <= LINE_Y_TOLERANCE) {
      current.push(item);
      continue;
    }

    groups.push(current);
    current = [item];
    currentY = item.y;
  }

  groups.push(current);

  return groups.map((group): ItauVisualLine => {
    const ordered = [...group].sort((a, b) => a.x - b.x);
    let text = '';

    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index];
      if (index > 0) {
        const previous = ordered[index - 1];
        const gap = item.x - (previous.x + previous.width);
        text += gap > 3 ? ' ' : '';
      }
      text += item.str;
    }

    return {
      text: cleanItauNoisePrefix(text),
      items: ordered,
      pageNumber: ordered[0].pageNumber,
      columnIndex: 0,
      y: ordered[0].y,
      xMin: Math.min(...ordered.map((item) => item.x)),
      xMax: Math.max(...ordered.map((item) => item.x + item.width)),
      section: 'none',
      cardLast4: null,
    };
  }).filter((line) => line.text.length > 0);
}

function detectPageSplitX(pageWidth: number, items: ItauVisualItem[]): number | null {
  if (items.length < 8) return null;

  const midpoint = pageWidth / 2;
  const centers = items.map((item) => item.x + item.width / 2);
  const leftCount = centers.filter((center) => center < midpoint - 12).length;
  const rightCount = centers.filter((center) => center >= midpoint + 12).length;
  const rightColumnStarts = items.filter((item) => item.x >= midpoint && item.x <= midpoint + 120).length;

  if (leftCount < 6 || rightCount < 6 || rightColumnStarts < 3) return null;

  // Itaú fatura has left column data spanning roughly x=80 to x=335 (date,
  // description, installment, value) and right column starting at x≈367.
  // The page midpoint (~297) falls INSIDE the left column, splitting its value
  // tokens (x≈319-327) into the right column. We must detect the actual gutter
  // between the two columns by looking for the largest empty horizontal band
  // around the midpoint, then use its center as the split position.
  const searchMin = midpoint - 60;
  const searchMax = midpoint + 80;
  const candidateXs = items
    .map((item) => item.x)
    .filter((x) => x >= searchMin - 20 && x <= searchMax + 20)
    .sort((a, b) => a - b);

  let bestGapStart = midpoint;
  let bestGapEnd = midpoint;
  for (let i = 1; i < candidateXs.length; i += 1) {
    const prev = candidateXs[i - 1];
    const curr = candidateXs[i];
    if (prev > searchMax || curr < searchMin) continue;
    if (curr - prev > bestGapEnd - bestGapStart) {
      bestGapStart = prev;
      bestGapEnd = curr;
    }
  }

  if (bestGapEnd - bestGapStart >= 20) {
    return (bestGapStart + bestGapEnd) / 2;
  }

  return midpoint;
}

function buildPageColumns(document: PdfExtractedDocument): ItauVisualLine[] {
  const lines: ItauVisualLine[] = [];

  for (const page of document.pages) {
    const rawItems = page.textItems?.length ? page.textItems : page.tokens.map((token) => ({
      str: token.str,
      transform: token.transform,
      pageNumber: token.pageNumber,
      width: token.width,
    }));
    const items = toVisualItems(rawItems);
    const splitX = detectPageSplitX(page.width, items);
    const columnBuckets = new Map<number, ItauVisualItem[]>();

    for (const item of items) {
      const columnIndex = splitX === null ? 0 : (item.x + item.width / 2 >= splitX ? 1 : 0);
      const bucket = columnBuckets.get(columnIndex) ?? [];
      bucket.push(item);
      columnBuckets.set(columnIndex, bucket);
    }

    for (const columnIndex of [...columnBuckets.keys()].sort((a, b) => a - b)) {
      const columnLines = groupItemsIntoLines(columnBuckets.get(columnIndex) ?? []).map((line) => ({
        ...line,
        columnIndex,
      }));

      lines.push(...columnLines);
    }
  }

  return lines.sort((a, b) =>
    a.pageNumber - b.pageNumber ||
    a.columnIndex - b.columnIndex ||
    b.y - a.y ||
    a.xMin - b.xMin);
}

function splitLineByDates(text: string): string[] {
  const cleaned = cleanItauNoisePrefix(text);
  const matches = Array.from(cleaned.matchAll(DATE_GLOBAL)).filter((match) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const after = cleaned.slice(end);

    if (!after.startsWith(' ')) return false;
    if (start === 0) return true;

    const before = cleaned.slice(0, start).trimEnd();
    return AMOUNT_AT_END.test(before);
  });
  if (matches.length <= 1) return [cleaned];

  const segments: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? cleaned.length) : cleaned.length;
    const segment = cleaned.slice(start, end).trim();
    if (segment) segments.push(segment);
  }

  return segments;
}

function isValidTransactionSection(section: ItauSection): boolean {
  return section === 'purchases' || section === 'international' || section === 'services';
}

function findExpectedTotal(lines: ItauVisualLine[], ctx: ParserContext): number | null {
  if (typeof ctx.expectedTotalCurrentCharges === 'number') {
    return ctx.expectedTotalCurrentCharges;
  }

  for (const line of lines) {
    const match = cleanItauNoisePrefix(line.text).match(TOTAL_CURRENT_CHARGES);
    if (match) return parseBrazilianCurrency(match[1]);
  }

  return null;
}

function createIofItem(
  line: string,
  ctx: ParserContext,
  last4: string | null,
): ParsedStatementItem | null {
  const match = cleanItauNoisePrefix(line).match(IOF_REPASSE);
  if (!match) return null;

  const description = `Repasse de IOF - Cartão final ${last4 ?? 'XXXX'}`;
  return {
    descricao_original: description,
    descricao_normalizada: normalizeStatementDescription(description),
    data_compra: ctx.statementDate ?? ctx.dueDate ?? `${ctx.competencia}-01`,
    valor: parseBrazilianCurrency(match[1]),
    parcelas: null,
    banco_origem: 'itau',
    observacao_parser: null,
  };
}

function createDiagnostics(expectedTotal: number | null): ItauParsingDiagnostics {
  return {
    capturedTransactions: 0,
    capturedSum: 0,
    expectedTotal,
    difference: null,
    ignoredDateLines: [],
    orphanAmountLines: [],
    failures: [],
    multipleDateLines: [],
    itemsByPageColumnSection: [],
    importedItems: [],
  };
}

function registerImportedItem(
  diagnostics: ItauParsingDiagnostics,
  item: ParsedStatementItem,
  line: ItauVisualLine,
) {
  diagnostics.importedItems.push({
    descricao_original: item.descricao_original,
    valor: item.valor,
    pageNumber: line.pageNumber,
    columnIndex: line.columnIndex,
    section: line.section,
  });

  const existing = diagnostics.itemsByPageColumnSection.find((entry) =>
    entry.pageNumber === line.pageNumber &&
    entry.columnIndex === line.columnIndex &&
    entry.section === line.section,
  );

  if (existing) {
    existing.count += 1;
    existing.total = Number((existing.total + item.valor).toFixed(2));
    return;
  }

  diagnostics.itemsByPageColumnSection.push({
    pageNumber: line.pageNumber,
    columnIndex: line.columnIndex,
    section: line.section,
    count: 1,
    total: Number(item.valor.toFixed(2)),
  });
}

function matchAmountsInColumn(
  dateLines: ItauVisualLine[],
  amountLines: ItauVisualLine[],
  ctx: ParserContext,
  diagnostics: ItauParsingDiagnostics,
) {
  const items: ParsedStatementItem[] = [];
  const usedAmountIndexes = new Set<number>();
  const matchedDateLineKeys = new Set<string>();

  for (const line of dateLines) {
    if (!isValidTransactionSection(line.section)) continue;
    if (AMOUNT_AT_END.test(line.text)) continue;

    let bestIndex = -1;
    let bestDistance = Infinity;

    for (let index = 0; index < amountLines.length; index += 1) {
      const candidate = amountLines[index];
      if (usedAmountIndexes.has(index)) continue;
      if (candidate.pageNumber !== line.pageNumber) continue;
      if (candidate.columnIndex !== line.columnIndex) continue;
      if (candidate.section !== line.section) continue;
      if (!AMOUNT_ONLY.test(candidate.text)) continue;
      if (candidate.y > line.y + LINE_Y_TOLERANCE) continue;

      const distance = Math.abs(candidate.y - line.y);
      if (distance > 18 || distance >= bestDistance) continue;

      bestIndex = index;
      bestDistance = distance;
    }

    if (bestIndex === -1) continue;

    usedAmountIndexes.add(bestIndex);
    const reconstructed = `${line.text} ${amountLines[bestIndex].text}`.replace(/\s+/g, ' ').trim();
    const item = extractItauTransactionParts(reconstructed, ctx);
    if (!item) continue;

    matchedDateLineKeys.add(`${line.pageNumber}:${line.columnIndex}:${line.y}:${line.text}`);
    console.debug(`[itau-v2] imported item: ${item.data_compra ?? 'sem-data'}, ${item.descricao_original}, ${item.valor.toFixed(2)}, ${line.section}, page ${line.pageNumber}, column ${line.columnIndex}`);
    registerImportedItem(diagnostics, item, line);
    items.push(item);
  }

  amountLines.forEach((line, index) => {
    if (usedAmountIndexes.has(index)) return;
    diagnostics.orphanAmountLines.push({
      line: line.text,
      pageNumber: line.pageNumber,
      columnIndex: line.columnIndex,
      reason: 'Valor monetário sem transação correspondente na mesma coluna/seção',
      section: line.section,
    });
  });

  return { items, matchedDateLineKeys };
}

function parseColumnGroup(
  columnLines: ItauVisualLine[],
  ctx: ParserContext,
  diagnostics: ItauParsingDiagnostics,
): ParsedStatementItem[] {
  const items: ParsedStatementItem[] = [];
  const completeLines: ItauVisualLine[] = [];
  const incompleteDateLines: ItauVisualLine[] = [];
  const amountOnlyLines: ItauVisualLine[] = [];
  const blockLines: ItauVisualLine[] = [];
  let pendingBlock: ItauVisualLine | null = null;

  const flushPendingBlock = (reason: string) => {
    if (!pendingBlock) return;

    diagnostics.ignoredDateLines.push({
      line: pendingBlock.text,
      pageNumber: pendingBlock.pageNumber,
      columnIndex: pendingBlock.columnIndex,
      reason,
      section: pendingBlock.section,
    });
    pendingBlock = null;
  };

  for (const line of columnLines) {
    console.debug(`[itau-v2] page ${line.pageNumber} column ${line.columnIndex} section ${line.section} line: ${line.text}`);

    if (!isValidTransactionSection(line.section)) {
      flushPendingBlock('Bloco de transação interrompido por seção não importável');
      continue;
    }

    if (IOF_REPASSE.test(line.text)) {
      flushPendingBlock('Bloco de transação interrompido por repasse de IOF');
      const item = createIofItem(line.text, ctx, line.cardLast4);
      if (item) {
        registerImportedItem(diagnostics, item, line);
        items.push(item);
        console.debug(`[itau-v2] imported item: ${item.data_compra ?? 'sem-data'}, ${item.descricao_original}, ${item.valor.toFixed(2)}, ${line.section}, page ${line.pageNumber}, column ${line.columnIndex}`);
      }
      continue;
    }

    const segments = splitLineByDates(line.text);
    if (segments.length > 1) {
      flushPendingBlock('Bloco de transação interrompido por linha com múltiplas datas');
      diagnostics.multipleDateLines.push({
        line: line.text,
        pageNumber: line.pageNumber,
        columnIndex: line.columnIndex,
        reason: 'Linha com múltiplas datas dividida antes do parse',
        section: line.section,
      });
    }

    for (const segment of segments) {
      const segmentedLine = { ...line, text: segment };

      if (AMOUNT_ONLY.test(segment)) {
        if (pendingBlock) {
          blockLines.push({
            ...pendingBlock,
            text: `${pendingBlock.text} ${segment}`.replace(/\s+/g, ' ').trim(),
          });
          pendingBlock = null;
          continue;
        }
        amountOnlyLines.push(segmentedLine);
        continue;
      }

      if (!DATE_START.test(segment)) {
        if (pendingBlock && segment.length > 0 && !isIgnorableLine(segment)) {
          pendingBlock = {
            ...pendingBlock,
            text: `${pendingBlock.text} ${segment}`.replace(/\s+/g, ' ').trim(),
          };
          continue;
        }

        if (segment.length > 0 && !isIgnorableLine(segment)) {
          diagnostics.failures.push({
            line: segment,
            pageNumber: line.pageNumber,
            columnIndex: line.columnIndex,
            reason: 'Linha monetária/avulsa ignorada fora do padrão de transação',
            section: line.section,
          });
        }
        continue;
      }

      flushPendingBlock('Linha com nova data encontrada antes de valor monetário');

      if (AMOUNT_AT_END.test(segment)) {
        completeLines.push(segmentedLine);
      } else {
        pendingBlock = segmentedLine;
      }
    }
  }

  flushPendingBlock('Bloco de transação terminou sem valor monetário associado');

  for (const line of [...completeLines, ...blockLines]) {
    const item = extractItauTransactionParts(line.text, ctx);
    if (!item) {
      diagnostics.ignoredDateLines.push({
        line: line.text,
        pageNumber: line.pageNumber,
        columnIndex: line.columnIndex,
        reason: 'Linha com DD/MM rejeitada no parse final',
        section: line.section,
      });
      console.debug(`[itau-v2] ignored date line: parse final rejeitou (${line.text})`);
      continue;
    }

    registerImportedItem(diagnostics, item, line);
    items.push(item);
    console.debug(`[itau-v2] imported item: ${item.data_compra ?? 'sem-data'}, ${item.descricao_original}, ${item.valor.toFixed(2)}, ${line.section}, page ${line.pageNumber}, column ${line.columnIndex}`);
  }

  const matched = matchAmountsInColumn(incompleteDateLines, amountOnlyLines, ctx, diagnostics);
  items.push(...matched.items);

  incompleteDateLines.forEach((line) => {
    const key = `${line.pageNumber}:${line.columnIndex}:${line.y}:${line.text}`;
    if (matched.matchedDateLineKeys.has(key)) return;

    diagnostics.ignoredDateLines.push({
      line: line.text,
      pageNumber: line.pageNumber,
      columnIndex: line.columnIndex,
      reason: 'Linha com DD/MM ficou sem valor monetário associado',
      section: line.section,
    });
    console.debug(`[itau-v2] ignored date line: sem valor associado (${line.text})`);
  });

  return items;
}

function collectTransactionLines(document: PdfExtractedDocument): ItauVisualLine[] {
  const visualLines = buildPageColumns(document);
  const collected: ItauVisualLine[] = [];
  const currentSectionByColumn = new Map<string, ItauSection>();
  const currentCardLast4ByColumn = new Map<string, string | null>();

  for (const line of visualLines) {
    const key = String(line.columnIndex);
    const previousSection = currentSectionByColumn.get(key) ?? 'none';
    const nextSection = isSectionHeader(line.text) ?? previousSection;
    const currentLast4 = extractCardLast4(line.text);

    currentSectionByColumn.set(key, nextSection);
    if (currentLast4) currentCardLast4ByColumn.set(key, currentLast4);

    if (isSectionHeader(line.text)) continue;

    const enrichedLine = {
      ...line,
      section: nextSection,
      cardLast4: currentLast4 ?? currentCardLast4ByColumn.get(key) ?? null,
    };

    if (isCardholderLine(line.text) || isItauCardSummaryLine(line.text)) {
      continue;
    }

    if (isIgnorableLine(line.text)) continue;
    collected.push(enrichedLine);
  }

  return collected;
}

export function parseItauMonthlyDocument(
  document: PdfExtractedDocument,
  ctx: ParserContext,
): ItauParseResult {
  const collectedLines = collectTransactionLines(document);
  const expectedTotal = findExpectedTotal(collectedLines, ctx);
  const diagnostics = createDiagnostics(expectedTotal);
  const items: ParsedStatementItem[] = [];

  const grouped = new Map<string, ItauVisualLine[]>();

  for (const line of collectedLines) {
    const key = `${line.pageNumber}:${line.columnIndex}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(line);
    grouped.set(key, bucket);
  }

  for (const key of [...grouped.keys()].sort((a, b) => {
    const [pageA, columnA] = a.split(':').map(Number);
    const [pageB, columnB] = b.split(':').map(Number);
    return pageA - pageB || columnA - columnB;
  })) {
    const lines = (grouped.get(key) ?? []).slice().sort((a, b) => b.y - a.y || a.xMin - b.xMin);
    items.push(...parseColumnGroup(lines, ctx, diagnostics));
  }

  diagnostics.capturedTransactions = items.length;
  diagnostics.capturedSum = Number(items.reduce((sum, item) => sum + item.valor, 0).toFixed(2));
  diagnostics.difference = diagnostics.expectedTotal === null
    ? null
    : Number((diagnostics.expectedTotal - diagnostics.capturedSum).toFixed(2));

  console.debug(
    `[itau-v2] validation total: esperado ${diagnostics.expectedTotal ?? 'n/a'}, capturado ${diagnostics.capturedSum.toFixed(2)}, diff ${diagnostics.difference ?? 'n/a'}`,
  );

  return {
    items,
    diagnostics,
    rebuiltLines: collectedLines
      .filter((line) => isValidTransactionSection(line.section))
      .map((line) => line.text),
  };
}

export function parseItauDocumentV2(
  document: PdfExtractedDocument,
  ctx: ParserContext,
): ParsedStatementItem[] {
  return parseItauMonthlyDocument(document, ctx).items;
}
