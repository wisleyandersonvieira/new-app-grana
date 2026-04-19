import {
  normalizeInstallmentText,
  normalizeStatementDescription,
  parseBrazilianCurrency,
  removeNoisePrefixBeforeDate,
  stripAccents,
} from '../normalization';
import type { ParsedStatementItem, ParserContext } from '../types';

const ITAU_DATE_START = /^\d{1,2}\/\d{2}\b/;
const ITAU_DATE_ONLY = /^\d{1,2}\/\d{2}$/;
const ITAU_AMOUNT_ONLY = /^-?\s*R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2}$|^-\s*\d{1,3}(?:\.\d{3})*,\d{2}$/;
const ITAU_AMOUNT_AT_END = /(-\s*)?\d{1,3}(?:\.\d{3})*,\d{2}$/;

function inferItauTransactionDate(dayMonth: string, competencia: string): string | null {
  const [competenciaYear] = competencia.split('-').map(Number);
  const [day, transactionMonth] = dayMonth.split('/').map(Number);

  if (!competenciaYear || !day || !transactionMonth) return null;

  return `${competenciaYear}-${String(transactionMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeItauLine(line: string): string {
  return removeNoisePrefixBeforeDate(line)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeItauTextForMatch(line: string): string {
  return stripAccents(normalizeItauLine(line)).toLowerCase();
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
    /central de atendimento/,
    /resumo em r\$/,
    /^pagina \d+/,
  ].some((pattern) => pattern.test(normalized));
}

export function cleanItauNoisePrefix(line: string): string {
  return normalizeItauLine(line);
}

export function isItauCategoryCityLine(line: string): boolean {
  const cleaned = cleanItauNoisePrefix(line);
  if (!cleaned || ITAU_DATE_START.test(cleaned) || ITAU_AMOUNT_AT_END.test(cleaned)) return false;

  const upper = stripAccents(cleaned).toUpperCase();

  // Lines with URL characters or merchant-name punctuation are never category/city headers.
  // e.g. "APPLE.COM/BILL", "AMAZON MKTPL*BE8", "USER@HOST"
  if (/[/*@#]/.test(upper)) return false;

  const lettersOnly = upper.replace(/[^A-Z]/g, '');
  if (lettersOnly.length < 6) return false;

  const mostlyUppercase = lettersOnly.length >= Math.max(6, Math.floor(cleaned.length * 0.45));
  // Real Itaú category/city lines use one of two separator patterns:
  //   " .CITY"   e.g. "ALIMENTAÇÃO .MARINGA"
  //   "WORD.WORD" e.g. "TURISMO E ENTRETENIM.CAMPO GRANDE" (5+ chars on each side)
  // Short TLD-style dots like ".COM" (3 chars) are merchant URLs, not separators.
  const hasCategoryCitySeparator =
    /\s\.[A-Z]/.test(upper) || /[A-Z]{5,}\.[A-Z]{4,}/.test(upper);

  return mostlyUppercase && hasCategoryCitySeparator;
}

export function isItauCardSummaryLine(line: string): boolean {
  return /^lancamentos no cartao \(final \d{4}\)\s+\d/.test(normalizeItauTextForMatch(line));
}

export function isItauInternationalMetadataLine(line: string): boolean {
  const normalized = normalizeItauTextForMatch(line);
  const startsWithDate = ITAU_DATE_START.test(cleanItauNoisePrefix(line));

  if (/^dolar de conversao\b/.test(normalized)) return true;
  if (/^repasse de iof\b/.test(normalized)) return true;
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
    /lancamentos:\s*produtos e servicos/,
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
    isItauInternationalMetadataLine(line)
  );
}

export function extractItauTransactionParts(
  line: string,
  ctx: ParserContext,
): ParsedStatementItem | null {
  const cleaned = cleanItauNoisePrefix(line);
  if (!cleaned) return null;
  if (isIgnorableItauLine(cleaned) || isItauFutureInstallmentSectionStart(cleaned)) return null;

  const dateMatch = cleaned.match(/^(\d{1,2}\/\d{2})\s+(.+)$/);
  if (!dateMatch) return null;

  const amountMatch = cleaned.match(ITAU_AMOUNT_AT_END);
  if (!amountMatch) return null;

  const rawAmount = amountMatch[0];
  const amount = parseBrazilianCurrency(rawAmount);
  if (Number.isNaN(amount)) return null;

  const body = dateMatch[2]
    .slice(0, dateMatch[2].length - rawAmount.length)
    .trim();

  if (!body) return null;

  let rawDescription = body;
  let parcelas: string | null = null;

  const installmentMatch = body.match(/(\d{1,2}\/\d{2})$/);
  if (installmentMatch && installmentMatch.index !== undefined && installmentMatch.index > 0) {
    parcelas = normalizeInstallmentText(installmentMatch[1]);
    rawDescription = body.slice(0, installmentMatch.index).trim();
  }

  if (!rawDescription) return null;

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

export function rebuildBrokenItauTransactionLines(lines: string[]): string[] {
  return rebuildItauTransactionBlocks(lines);
}

function buildItauTransactionBlock(blockLines: string[]): string | null {
  const cleaned = blockLines
    .map((line) => cleanItauNoisePrefix(line))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (cleaned.length === 0) return null;

  const firstLine = cleaned[0];
  if (!ITAU_DATE_START.test(firstLine)) return null;

  if (cleaned.length === 1 && isItauTransactionLine(firstLine)) {
    return firstLine;
  }

  const dateMatch = firstLine.match(/^(\d{1,2}\/\d{2})\s*(.*)$/);
  if (!dateMatch) return null;

  const [, transactionDate, firstBody] = dateMatch;
  const fragments: string[] = [];
  let rawAmount: string | null = null;

  const consumeFragment = (fragment: string) => {
    if (!fragment) return;
    if (isIgnorableItauLine(fragment) || isItauFutureSectionSoftStop(fragment)) return;
    if (isAmountOnlyLine(fragment)) {
      rawAmount = fragment;
      return;
    }

    const amountMatch = fragment.match(ITAU_AMOUNT_AT_END);
    if (amountMatch) {
      rawAmount = amountMatch[0];
      const remainder = fragment.slice(0, fragment.length - amountMatch[0].length).trim();
      if (remainder) fragments.push(remainder);
      return;
    }

    fragments.push(fragment);
  };

  consumeFragment(firstBody.trim());

  for (let index = 1; index < cleaned.length; index += 1) {
    const line = cleaned[index];
    const lineIsInstallmentFragment =
      isInstallmentOnlyLine(line) &&
      rawAmount === null &&
      blockHasDescriptionContent(cleaned.slice(0, index));

    if (ITAU_DATE_START.test(line) && !lineIsInstallmentFragment && !isAmountOnlyLine(line)) {
      break;
    }
    consumeFragment(line);
  }

  if (!rawAmount) return null;

  const body = fragments.join(' ').replace(/\s+/g, ' ').trim();
  if (!body) return null;

  return `${transactionDate} ${body} ${rawAmount}`.replace(/\s+/g, ' ').trim();
}

function blockHasDescriptionContent(blockLines: string[]): boolean {
  if (blockLines.length === 0) return false;

  const firstLine = cleanItauNoisePrefix(blockLines[0]).replace(/\s+/g, ' ').trim();
  const firstLineMatch = firstLine.match(/^(\d{1,2}\/\d{2})\s*(.*)$/);
  if (firstLineMatch?.[2]?.trim()) return true;

  return blockLines
    .slice(1)
    .map((line) => cleanItauNoisePrefix(line).replace(/\s+/g, ' ').trim())
    .some((line) => Boolean(line) && !isInstallmentOnlyLine(line) && !isAmountOnlyLine(line));
}

export function rebuildItauTransactionBlocks(lines: string[]): string[] {
  const rebuilt: string[] = [];
  let statsComplete = 0;
  let statsBlockRebuildOk = 0;
  let statsBlockRebuildFail = 0;
  let statsDiscarded = 0;

  let currentBlock: string[] = [];
  let pendingLeadingFragments: string[] = [];

  const flushCurrentBlock = () => {
    if (currentBlock.length === 0) return;

    const rebuiltBlock = buildItauTransactionBlock(currentBlock);
    if (rebuiltBlock) {
      rebuilt.push(rebuiltBlock);
      if (currentBlock.length === 1 && rebuiltBlock === cleanItauNoisePrefix(currentBlock[0])) {
        statsComplete += 1;
      } else {
        statsBlockRebuildOk += 1;
      }
    } else {
      statsBlockRebuildFail += 1;
    }

    currentBlock = [];
  };

  for (const sourceLine of lines) {
    const line = cleanItauNoisePrefix(sourceLine).replace(/\s+/g, ' ').trim();
    if (!line) continue;

    if (isItauFutureInstallmentSectionStart(line)) {
      flushCurrentBlock();
      break;
    }

    if (isIgnorableItauLine(line) || isItauFutureSectionSoftStop(line)) {
      if (currentBlock.length === 0) {
        statsDiscarded += 1;
      }
      continue;
    }

    const lineIsInstallmentFragment =
      isInstallmentOnlyLine(line) &&
      currentBlock.length > 0 &&
      buildItauTransactionBlock(currentBlock) === null &&
      blockHasDescriptionContent(currentBlock);

    if (ITAU_DATE_START.test(line) && !lineIsInstallmentFragment) {
      flushCurrentBlock();
      currentBlock = [line, ...pendingLeadingFragments];
      pendingLeadingFragments = [];
      continue;
    }

    if (currentBlock.length > 0) {
      const currentAlreadyComplete = buildItauTransactionBlock(currentBlock) !== null;
      if (currentAlreadyComplete) {
        flushCurrentBlock();
        pendingLeadingFragments = [line];
      } else {
        currentBlock.push(line);
      }
    } else {
      pendingLeadingFragments.push(line);
    }
  }

  flushCurrentBlock();
  statsDiscarded += pendingLeadingFragments.length;

  console.debug(
    '[itau-rebuild] in=%d complete=%d rebuilt-ok=%d rebuilt-fail=%d discarded=%d out=%d',
    lines.length,
    statsComplete,
    statsBlockRebuildOk,
    statsBlockRebuildFail,
    statsDiscarded,
    rebuilt.length,
  );
  if (statsBlockRebuildFail > 0) {
    const failedLines: string[] = [];
    let scanIdx = 0;
    while (scanIdx < lines.length && failedLines.length < 20) {
      const l = cleanItauNoisePrefix(lines[scanIdx]);
      if (l && ITAU_DATE_START.test(l) && !isItauTransactionLine(l)) {
        failedLines.push(l);
      }
      scanIdx += 1;
    }
    console.debug('[itau-rebuild] sample date-starting non-complete lines (first 20):', failedLines);
  }

  return rebuilt;
}

export function preprocessItauText(text: string): string[] {
  const sourceLines = text
    .split('\n')
    .map((line) => cleanItauNoisePrefix(line))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const cleanedLines: string[] = [];
  let stoppedAt: string | null = null;

  for (const line of sourceLines) {
    if (isItauFutureInstallmentSectionStart(line)) {
      stoppedAt = line;
      break;
    }
    if (isItauFutureSectionSoftStop(line)) continue;
    if (isIgnorableItauLine(line)) continue;
    cleanedLines.push(line);
  }

  const rebuilt = rebuildItauTransactionBlocks(cleanedLines);

  // Visible in browser DevTools (Console → Verbose) and Node debug output.
  console.debug(
    '[itau-parser] source=%d  after-filter=%d  after-rebuild=%d  stopped-at=%s',
    sourceLines.length,
    cleanedLines.length,
    rebuilt.length,
    stoppedAt ?? 'none',
  );
  // Show a sample of cleaned lines so the format that reaches rebuild is visible.
  console.debug('[itau-parser] sample cleaned lines (first 40):', cleanedLines.slice(0, 40));

  return rebuilt;
}

// ── Debug / diagnostics ──────────────────────────────────────────────────────

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
  if (isItauTransactionLine(cleaned)) return 'transaction';
  if (ITAU_DATE_START.test(cleaned)) return 'partial-transaction';
  return 'unknown';
}

export interface ItauDebugResult {
  totalSourceLines: number;
  classificationCounts: Partial<Record<ItauLineClassification, number>>;
  classifications: Array<{ line: string; classification: ItauLineClassification }>;
  afterPreprocessLines: number;
  finalTransactions: number;
}

export function debugItauParsing(text: string, ctx?: ParserContext): ItauDebugResult {
  const sourceLines = text
    .split('\n')
    .map((line) => cleanItauNoisePrefix(line).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const classifications = sourceLines.map((line) => ({
    line,
    classification: classifyItauLine(line),
  }));

  const classificationCounts = classifications.reduce<Partial<Record<ItauLineClassification, number>>>(
    (acc, { classification }) => {
      acc[classification] = (acc[classification] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const preprocessed = preprocessItauText(text);
  const finalItems = ctx
    ? parseItauStatement(preprocessed, ctx)
    : parseItauStatement(preprocessed, { competencia: '2026-01' });

  return {
    totalSourceLines: sourceLines.length,
    classificationCounts,
    classifications,
    afterPreprocessLines: preprocessed.length,
    finalTransactions: finalItems.length,
  };
}

export function parseItauStatement(
  textOrLines: string | string[],
  ctx: ParserContext,
): ParsedStatementItem[] {
  const lines = Array.isArray(textOrLines) ? textOrLines : preprocessItauText(textOrLines);
  return lines
    .map((line) => extractItauTransactionParts(line, ctx))
    .filter((item): item is ParsedStatementItem => item !== null);
}
