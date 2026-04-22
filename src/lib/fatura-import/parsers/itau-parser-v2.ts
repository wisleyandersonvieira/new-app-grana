import type { ParsedStatementItem, ParserContext } from '../types';
import type { PdfExtractedDocument } from '../pdf-text';
import { stripAccents } from '../normalization';
import {
  cleanItauNoisePrefix,
  extractItauTransactionParts,
  isItauCategoryCityLine,
  isItauCardSummaryLine,
  isItauFutureInstallmentSectionStart,
  isItauInternationalMetadataLine,
} from './itau-helpers';

const DATE_START = /^\d{1,2}\/\d{2}(?!\/\d{2,4})\b/;
const AMOUNT_ONLY = /^(?:R\$\s*)?-?\s*\d{1,3}(?:\.\d{3})*,\d{2}$|^-\s*\d{1,3}(?:\.\d{3})*,\d{2}$/;
const AMOUNT_AT_END = /((?:R\$\s*)?-?\s*\d{1,3}(?:\.\d{3})*,\d{2}|-\s*\d{1,3}(?:\.\d{3})*,\d{2})$/;
const SECTION_NOISE_RE = [
  /^banco\s+ita/,
  /^resumo\s+da\s+fatura/,
  /^data\s+estabelecimento/,
  /^data\s+produtos/,
  /^valor\s+em\s+r\$/,
  /^total\s+dos\s+lancamentos/,
  /^total\s+transacoes/,
  /^total\s+lancamentos/,
  /^pagamento\s+minimo/,
  /^pagamento\s+efetuado/,
  /^saldo\s+anterior/,
  /^saldo\s+financiado/,
  /^lancamentos\s+atuais/,
  /^total\s+desta\s+fatura/,
  /^total\s+da\s+fatura/,
  /^encargos\s+cobrados/,
  /^limites\s+de\s+credito/,
  /^pagina\s+\d+/,
  /^continua/,
  /^dolar\s+de\s+conversao/,
  /^pc\s*-\s*\d+/,
  /^uso\s+do\s+banco/,
  /^sacador\s+avalista/,
  /^simulacao/,
  /^parcelamento\s+da\s+fatura/,
  /^0800\s+\d+/,
  /^4004\s+\d+/,
  /^\d{4}\s+\d{4}$/,
  /^nosso\s+numero/,
  /^valor\s+do\s+documento/,
  /^autenticacao\s+mecanica/,
  /^ficha\s+de\s+compensacao/,
  /^central\s+de\s+atendimento/,
  /^previsao\s+do\s+proximo/,
  /^lancamentos\s+no\s+cartao/,
  /^lancamentos:\s*/,
  /^compras\s+parceladas/,
  // Card-holder name lines: "JESSICA R S VIEIRA (final 8275)"
  /\(final\s+\d{4}\)\s*$/,
  // Section/page-level noise
  /^o\s+total\s+da\s+sua\s+fatura/,
  /^com\s+vencimento\s+em/,
  /^limite\s+total\s+de\s+credito/,
  /^preparamos\s+outras\s+opcoes/,
  /^pague\s+sua\s+fatura/,
];

function norm(text: string): string {
  return stripAccents(text).toLowerCase();
}

function isNoise(text: string): boolean {
  const n = norm(text);
  return SECTION_NOISE_RE.some((re) => re.test(n));
}

function isSkippable(text: string): boolean {
  return (
    isNoise(text) ||
    isItauCategoryCityLine(text) ||
    isItauCardSummaryLine(text) ||
    isItauInternationalMetadataLine(text)
  );
}

// Matches the transaction section headers that signal we have entered the
// actual charges section (distinct from the cover-page summary table).
function isTransactionSectionHeader(text: string): boolean {
  const n = norm(text);
  return (
    /^lancamentos:\s*compras e saques$/.test(n) ||
    /^lancamentos internacionais$/.test(n) ||
    /^lancamentos:\s*produtos e servicos$/.test(n)
  );
}

type SourceLine = {
  text: string;
  y: number;
  pageNumber: number;
  columnIndex: number;
};

/**
 * Collects all transaction-candidate lines across the entire document,
 * stopping at "Compras parceladas – próximas faturas" — but only after the
 * transaction section header has been seen at least once.
 *
 * The guard is required because the Itaú cover page contains a summary table
 * that lists "Compras parceladas – próximas faturas" as a row header before
 * any actual transactions appear, which would otherwise trigger a premature
 * stop and yield zero results.
 *
 * Uses a labelled `break` so the stop exits ALL loops at once (page + column)
 * rather than only the innermost column loop.
 */
function collectTransactionLines(document: PdfExtractedDocument): SourceLine[] {
  const result: SourceLine[] = [];
  // Global across all pages and columns — once the section header appears in
  // any column (even column 0 when bold rendering duplicates the header),
  // subsequent columns and pages all benefit from it being set.
  let seenTransactionSection = false;

  outer: for (const page of document.pages) {
    for (const column of page.columns) {
      for (const line of column.lines) {
        const cleaned = cleanItauNoisePrefix(line.text);
        if (!cleaned) continue;

        // Must check section header BEFORE isSkippable because the header
        // text also matches the /^lancamentos:\s*/ noise pattern.
        if (isTransactionSectionHeader(cleaned)) {
          seenTransactionSection = true;
          continue;
        }

        // Only stop at the future-installments section after we have already
        // entered the transaction section.  Avoids the cover-page false stop.
        if (seenTransactionSection && isItauFutureInstallmentSectionStart(cleaned)) {
          break outer;
        }

        if (isSkippable(cleaned)) continue;
        result.push({
          text: cleaned,
          y: line.y,
          pageNumber: line.pageNumber,
          columnIndex: line.columnIndex,
        });
      }
    }
  }

  console.debug(
    '[itau-v2] collected', result.length, 'lines,',
    document.pages.length, 'pages,',
    'seenSection:', seenTransactionSection,
  );

  return result;
}

/**
 * Groups source lines by (pageNumber, columnIndex) so that y-proximity
 * matching only pairs lines that belong to the same column on the same page.
 */
function groupByColumn(lines: SourceLine[]): Map<string, SourceLine[]> {
  const map = new Map<string, SourceLine[]>();
  for (const line of lines) {
    const key = `${line.pageNumber}:${line.columnIndex}`;
    const group = map.get(key) ?? [];
    group.push(line);
    map.set(key, group);
  }
  return map;
}

function matchAmountsInColumn(
  dateLines: SourceLine[],
  amountLines: SourceLine[],
  ctx: ParserContext,
): ParsedStatementItem[] {
  const items: ParsedStatementItem[] = [];
  const used = new Set<number>();
  const sorted = [...dateLines].sort((a, b) => b.y - a.y);

  for (const dateLine of sorted) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < amountLines.length; i++) {
      if (used.has(i)) continue;
      const dist = Math.abs(amountLines[i].y - dateLine.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    // 25pt covers both same-row and the 3–8pt y-offset seen in Itaú PDFs
    if (bestIdx >= 0 && bestDist <= 25) {
      used.add(bestIdx);
      const reconstructed = `${dateLine.text} ${amountLines[bestIdx].text}`;
      const item = extractItauTransactionParts(reconstructed, ctx);
      if (item) items.push(item);
    }
  }

  return items;
}

function parseColumnGroup(lines: SourceLine[], ctx: ParserContext): ParsedStatementItem[] {
  if (lines.length === 0) return [];

  const completeTxLines: SourceLine[] = [];
  const incompleteDateLines: SourceLine[] = [];
  const amountOnlyLines: SourceLine[] = [];
  const specialLines: SourceLine[] = [];

  for (const line of lines) {
    if (AMOUNT_ONLY.test(line.text)) {
      amountOnlyLines.push(line);
    } else if (DATE_START.test(line.text)) {
      if (AMOUNT_AT_END.test(line.text)) {
        completeTxLines.push(line);
      } else {
        incompleteDateLines.push(line);
      }
    } else {
      // Could be IOF repasse or other non-date transaction lines
      specialLines.push(line);
    }
  }

  const items: ParsedStatementItem[] = [];

  for (const line of completeTxLines) {
    const item = extractItauTransactionParts(line.text, ctx);
    if (item) items.push(item);
  }

  items.push(...matchAmountsInColumn(incompleteDateLines, amountOnlyLines, ctx));

  // Handle IOF repasse and other non-date valid charges
  for (const line of specialLines) {
    const item = extractItauTransactionParts(line.text, ctx);
    if (item) items.push(item);
  }

  return items;
}

export function parseItauDocumentV2(document: PdfExtractedDocument, ctx: ParserContext): ParsedStatementItem[] {
  const allLines = collectTransactionLines(document);
  const columnGroups = groupByColumn(allLines);

  console.debug('[itau-v2] column groups:', [...columnGroups.entries()].map(([k, v]) => `${k}(${v.length})`).join(', '));

  const items: ParsedStatementItem[] = [];
  for (const [key, lines] of columnGroups) {
    const groupItems = parseColumnGroup(lines, ctx);
    console.debug(`[itau-v2] group ${key}: ${lines.length} lines → ${groupItems.length} transactions`);
    items.push(...groupItems);
  }

  console.debug('[itau-v2] total transactions:', items.length);
  return items;
}
