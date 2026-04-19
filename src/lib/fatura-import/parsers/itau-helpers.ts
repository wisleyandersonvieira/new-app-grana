import {
  inferTransactionDate,
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
    data_compra: inferTransactionDate(dateMatch[1], ctx.competencia),
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
  const rebuilt: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const current = cleanItauNoisePrefix(lines[index]);
    if (!current) {
      index += 1;
      continue;
    }

    // Case 1: already a complete, parseable transaction — push as-is.
    if (isItauTransactionLine(current)) {
      rebuilt.push(current);
      index += 1;
      continue;
    }

    // Case 2: starts with a date (either date-only "22/08" OR a partial line
    // "22/08 VIVARA MOR 08/10" that is missing its trailing amount).
    // Lines that do NOT start with a date are orphaned fragments — discard them.
    if (!ITAU_DATE_START.test(current)) {
      index += 1;
      continue;
    }

    // For date-only lines the description accumulates from subsequent lines.
    // For partial lines the description is already in `current`.
    const isDateOnly = isInstallmentOnlyLine(current);

    const descriptionParts: string[] = [];
    let rawAmount: string | null = null;
    let lookahead = index + 1;

    while (lookahead < lines.length) {
      const candidate = cleanItauNoisePrefix(lines[lookahead]);

      if (!candidate || isIgnorableItauLine(candidate)) {
        lookahead += 1;
        continue;
      }

      if (isItauFutureInstallmentSectionStart(candidate)) {
        break;
      }

      if (isItauFutureSectionSoftStop(candidate)) {
        lookahead += 1;
        continue;
      }

      // A complete transaction line is always the start of the next entry.
      if (isItauTransactionLine(candidate)) {
        break;
      }

      if (isAmountOnlyLine(candidate)) {
        rawAmount = candidate;
        lookahead += 1;
        break;
      }

      // A lone "DD/MM" token — could be an installment code (e.g. "08/10")
      // or the beginning of the next transaction.
      if (isInstallmentOnlyLine(candidate)) {
        // Partial lines ("22/08 VIVARA MOR 08/10") already carry their installment
        // code, so any bare date in the lookahead must be the next transaction.
        // For date-only lines, accept exactly one installment code once we have
        // at least one description part; a second bare date signals a new entry.
        if (!isDateOnly || descriptionParts.length === 0) break;
        descriptionParts.push(candidate);
        lookahead += 1;
        continue;
      }

      // A line that starts with a date and has more content → next transaction.
      if (ITAU_DATE_START.test(candidate)) {
        break;
      }

      // Non-date line that ends with an amount value: the PDF placed description
      // and amount on the same row (e.g. "VIVARA MOR 08/10 930,15").
      // Extract both rather than pushing the whole thing as a description fragment.
      if (ITAU_AMOUNT_AT_END.test(candidate)) {
        const amtMatch = candidate.match(ITAU_AMOUNT_AT_END);
        if (amtMatch) {
          const remainder = candidate.slice(0, candidate.length - amtMatch[0].length).trim();
          if (remainder) descriptionParts.push(remainder);
          rawAmount = amtMatch[0];
          lookahead += 1;
          break;
        }
      }

      descriptionParts.push(candidate);
      lookahead += 1;
    }

    // Rebuild whenever we found an amount — extractItauTransactionParts will
    // reject the result if there is still no description.
    if (rawAmount !== null) {
      rebuilt.push(
        [current, ...descriptionParts, rawAmount].join(' ').replace(/\s+/g, ' ').trim(),
      );
      index = lookahead;
      continue;
    }

    index += 1;
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

  const rebuilt = rebuildBrokenItauTransactionLines(cleanedLines);

  // Visible in browser DevTools (Console → Verbose) and Node debug output.
  console.debug(
    '[itau-parser] source=%d  after-filter=%d  after-rebuild=%d  stopped-at=%s',
    sourceLines.length,
    cleanedLines.length,
    rebuilt.length,
    stoppedAt ?? 'none',
  );

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
