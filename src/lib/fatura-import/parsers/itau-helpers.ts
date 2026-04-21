import {
  extractInstallmentInfo,
  normalizeStatementDescription,
  parseBrazilianCurrency,
  removeNoisePrefixBeforeDate,
  stripAccents,
} from '../normalization';
import type { ParsedStatementItem, ParserContext } from '../types';
import type { PdfExtractedDocument } from '../pdf-text';

const ITAU_DATE_START = /^\d{1,2}\/\d{2}(?!\/\d{2,4})\b/;
const ITAU_DATE_ONLY = /^\d{1,2}\/\d{2}(?!\/\d{2,4})$/;
const ITAU_AMOUNT_ONLY = /^(?:R\$\s*)?-?\s*\d{1,3}(?:\.\d{3})*,\d{2}$|^-\s*\d{1,3}(?:\.\d{3})*,\d{2}$/;
const ITAU_AMOUNT_AT_END = /((?:R\$\s*)?-?\s*\d{1,3}(?:\.\d{3})*,\d{2}|-\s*\d{1,3}(?:\.\d{3})*,\d{2})$/;
const ITAU_DATE_GLOBAL = /\b\d{1,2}\/\d{2}\b/g;
const ITAU_IOF_REPASSE = /^repasse de iof em r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/i;
const ITAU_TOTAL_CURRENT_CHARGES = /total dos lancamentos atuais.*?(\d{1,3}(?:\.\d{3})*,\d{2})/i;

type ItauSourceLine = {
  text: string;
  pageNumber: number;
  columnIndex: number;
  y: number;
  index: number;
};

type ItauDiagnosticLine = {
  line: string;
  pageNumber: number;
  columnIndex: number;
  reason: string;
};

export interface ItauParsingDiagnostics {
  capturedTransactions: number;
  capturedSum: number;
  expectedTotal: number | null;
  difference: number | null;
  ignoredDateLines: ItauDiagnosticLine[];
  orphanAmountLines: ItauDiagnosticLine[];
  failures: ItauDiagnosticLine[];
}

export interface ItauParseResult {
  items: ParsedStatementItem[];
  diagnostics: ItauParsingDiagnostics;
  rebuiltLines: string[];
}

function inferItauTransactionDate(dayMonth: string, competencia: string): string | null {
  const [competenciaYear] = competencia.split('-').map(Number);
  const [day, month] = dayMonth.split('/').map(Number);

  if (!competenciaYear || !day || !month) return null;

  return `${competenciaYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeItauLine(line: string): string {
  return removeNoisePrefixBeforeDate(line)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeItauTextForMatch(line: string): string {
  return stripAccents(normalizeItauLine(line)).toLowerCase();
}

function getFallbackIofDate(ctx: ParserContext): string | null {
  return ctx.statementDate ?? ctx.dueDate ?? `${ctx.competencia}-01`;
}

function extractCardLast4(line: string): string | null {
  const cleaned = cleanItauNoisePrefix(line);
  const match = cleaned.match(/final\s+(\d{4})/i);
  return match?.[1] ?? null;
}

function isItauHeaderOrNoiseLine(line: string): boolean {
  const normalized = normalizeItauTextForMatch(line);

  return [
    /banco itau/,
    /^itau$/,
    /resumo da fatura/,
    /lancamentos:\s*compras e saques/,
    /lancamentos internacionais$/,
    /lancamentos:\s*produtos e servicos/,
    /encargos cobrados nesta fatura/,
    /limites de credito/,
    /pagamento minimo/,
    /saldo anterior/,
    /previsao do proximo fechamento/,
    /nosso numero/,
    /valor do documento/,
    /autenticacao mecanica/,
    /ficha de compensacao/,
    /resumo da fatura em r\$/,
    /central de atendimento/,
    /resumo em r\$/,
    /^pagina \d+/,
    /^continua/,
    /^pc\s*-\s*\d+/,
    /^data estabelecimento(?: valor em r\$)?$/,
    /^data produtos\/servicos$/,
    /^valor em r\$$/,
    /^uso do banco\b/,
    /^sacador avalista/,
    /^simulacao\b/,
    /^parcelamento da fatura\b/,
    /^total transacoes inter\./,
    /^total lancamentos inter\./,
    /^total dos lancamentos atuais/,
  ].some((pattern) => pattern.test(normalized));
}

export function cleanItauNoisePrefix(line: string): string {
  return normalizeItauLine(line);
}

export function isItauCategoryCityLine(line: string): boolean {
  const cleaned = cleanItauNoisePrefix(line);
  if (!cleaned || ITAU_DATE_START.test(cleaned) || ITAU_AMOUNT_AT_END.test(cleaned)) return false;

  const upper = stripAccents(cleaned).toUpperCase();
  if (/[/*@#]/.test(upper)) return false;

  const lettersOnly = upper.replace(/[^A-Z]/g, '');
  if (lettersOnly.length < 6) return false;

  const mostlyUppercase = lettersOnly.length >= Math.max(6, Math.floor(cleaned.length * 0.45));
  const hasCategoryCitySeparator =
    /\s\.[A-Z]/.test(upper) || /[A-Z]{5,}\.[A-Z]{4,}/.test(upper);

  return mostlyUppercase && hasCategoryCitySeparator;
}

export function isItauCardSummaryLine(line: string): boolean {
  return /^lancamentos no cartao \(final \d{4}\)(?:\s+\d.*)?$/.test(normalizeItauTextForMatch(line));
}

function isItauCardholderLine(line: string): boolean {
  return /^[\p{L}\s.'-]+\(\s*final \d{4}\s*\)$/iu.test(cleanItauNoisePrefix(line));
}

function isItauTransactionSectionHeader(line: string): boolean {
  const normalized = normalizeItauTextForMatch(line);
  return [
    /^lancamentos:\s*compras e saques$/,
    /^lancamentos internacionais$/,
    /^lancamentos:\s*produtos e servicos$/,
  ].some((pattern) => pattern.test(normalized));
}

function isItauLooseMetadataLine(line: string): boolean {
  const normalized = normalizeItauTextForMatch(line);
  return [
    /^data estabelecimento(?: valor em r\$)?$/,
    /^data produtos\/servicos$/,
    /^valor em r\$/,
    /^\d{4}\s+\d{4}$/,
    /^0800\s+\d+/,
    /^4004\s+\d+/,
  ].some((pattern) => pattern.test(normalized));
}

function isItauIofRepasseLine(line: string): boolean {
  return ITAU_IOF_REPASSE.test(cleanItauNoisePrefix(line));
}

export function isItauInternationalMetadataLine(line: string): boolean {
  const normalized = normalizeItauTextForMatch(line);
  const startsWithDate = ITAU_DATE_START.test(cleanItauNoisePrefix(line));

  if (isItauIofRepasseLine(line)) return false;
  if (/^dolar de conversao\b/.test(normalized)) return true;
  if (/^total transacoes inter\./.test(normalized)) return true;
  if (/^total lancamentos inter\./.test(normalized)) return true;
  if (!startsWithDate && /\b(?:usd|brl)\b/.test(normalized)) return true;

  return false;
}

export function isItauFutureInstallmentSectionStart(line: string): boolean {
  const normalized = normalizeItauTextForMatch(line);
  return /compras parceladas.*proximas faturas/.test(normalized);
}

function isItauFutureSectionSoftStop(line: string): boolean {
  const normalized = normalizeItauTextForMatch(line);
  return [
    /encargos cobrados nesta fatura/,
    /limites de credito/,
  ].some((pattern) => pattern.test(normalized));
}

function isInstallmentOnlyLine(line: string): boolean {
  return ITAU_DATE_ONLY.test(cleanItauNoisePrefix(line));
}

function isAmountOnlyLine(line: string): boolean {
  return ITAU_AMOUNT_ONLY.test(cleanItauNoisePrefix(line));
}

function isIgnorableItauLine(line: string): boolean {
  if (!line) return true;
  return (
    isItauHeaderOrNoiseLine(line) ||
    isItauCategoryCityLine(line) ||
    isItauCardSummaryLine(line) ||
    isItauInternationalMetadataLine(line) ||
    isItauCardholderLine(line) ||
    isItauLooseMetadataLine(line)
  );
}

export const hasMultipleDates = (text: string) =>
  (text.match(/\b\d{2}\/\d{2}\b/g) || []).length > 1;

function findTransactionDateMatches(text: string) {
  const cleaned = cleanItauNoisePrefix(text);
  return Array.from(cleaned.matchAll(ITAU_DATE_GLOBAL)).filter((match) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const after = cleaned.slice(end);
    if (!after.startsWith(' ')) return false;
    if (start === 0) return true;

    const before = cleaned.slice(0, start).trimEnd();
    return ITAU_AMOUNT_AT_END.test(before);
  });
}

function hasMultipleTransactionDates(text: string) {
  return findTransactionDateMatches(text).length > 1;
}

function splitByEmbeddedDates(line: string): string[] {
  const cleaned = cleanItauNoisePrefix(line);
  const matches = findTransactionDateMatches(cleaned);
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

function buildTransactionLine(blockLines: string[]): string | null {
  const fragments = blockLines
    .map((line) => cleanItauNoisePrefix(line))
    .filter(Boolean);

  if (fragments.length === 0) return null;

  const first = fragments[0];
  if (!ITAU_DATE_START.test(first)) return null;

  const firstMatch = first.match(/^(\d{1,2}\/\d{2})\s*(.*)$/);
  if (!firstMatch) return null;

  const parts = [firstMatch[2].trim()].filter(Boolean);
  let amount = first.match(ITAU_AMOUNT_AT_END)?.[1] ?? null;
  if (amount && parts.length > 0) {
    parts[0] = parts[0].slice(0, parts[0].length - amount.length).trim();
  }

  for (let index = 1; index < fragments.length; index += 1) {
    const fragment = fragments[index];
    if (isIgnorableItauLine(fragment) || isItauFutureSectionSoftStop(fragment)) continue;
    if (isAmountOnlyLine(fragment)) {
      amount = fragment;
      continue;
    }
    const fragmentAmount = fragment.match(ITAU_AMOUNT_AT_END)?.[1];
    if (fragmentAmount) {
      amount = fragmentAmount;
      const withoutAmount = fragment.slice(0, fragment.length - fragmentAmount.length).trim();
      if (withoutAmount) parts.push(withoutAmount);
      continue;
    }
    parts.push(fragment);
  }

  if (!amount) return null;

  const body = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!body) return null;
  return `${firstMatch[1]} ${body} ${amount}`.replace(/\s+/g, ' ').trim();
}

function blockHasDescriptionContent(blockLines: string[]): boolean {
  if (blockLines.length === 0) return false;

  const firstLine = cleanItauNoisePrefix(blockLines[0]);
  const firstLineMatch = firstLine.match(/^(\d{1,2}\/\d{2})\s*(.*)$/);
  if (firstLineMatch?.[2]?.trim()) return true;

  return blockLines
    .slice(1)
    .map((line) => cleanItauNoisePrefix(line))
    .some((line) => Boolean(line) && !isInstallmentOnlyLine(line) && !isAmountOnlyLine(line));
}

function blockHasAmount(blockLines: string[]): boolean {
  return blockLines.some((line) => {
    const cleaned = cleanItauNoisePrefix(line);
    return isAmountOnlyLine(cleaned) || ITAU_AMOUNT_AT_END.test(cleaned);
  });
}

function createIofItem(line: string, ctx: ParserContext, last4: string | null): ParsedStatementItem | null {
  const cleaned = cleanItauNoisePrefix(line);
  const match = cleaned.match(ITAU_IOF_REPASSE);
  if (!match) return null;

  return {
    descricao_original: `Repasse de IOF - Cartão final ${last4 ?? 'XXXX'}`,
    descricao_normalizada: normalizeStatementDescription(`Repasse de IOF - Cartão final ${last4 ?? 'XXXX'}`),
    data_compra: getFallbackIofDate(ctx),
    valor: parseBrazilianCurrency(match[1]),
    parcelas: null,
    banco_origem: 'itau',
    observacao_parser: null,
  };
}

export function extractItauTransactionParts(
  line: string,
  ctx: ParserContext,
): ParsedStatementItem | null {
  const cleaned = cleanItauNoisePrefix(line);
  if (!cleaned) return null;
  if (isItauIofRepasseLine(cleaned)) {
    return createIofItem(cleaned, ctx, null);
  }
  if (isIgnorableItauLine(cleaned) || isItauFutureInstallmentSectionStart(cleaned)) return null;
  if (hasMultipleTransactionDates(cleaned)) return null;

  const dateMatch = cleaned.match(/^(\d{1,2}\/\d{2})\s+(.+)$/);
  if (!dateMatch) return null;

  const amountMatch = cleaned.match(ITAU_AMOUNT_AT_END);
  if (!amountMatch) return null;

  const rawAmount = amountMatch[1];
  const amount = parseBrazilianCurrency(rawAmount);
  if (Number.isNaN(amount)) return null;

  const body = dateMatch[2]
    .slice(0, dateMatch[2].length - rawAmount.length)
    .trim();

  if (!body || hasMultipleTransactionDates(body)) return null;

  const { parcelas } = extractInstallmentInfo(body);
  const descricaoOriginal = body;
  const descricaoNormalizada = normalizeStatementDescription(descricaoOriginal);
  if (!descricaoNormalizada) return null;

  return {
    descricao_original: descricaoOriginal,
    descricao_normalizada: descricaoNormalizada,
    data_compra: inferItauTransactionDate(dateMatch[1], ctx.competencia),
    valor: amount,
    parcelas,
    banco_origem: 'itau',
    observacao_parser: null,
  };
}

export function isItauTransactionLine(line: string): boolean {
  return extractItauTransactionParts(line, { competencia: '2026-01' }) !== null;
}

export function rebuildItauTransactionBlocks(lines: string[]): string[] {
  const sourceLines = lines.map((line, index) => ({
    text: cleanItauNoisePrefix(line),
    pageNumber: 1,
    columnIndex: 0,
    y: 1000 - index,
    index,
  }));
  return parseStructuredItauLines(sourceLines, { competencia: '2026-01' }).rebuiltLines;
}

export function rebuildBrokenItauTransactionLines(lines: string[]): string[] {
  return rebuildItauTransactionBlocks(lines);
}

function buildTextSourceLines(text: string): ItauSourceLine[] {
  return text
    .split('\n')
    .map((line) => cleanItauNoisePrefix(line))
    .map((line, index) => ({
      text: line,
      pageNumber: 1,
      columnIndex: 0,
      y: 1000 - index,
      index,
    }))
    .filter((line) => line.text.length > 0);
}

function buildLayoutSourceLines(document: PdfExtractedDocument): ItauSourceLine[] {
  return document.pages.flatMap((page) =>
    page.columns.flatMap((column) =>
      column.lines
        .slice()
        .sort((a, b) => b.y - a.y)
        .map((line, index) => ({
          text: cleanItauNoisePrefix(line.text),
          pageNumber: line.pageNumber,
          columnIndex: line.columnIndex,
          y: line.y,
          index,
        })),
    ),
  );
}

function findExpectedTotal(sourceLines: ItauSourceLine[], ctx: ParserContext): number | null {
  if (typeof ctx.expectedTotalCurrentCharges === 'number') {
    return ctx.expectedTotalCurrentCharges;
  }

  for (const source of sourceLines) {
    const match = cleanItauNoisePrefix(source.text).match(ITAU_TOTAL_CURRENT_CHARGES);
    if (match) return parseBrazilianCurrency(match[1]);
  }

  return null;
}

function appendRebuiltTransaction(
  rebuilt: string,
  source: ItauSourceLine,
  ctx: ParserContext,
  items: ParsedStatementItem[],
  rebuiltLines: string[],
  diagnostics: ItauParsingDiagnostics,
  registerFailure: (source: ItauSourceLine, reason: string) => void,
) {
  const segments = splitByEmbeddedDates(rebuilt);
  for (const segment of segments) {
    if (hasMultipleTransactionDates(segment)) {
      registerFailure(source, 'Linha ainda contém múltiplas datas após split');
      continue;
    }

    const item = extractItauTransactionParts(segment, {
      ...ctx,
      statementDate: ctx.statementDate,
      dueDate: ctx.dueDate,
    });

    if (!item) {
      diagnostics.ignoredDateLines.push({
        line: segment,
        pageNumber: source.pageNumber,
        columnIndex: source.columnIndex,
        reason: 'Linha com DD/MM rejeitada no parser final',
      });
      continue;
    }

    items.push(item);
    rebuiltLines.push(segment);
  }
}

function parseStructuredItauLines(
  sourceLines: ItauSourceLine[],
  ctx: ParserContext,
  options?: { requireSectionHeader?: boolean },
): ItauParseResult {
  const rebuiltLines: string[] = [];
  const items: ParsedStatementItem[] = [];
  const diagnostics: ItauParsingDiagnostics = {
    capturedTransactions: 0,
    capturedSum: 0,
    expectedTotal: null,
    difference: null,
    ignoredDateLines: [],
    orphanAmountLines: [],
    failures: [],
  };

  let currentCardLast4: string | null = null;
  let stopped = false;
  const pendingAmountBlocks: Array<{ blockLines: string[]; source: ItauSourceLine }> = [];

  const registerFailure = (source: ItauSourceLine, reason: string) => {
    diagnostics.failures.push({
      line: source.text,
      pageNumber: source.pageNumber,
      columnIndex: source.columnIndex,
      reason,
    });
  };

  const groupedByColumn = new Map<string, ItauSourceLine[]>();
  for (const source of sourceLines) {
    const key = `${source.pageNumber}:${source.columnIndex}`;
    const group = groupedByColumn.get(key) ?? [];
    group.push(source);
    groupedByColumn.set(key, group);
  }

  for (const [, lines] of groupedByColumn) {
    let startedAtSection = !(options?.requireSectionHeader ?? false);
    let pendingLeadingFragments: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const source = lines[index];
      const line = source.text;
      if (!line) continue;
      const last4 = extractCardLast4(line);
      if (last4) currentCardLast4 = last4;

      if (isItauTransactionSectionHeader(line)) {
        startedAtSection = true;
        continue;
      }

      if (!startedAtSection) continue;

      if (isItauFutureInstallmentSectionStart(line)) {
        stopped = true;
        break;
      }

      if (isItauIofRepasseLine(line)) {
        const item = createIofItem(line, ctx, currentCardLast4);
        if (item) {
          items.push(item);
          rebuiltLines.push(line);
        }
        continue;
      }

      if (isAmountOnlyLine(line)) {
        if (pendingAmountBlocks.length > 0) {
          const pending = pendingAmountBlocks.shift();
          if (pending) {
            const rebuiltPending = buildTransactionLine([...pending.blockLines, line]);
            if (rebuiltPending) {
              appendRebuiltTransaction(
                rebuiltPending,
                pending.source,
                ctx,
                items,
                rebuiltLines,
                diagnostics,
                registerFailure,
              );
              continue;
            }
          }
        }

        diagnostics.orphanAmountLines.push({
          line,
          pageNumber: source.pageNumber,
          columnIndex: source.columnIndex,
          reason: 'Valor monetário sem transação associada',
        });
        continue;
      }

      if (!ITAU_DATE_START.test(line)) {
        if (!isIgnorableItauLine(line) && !isItauFutureSectionSoftStop(line)) {
          if (pendingAmountBlocks.length === 0) {
            pendingLeadingFragments.push(line);
          }
        }
        continue;
      }

      const blockLines = [line, ...pendingLeadingFragments];
      pendingLeadingFragments = [];
      let cursor = index + 1;

      while (cursor < lines.length) {
        const nextLine = lines[cursor].text;
        if (!nextLine) {
          cursor += 1;
          continue;
        }
        if (isItauFutureInstallmentSectionStart(nextLine)) break;
        if (isItauTransactionSectionHeader(nextLine)) break;
        const nextIsInstallmentFragment =
          isInstallmentOnlyLine(nextLine) &&
          !blockHasAmount(blockLines) &&
          blockHasDescriptionContent(blockLines);
        if (ITAU_DATE_START.test(nextLine) && !nextIsInstallmentFragment) break;
        if (isItauIofRepasseLine(nextLine)) break;
        if (isItauCardSummaryLine(nextLine) || isItauCardholderLine(nextLine)) break;
        if (isIgnorableItauLine(nextLine) || isItauFutureSectionSoftStop(nextLine)) {
          cursor += 1;
          continue;
        }
        if (
          isAmountOnlyLine(nextLine) &&
          pendingAmountBlocks.length > 0
        ) {
          break;
        }
        if (blockHasAmount(blockLines)) {
          break;
        }

        blockLines.push(nextLine);
        cursor += 1;
        if (isAmountOnlyLine(nextLine) || ITAU_AMOUNT_AT_END.test(nextLine)) break;
      }

      index = cursor - 1;

      const rebuilt = buildTransactionLine(blockLines);
      if (!rebuilt) {
        if (blockHasDescriptionContent(blockLines)) {
          pendingAmountBlocks.push({ blockLines: [...blockLines], source });
          continue;
        }

        diagnostics.ignoredDateLines.push({
          line,
          pageNumber: source.pageNumber,
          columnIndex: source.columnIndex,
          reason: 'Linha com DD/MM não pôde ser reconstruída',
        });
        continue;
      }

      appendRebuiltTransaction(rebuilt, source, ctx, items, rebuiltLines, diagnostics, registerFailure);
    }

    if (stopped) break;
  }

  diagnostics.capturedTransactions = items.length;
  diagnostics.capturedSum = Number(items.reduce((sum, item) => sum + item.valor, 0).toFixed(2));
  diagnostics.expectedTotal = findExpectedTotal(sourceLines, ctx);
  diagnostics.difference = diagnostics.expectedTotal === null
    ? null
    : Number((diagnostics.expectedTotal - diagnostics.capturedSum).toFixed(2));

  if (diagnostics.difference !== null && diagnostics.difference !== 0) {
    console.warn('[itau-parser] divergence detected', {
      capturedTransactions: diagnostics.capturedTransactions,
      capturedSum: diagnostics.capturedSum,
      expectedTotal: diagnostics.expectedTotal,
      difference: diagnostics.difference,
      ignoredDateLines: diagnostics.ignoredDateLines,
      orphanAmountLines: diagnostics.orphanAmountLines,
      failures: diagnostics.failures,
    });
  }

  return { items, diagnostics, rebuiltLines };
}

export function preprocessItauText(text: string): string[] {
  return parseStructuredItauLines(
    buildTextSourceLines(text),
    { competencia: '2026-01' },
    { requireSectionHeader: true },
  ).rebuiltLines;
}

export type ItauLineClassification =
  | 'transaction'
  | 'partial-transaction'
  | 'date-only'
  | 'amount-only'
  | 'category-city'
  | 'card-summary'
  | 'international-metadata'
  | 'future-section'
  | 'header-noise'
  | 'unknown';

export function classifyItauLine(line: string): ItauLineClassification {
  const cleaned = cleanItauNoisePrefix(line);
  if (!cleaned) return 'unknown';
  if (isItauFutureInstallmentSectionStart(cleaned)) return 'future-section';
  if (isItauHeaderOrNoiseLine(cleaned)) return 'header-noise';
  if (isItauCategoryCityLine(cleaned)) return 'category-city';
  if (isItauCardSummaryLine(cleaned)) return 'card-summary';
  if (isItauInternationalMetadataLine(cleaned)) return 'international-metadata';
  if (isAmountOnlyLine(cleaned)) return 'amount-only';
  if (isInstallmentOnlyLine(cleaned)) return 'date-only';
  if (isItauTransactionLine(cleaned) || isItauIofRepasseLine(cleaned)) return 'transaction';
  if (ITAU_DATE_START.test(cleaned)) return 'partial-transaction';
  return 'unknown';
}

export interface ItauDebugResult {
  totalSourceLines: number;
  sourceLines: string[];
  classificationCounts: Partial<Record<ItauLineClassification, number>>;
  classifications: Array<{ line: string; classification: ItauLineClassification }>;
  afterPreprocessLines: number;
  preprocessedLines: string[];
  finalTransactions: number;
  parsedItems: ParsedStatementItem[];
  diagnostics: ItauParsingDiagnostics;
}

export function debugItauParsing(text: string, ctx?: ParserContext): ItauDebugResult {
  const sourceLines = buildTextSourceLines(text);
  const classifications = sourceLines.map((line) => ({
    line: line.text,
    classification: classifyItauLine(line.text),
  }));

  const classificationCounts = classifications.reduce<Partial<Record<ItauLineClassification, number>>>(
    (acc, { classification }) => {
      acc[classification] = (acc[classification] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const parsed = parseStructuredItauLines(
    sourceLines,
    ctx ?? { competencia: '2026-01' },
    { requireSectionHeader: true },
  );

  return {
    totalSourceLines: sourceLines.length,
    sourceLines: sourceLines.map((line) => line.text),
    classificationCounts,
    classifications,
    afterPreprocessLines: parsed.rebuiltLines.length,
    preprocessedLines: parsed.rebuiltLines,
    finalTransactions: parsed.items.length,
    parsedItems: parsed.items,
    diagnostics: parsed.diagnostics,
  };
}

export function parseItauDocument(
  document: PdfExtractedDocument,
  ctx: ParserContext,
): ItauParseResult {
  return parseStructuredItauLines(buildLayoutSourceLines(document), ctx);
}

export function parseItauStatement(
  textOrLines: string | string[],
  ctx: ParserContext,
): ParsedStatementItem[] {
  if (Array.isArray(textOrLines)) {
    return parseStructuredItauLines(
      textOrLines.map((line, index) => ({
        text: cleanItauNoisePrefix(line),
        pageNumber: 1,
        columnIndex: 0,
        y: 1000 - index,
        index,
      })),
      ctx,
      { requireSectionHeader: false },
    ).items;
  }

  return parseStructuredItauLines(
    buildTextSourceLines(textOrLines),
    ctx,
    { requireSectionHeader: true },
  ).items;
}
