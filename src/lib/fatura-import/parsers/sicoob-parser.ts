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

    let inTransactionSection = false;
    let passedMovimentacoes = false;
    let pendingDescriptionLines: string[] = [];

    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];

      if (/movimenta[cç][oõ]es da conta/i.test(stripAccents(line))) {
        passedMovimentacoes = true;
        pendingDescriptionLines = [];
        i++;
        continue;
      }

      if (/^data\s+descri/i.test(line)) {
        inTransactionSection = true;
        pendingDescriptionLines = [];
        i++;
        continue;
      }

      if (isSicoobNoise(line)) {
        pendingDescriptionLines = [];
        i++;
        continue;
      }

      if (isCardholderLine(line)) {
        pendingDescriptionLines = [];
        i++;
        continue;
      }

      if (passedMovimentacoes && !inTransactionSection) {
        const dateMatch = line.match(DATE_START);
        if (dateMatch) {
          const afterDate = line.slice(dateMatch[0].length).trim();
          if (/iof|pagamento|anuidade|desc\s+anuidade/i.test(afterDate)) {
            i++;
            continue;
          }
        }
        i++;
        continue;
      }

      const dateMatch = line.match(DATE_START);
      if (!dateMatch) {
        if (inTransactionSection && isDescriptionContinuationLine(line)) {
          pendingDescriptionLines.push(line);
        }
        i++;
        continue;
      }

      const day = dateMatch[1];
      const monthAbbr = dateMatch[2].toUpperCase();
      const monthNum = MONTH_MAP[monthAbbr];
      if (!monthNum) {
        pendingDescriptionLines = [];
        i++;
        continue;
      }

      const afterDate = line.slice(dateMatch[0].length).trim();
      let nextIdx = i + 1;
      const prefix = pendingDescriptionLines.length > 0 ? `${pendingDescriptionLines.join(' ')} ` : '';
      pendingDescriptionLines = [];

      const rsMatch = afterDate.match(RS_AMOUNT);
      let valor: number | null = null;
      let rawDescription: string;

      if (rsMatch) {
        valor = parseRsAmount(rsMatch[1]);
        rawDescription = `${prefix}${afterDate.replace(RS_AMOUNT, '').trim()}`.trim();

        if (nextIdx < allLines.length && isInstallmentLine(allLines[nextIdx])) {
          rawDescription += ' ' + allLines[nextIdx].trim();
          nextIdx++;
        }
      } else if (/US\$|U\$/i.test(afterDate)) {
        rawDescription = `${prefix}${afterDate}`.trim();

        while (nextIdx < allLines.length) {
          const nextLine = allLines[nextIdx].trim();
          if (DATE_START.test(nextLine) || isCardholderLine(nextLine) || /^data\s+descri/i.test(nextLine)) break;
          if (isCurrencyMetaLine(nextLine)) {
            nextIdx++;
            continue;
          }
          if (isSicoobNoise(nextLine)) break;
          if (isRsOnlyLine(nextLine)) {
            valor = parseRsAmount(nextLine);
            nextIdx++;
            break;
          }
          if (isInstallmentLine(nextLine)) {
            rawDescription += ` ${nextLine}`;
            nextIdx++;
            continue;
          }
          if (isDescriptionContinuationLine(nextLine)) {
            rawDescription += ` ${nextLine}`;
            nextIdx++;
            continue;
          }
          nextIdx++;
        }

        if (valor === null) {
          i++;
          continue;
        }
      } else {
        rawDescription = `${prefix}${afterDate}`.trim();

        while (nextIdx < allLines.length) {
          const nextLine = allLines[nextIdx].trim();
          if (DATE_START.test(nextLine) || isCardholderLine(nextLine) || /^data\s+descri/i.test(nextLine)) break;
          if (isSicoobNoise(nextLine)) break;
          if (isInstallmentLine(nextLine)) {
            rawDescription += ` ${nextLine}`;
            nextIdx++;
            continue;
          }
          if (isCurrencyMetaLine(nextLine)) {
            nextIdx++;
            continue;
          }
          const nextRs = nextLine.match(RS_AMOUNT);
          if (nextRs) {
            valor = parseRsAmount(nextRs[1]);
            const cityPart = nextLine.replace(RS_AMOUNT, '').trim();
            if (cityPart) rawDescription += ` ${cityPart}`;
            nextIdx++;
            break;
          }
          if (isDescriptionContinuationLine(nextLine)) {
            rawDescription += ` ${nextLine}`;
            nextIdx++;
            continue;
          }
          nextIdx++;
        }

        if (valor === null) {
          i++;
          continue;
        }
      }

      rawDescription = rawDescription
        .replace(/US\$\s*[\d.,]+\s*U\$\s*[\d.,]+/gi, '')
        .replace(/US\$\s*[\d.,]+/gi, '')
        .replace(/U\$\s*[\d.,]+/gi, '')
        .replace(/R\$\s*[\d.,]+/g, '')
        .replace(/V\.DOL\s*[\d.,]+/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (valor < 0 || /\biof\b/i.test(rawDescription) || /anuidade/i.test(rawDescription) || !rawDescription) {
        i = nextIdx;
        continue;
      }

      const { parcelas } = extractInstallmentInfo(rawDescription);
      const descricao_normalizada = normalizeStatementDescription(rawDescription);
      if (!descricao_normalizada) {
        i = nextIdx;
        continue;
      }

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
    let pendingDescriptionLines: string[] = [];

    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];

      if (isSicoobNoise(line) || isCardholderLine(line)) {
        pendingDescriptionLines = [];
        i++;
        continue;
      }

      const dateMatch = line.match(DATE_START);
      if (!dateMatch) {
        if (isDescriptionContinuationLine(line)) pendingDescriptionLines.push(line);
        i++;
        continue;
      }

      const day = dateMatch[1];
      const monthAbbr = dateMatch[2].toUpperCase();
      const monthNum = MONTH_MAP[monthAbbr];
      if (!monthNum) {
        pendingDescriptionLines = [];
        i++;
        continue;
      }

      const afterDate = line.slice(dateMatch[0].length).trim();
      let nextIdx = i + 1;
      const prefix = pendingDescriptionLines.length > 0 ? `${pendingDescriptionLines.join(' ')} ` : '';
      pendingDescriptionLines = [];

      const amountMatch = afterDate.match(RS_AMOUNT);
      let valor: number;
      let rawDescription: string;

      if (amountMatch) {
        valor = parseRsAmount(amountMatch[1]);
        rawDescription = `${prefix}${afterDate.replace(RS_AMOUNT, '').trim()}`.trim();

        if (nextIdx < allLines.length && isInstallmentLine(allLines[nextIdx])) {
          rawDescription += ' ' + allLines[nextIdx].trim();
          nextIdx++;
        }
      } else {
        rawDescription = `${prefix}${afterDate}`.trim();
        let foundAmount = false;

        while (nextIdx < allLines.length) {
          const nextLine = allLines[nextIdx].trim();
          if (DATE_START.test(nextLine) && !isSicoobNoise(nextLine)) break;
          if (isCardholderLine(nextLine)) break;

          if (isRsOnlyLine(nextLine)) {
            valor = parseRsAmount(nextLine);
            foundAmount = true;
            nextIdx++;
            while (nextIdx < allLines.length && isCurrencyMetaLine(allLines[nextIdx].trim())) nextIdx++;
            break;
          }

          if (isCurrencyMetaLine(nextLine)) { nextIdx++; continue; }
          if (isInstallmentLine(nextLine)) { rawDescription += ' ' + nextLine; nextIdx++; continue; }
          if (isDescriptionContinuationLine(nextLine)) { rawDescription += ' ' + nextLine; nextIdx++; continue; }
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
