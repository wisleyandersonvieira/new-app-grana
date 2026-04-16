import { extractInstallmentInfo, normalizeStatementDescription, stripAccents } from '../normalization';
import { BaseStatementParser } from './base-parser';
import type { ParsedStatementItem, ParserContext } from '../types';

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
};

const MONTH_NAMES = Object.keys(MONTH_MAP).join('|');

// Matches "DD MMM" at start of line (e.g., "07 MAR", "30 OUT")
const DATE_START = new RegExp(`^(\\d{2})\\s+(${MONTH_NAMES})\\b`, 'i');

// Matches R$ amount (possibly negative)
const RS_AMOUNT = /(-?\s*R\$\s*[\d.,]+)/;

// Lines to skip entirely
const SICOOB_NOISE = [
  /^saldo anterior/i,
  /^total\b/i,
  /^pagamento\b/i,
  /protec[aã]o perda/i,
  /^data\s+descri/i,
  /movimenta[cç]/i,
  /sicoob card/i,
  /ref\s+\d+\s+\w+\s+a\s+\d+/i,
  /^p[aá]gina\s+\d/i,
  /^\d{4}$/,
  /^US\$/,
  /^V\.DOL/,
  /^U\$/,
  /lancamentos/i,
  /resumo/i,
  /anuidade/i,
  /encargos/i,
  /vencimento/i,
  /parcelamento/i,
  /fatura anterior/i,
  /creditos internacionais/i,
  /despesas.?debitos/i,
  /rotativo/i,
  /saldo (total|do rotativo)/i,
  /valores\s+(ja|pago)/i,
  /tarifas\s+contrat/i,
  /parcelas\s+(de anuidade|para|sem|com)/i,
  /perda ou roubo/i,
  /sms\s+mes/i,
  /divida\s+a\s+vencer/i,
  /cooperativa/i,
  /fechamento/i,
  /pagamentos?\s+recebidos/i,
  /comprou.*zerou/i,
  /apuracao/i,
  /desconto/i,
  /^total de \w+/i,
  /^de \d+$/,
];

function isSicoobNoise(line: string): boolean {
  const n = stripAccents(line).trim();
  return SICOOB_NOISE.some((re) => re.test(n));
}

function parseRsAmount(raw: string): number {
  const isNegative = raw.includes('-');
  const cleaned = raw.replace(/R\$/g, '').replace(/-/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number.parseFloat(cleaned);
  return isNegative ? -value : value;
}

/**
 * Check if a line is a cardholder header like "JESSICA L R S VIEIRA" or "WISLEY ANDERSON VIEIRA"
 * followed by a card number on the same or next line
 */
function isCardholderLine(line: string): boolean {
  // All uppercase name, possibly followed by a 4-digit card number
  if (/^\d{4}$/.test(line.trim())) return true;
  // Full uppercase name (at least 2 words, no digits except trailing card number)
  if (/^[A-ZÁÉÍÓÚÂÊÔÀÃÕÇ\s]{6,}(\s+\d{4})?$/.test(line.trim())) return true;
  return false;
}

function isInstallmentLine(line: string): boolean {
  return /^\d{2}\/\d{2}$/.test(line.trim());
}

function isRsOnlyLine(line: string): boolean {
  return /^-?\s*R\$\s*[\d.,]+$/.test(line.trim());
}

function isCurrencyMetaLine(line: string): boolean {
  return /^V\.DOL/i.test(line) || /^US\$/i.test(line) || /^U\$/i.test(line);
}

function isDescriptionContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isSicoobNoise(trimmed)) return false;
  if (isCardholderLine(trimmed)) return false;
  if (DATE_START.test(trimmed)) return false;
  if (isInstallmentLine(trimmed)) return false;
  if (isRsOnlyLine(trimmed)) return false;
  if (isCurrencyMetaLine(trimmed)) return false;
  return true;
}

export class SicoobParser extends BaseStatementParser {
  readonly bank = 'sicoob' as const;

  canParse(text: string): boolean {
    return /sicoob/i.test(text) && /(resumo da fatura|movimenta[cç]|sicoob card|fatura de|cooperativa.*credito.*sicoob)/i.test(text);
  }

  parse(text: string, context: ParserContext): ParsedStatementItem[] {
    const items = this.parseSicoobTabularFormat(text, context);
    if (items.length > 0) return items;

    // Fallback: try the older card format
    const fallbackItems = this.parseSicoobLineByLine(text, context);
    if (fallbackItems.length > 0) return fallbackItems;

    // Last resort: generic
    const lines = this.getCandidateLines(text).filter((line) => !/ita[uú]/i.test(line));
    return this.parseGenericPurchaseLines(lines, context);
  }

  /**
   * Parses the tabular Sicoob format with columns:
   * DATA | DESCRIÇÃO | CIDADE | VALOR EM R$
   * 
   * Transactions look like:
   *   07 MAR  LIVELO S.A.*Clube Li  SANTANA DE PA  R$ 44,90
   * 
   * International transactions span multiple lines:
   *   07 MAR  UNITED01643766419805  HOUNSLOW  US$ 29,99  U$ 29,99
   *   V.DOL 5,2878
   *   R$ 158,58
   */
  private parseSicoobTabularFormat(text: string, context: ParserContext): ParsedStatementItem[] {
    const items: ParsedStatementItem[] = [];
    const allLines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    // Find where purchase transactions start (after "MOVIMENTAÇÕES DA CONTA" section)
    // Look for "DATA DESCRIÇÃO" header or first transaction after cardholder+card number
    let inTransactionSection = false;
    let passedMovimentacoes = false;

    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];

      // Detect "MOVIMENTAÇÕES DA CONTA" section header
      if (/movimenta[cç][oõ]es da conta/i.test(stripAccents(line))) {
        passedMovimentacoes = true;
        i++;
        continue;
      }

      // Detect column header "DATA DESCRIÇÃO CIDADE VALOR"
      if (/^data\s+descri/i.test(line)) {
        inTransactionSection = true;
        i++;
        continue;
      }

      // Skip noise lines
      if (isSicoobNoise(line)) { i++; continue; }

      // Skip cardholder lines
      if (isCardholderLine(line)) { i++; continue; }

      // In the "MOVIMENTAÇÕES DA CONTA" section, skip IOF, payments, etc. until we reach purchase section
      if (passedMovimentacoes && !inTransactionSection) {
        const dateMatch = line.match(DATE_START);
        if (dateMatch) {
          const afterDate = line.slice(dateMatch[0].length).trim();
          // If it's IOF, payment, anuidade, desc anuidade - skip
          if (/iof|pagamento|anuidade|desc\s+anuidade/i.test(afterDate)) {
            i++;
            continue;
          }
        }
        // If we see a cardholder name followed by card number, switch to transaction section
        i++;
        continue;
      }

      // Parse transaction lines
      const dateMatch = line.match(DATE_START);
      if (!dateMatch) {
        // Could be a continuation line (installment code like "03/05" or city)
        i++;
        continue;
      }

      const day = dateMatch[1];
      const monthAbbr = dateMatch[2].toUpperCase();
      const monthNum = MONTH_MAP[monthAbbr];
      if (!monthNum) { i++; continue; }

      const afterDate = line.slice(dateMatch[0].length).trim();
      let nextIdx = i + 1;

      // Try to extract R$ amount from this line
      const rsMatch = afterDate.match(RS_AMOUNT);
      let valor: number | null = null;
      let rawDescription: string;

      if (rsMatch) {
        // Amount on this line
        valor = parseRsAmount(rsMatch[1]);
        rawDescription = afterDate.replace(RS_AMOUNT, '').trim();

        // Check for installment code on next line (e.g., "03/05")
        if (nextIdx < allLines.length && /^\d{2}\/\d{2}$/.test(allLines[nextIdx].trim())) {
          rawDescription += ' ' + allLines[nextIdx].trim();
          nextIdx++;
        }
      } else if (/US\$|U\$/i.test(afterDate)) {
        // International transaction - R$ amount on a subsequent line
        rawDescription = afterDate;

        // Scan ahead for R$ line
        while (nextIdx < allLines.length) {
          const nextLine = allLines[nextIdx].trim();

          // New date line = stop
          if (DATE_START.test(nextLine)) break;
          // Cardholder line = stop
          if (isCardholderLine(nextLine)) break;
          // Column header = stop
          if (/^data\s+descri/i.test(nextLine)) break;
          // Skip V.DOL and US$/U$ lines (international currency info)
          if (/^V\.DOL/i.test(nextLine) || /^US\$/i.test(nextLine) || /^U\$/i.test(nextLine)) {
            nextIdx++;
            continue;
          }
          // Other noise = stop
          if (isSicoobNoise(nextLine)) break;

          if (/^R\$\s*[\d.,]+$/.test(nextLine)) {
            valor = parseRsAmount(nextLine);
            nextIdx++;
            break;
          }

          // Skip V.DOL, US$, U$ lines
          nextIdx++;
        }

        if (valor === null) { i++; continue; }
      } else {
        // Description without amount on this line - check next lines
        rawDescription = afterDate;

        // Look for installment on next line
        if (nextIdx < allLines.length && /^\d{2}\/\d{2}$/.test(allLines[nextIdx].trim())) {
          rawDescription += ' ' + allLines[nextIdx].trim();
          nextIdx++;
        }

        // Look for city + amount or just amount
        if (nextIdx < allLines.length) {
          const nextLine = allLines[nextIdx].trim();
          const nextRs = nextLine.match(RS_AMOUNT);
          if (nextRs) {
            valor = parseRsAmount(nextRs[1]);
            const cityPart = nextLine.replace(RS_AMOUNT, '').trim();
            if (cityPart) rawDescription += ' ' + cityPart;
            nextIdx++;
          }
        }

        if (valor === null) { i++; continue; }
      }

      // Clean up description
      rawDescription = rawDescription
        .replace(/US\$\s*[\d.,]+\s*U\$\s*[\d.,]+/gi, '')
        .replace(/US\$\s*[\d.,]+/gi, '')
        .replace(/U\$\s*[\d.,]+/gi, '')
        .replace(/R\$\s*[\d.,]+/g, '')
        .replace(/V\.DOL\s*[\d.,]+/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Remove trailing city names (all-caps words at end that are cities)
      // Cities appear after the description, we'll keep them as part of description for now

      // Skip negative amounts (payments/credits)
      if (valor < 0) { i = nextIdx; continue; }

      // Skip IOF
      if (/\biof\b/i.test(rawDescription)) { i = nextIdx; continue; }

      // Skip anuidade
      if (/anuidade/i.test(rawDescription)) { i = nextIdx; continue; }

      if (!rawDescription) { i = nextIdx; continue; }

      const { parcelas } = extractInstallmentInfo(rawDescription);
      const descricao_normalizada = normalizeStatementDescription(rawDescription);
      if (!descricao_normalizada) { i = nextIdx; continue; }

      // Infer purchase date
      const [compYear, compMonth] = context.competencia.split('-').map(Number);
      const purchaseMonthNum = Number(monthNum);
      const candidateYear = purchaseMonthNum > compMonth ? compYear - 1 : compYear;
      const data_compra = `${candidateYear}-${monthNum}-${day}`;

      items.push({
        descricao_original: rawDescription,
        descricao_normalizada,
        data_compra,
        valor,
        parcelas,
        banco_origem: 'sicoob',
        observacao_parser: null,
      });

      i = nextIdx;
    }

    return items;
  }

  /**
   * Fallback: line-by-line parsing for simpler Sicoob formats
   */
  private parseSicoobLineByLine(text: string, context: ParserContext): ParsedStatementItem[] {
    const items: ParsedStatementItem[] = [];
    const allLines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];

      if (isSicoobNoise(line) || isCardholderLine(line)) { i++; continue; }

      const dateMatch = line.match(DATE_START);
      if (!dateMatch) { i++; continue; }

      const day = dateMatch[1];
      const monthAbbr = dateMatch[2].toUpperCase();
      const monthNum = MONTH_MAP[monthAbbr];
      if (!monthNum) { i++; continue; }

      const afterDate = line.slice(dateMatch[0].length).trim();
      let nextIdx = i + 1;

      const amountMatch = afterDate.match(RS_AMOUNT);
      let valor: number;
      let rawDescription: string;

      if (amountMatch) {
        valor = parseRsAmount(amountMatch[1]);
        rawDescription = afterDate.replace(RS_AMOUNT, '').trim();

        if (nextIdx < allLines.length && /^\d{2}\/\d{2}$/.test(allLines[nextIdx].trim())) {
          rawDescription += ' ' + allLines[nextIdx].trim();
          nextIdx++;
        }
      } else {
        rawDescription = afterDate;
        let foundAmount = false;

        while (nextIdx < allLines.length) {
          const nextLine = allLines[nextIdx].trim();
          if (DATE_START.test(nextLine) && !isSicoobNoise(nextLine)) break;
          if (isCardholderLine(nextLine)) break;

          if (/^R\$\s*[\d.,]+$/.test(nextLine)) {
            valor = parseRsAmount(nextLine);
            foundAmount = true;
            nextIdx++;
            if (nextIdx < allLines.length && /^V\.DOL/i.test(allLines[nextIdx].trim())) nextIdx++;
            break;
          }

          if (/^US\$|^U\$|^V\.DOL/i.test(nextLine)) { nextIdx++; continue; }
          if (/^\d{2}\/\d{2}$/.test(nextLine)) { rawDescription += ' ' + nextLine; nextIdx++; continue; }

          rawDescription += ' ' + nextLine;
          nextIdx++;
        }

        if (!foundAmount) { i++; continue; }
      }

      rawDescription = rawDescription
        .replace(/US\$\s*[\d.,]+\s*U\$\s*[\d.,]+/gi, '')
        .replace(/R\$\s*[\d.,]+/g, '')
        .replace(/V\.DOL\s*[\d.,]+/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (valor! < 0 || /\biof\b/i.test(rawDescription) || /anuidade/i.test(rawDescription) || !rawDescription) {
        i = nextIdx;
        continue;
      }

      const { parcelas } = extractInstallmentInfo(rawDescription);
      const descricao_normalizada = normalizeStatementDescription(rawDescription);
      if (!descricao_normalizada) { i = nextIdx; continue; }

      const [compYear, compMonth] = context.competencia.split('-').map(Number);
      const purchaseMonthNum = Number(monthNum);
      const candidateYear = purchaseMonthNum > compMonth ? compYear - 1 : compYear;
      const data_compra = `${candidateYear}-${monthNum}-${day}`;

      items.push({
        descricao_original: rawDescription,
        descricao_normalizada,
        data_compra,
        valor: valor!,
        parcelas,
        banco_origem: 'sicoob',
        observacao_parser: null,
      });

      i = nextIdx;
    }

    return items;
  }
}
