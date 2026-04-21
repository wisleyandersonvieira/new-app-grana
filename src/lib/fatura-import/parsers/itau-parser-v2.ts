import type { ParsedStatementItem, ParserContext } from '../types';
import type { PdfExtractedDocument, PdfTextLine } from '../pdf-text';
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
const SECTION_START_RE = /^lancamentos[:\s-]+(?:compras\s+e\s+saques|internacionais|produtos\s+e\s+servicos)/;
const NOISE_RE = [
  /^banco\s+ita/,
  /^resumo\s+da\s+fatura/,
  /^data\s+estabelecimento/,
  /^valor\s+em\s+r\$/,
  /^total\s+dos\s+lancamentos/,
  /^total\s+transacoes/,
  /^total\s+lancamentos/,
  /^pagamento\s+minimo/,
  /^saldo\s+anterior/,
  /^encargos\s+cobrados/,
  /^limites\s+de\s+credito/,
  /^pagina\s+\d+/,
  /^continua$/,
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
];

function norm(text: string): string {
  return stripAccents(text).toLowerCase();
}

function isNoiseText(text: string): boolean {
  const n = norm(text);
  return NOISE_RE.some((re) => re.test(n));
}

function isSectionStart(text: string): boolean {
  return SECTION_START_RE.test(norm(text));
}

function isSkippableLine(text: string): boolean {
  return (
    isNoiseText(text) ||
    isItauCategoryCityLine(text) ||
    isItauCardSummaryLine(text) ||
    isItauInternationalMetadataLine(text)
  );
}

type CleanLine = { text: string; y: number };

function extractSectionLines(lines: CleanLine[]): CleanLine[] {
  let capturing = false;
  const result: CleanLine[] = [];

  for (const line of lines) {
    if (isSectionStart(line.text)) {
      capturing = true;
      continue;
    }
    if (isItauFutureInstallmentSectionStart(line.text)) {
      break;
    }
    if (capturing && !isSkippableLine(line.text)) {
      result.push(line);
    }
  }

  if (result.length === 0) {
    // No section header found — return all non-skippable lines as fallback
    return lines.filter((l) => !isSkippableLine(l.text));
  }

  return result;
}

function matchAmounts(
  dateLines: CleanLine[],
  amountLines: CleanLine[],
  ctx: ParserContext,
): ParsedStatementItem[] {
  const items: ParsedStatementItem[] = [];
  const used = new Set<number>();
  // Process date lines top-to-bottom (highest y first in PDF coordinates)
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

    // 30pt tolerance covers both same-row amounts and adjacent-row amounts
    if (bestIdx >= 0 && bestDist <= 30) {
      used.add(bestIdx);
      const reconstructed = `${dateLine.text} ${amountLines[bestIdx].text}`;
      const item = extractItauTransactionParts(reconstructed, ctx);
      if (item) items.push(item);
    }
  }

  return items;
}

function parseColumnLines(rawLines: PdfTextLine[], ctx: ParserContext): ParsedStatementItem[] {
  const cleaned: CleanLine[] = rawLines
    .map((l) => ({ text: cleanItauNoisePrefix(l.text), y: l.y }))
    .filter((l) => l.text.length > 0);

  const sectionLines = extractSectionLines(cleaned);

  const completeTxLines: CleanLine[] = [];
  const incompleteDateLines: CleanLine[] = [];
  const amountOnlyLines: CleanLine[] = [];

  for (const line of sectionLines) {
    if (AMOUNT_ONLY.test(line.text)) {
      amountOnlyLines.push(line);
    } else if (DATE_START.test(line.text)) {
      if (AMOUNT_AT_END.test(line.text)) {
        completeTxLines.push(line);
      } else {
        incompleteDateLines.push(line);
      }
    }
  }

  const items: ParsedStatementItem[] = [];

  for (const line of completeTxLines) {
    const item = extractItauTransactionParts(line.text, ctx);
    if (item) items.push(item);
  }

  items.push(...matchAmounts(incompleteDateLines, amountOnlyLines, ctx));

  return items;
}

export function parseItauDocumentV2(document: PdfExtractedDocument, ctx: ParserContext): ParsedStatementItem[] {
  const items: ParsedStatementItem[] = [];

  for (const page of document.pages) {
    for (const column of page.columns) {
      items.push(...parseColumnLines(column.lines, ctx));
    }
  }

  return items;
}
