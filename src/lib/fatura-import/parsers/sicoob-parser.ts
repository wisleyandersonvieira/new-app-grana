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

// Lines to skip
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

export class SicoobParser extends BaseStatementParser {
  readonly bank = 'sicoob' as const;

  canParse(text: string): boolean {
    return /sicoob/i.test(text) && /(resumo da fatura|movimenta[cç]|sicoob card)/i.test(text);
  }

  parse(text: string, context: ParserContext): ParsedStatementItem[] {
    const items = this.parseSicoobCardFormat(text, context);
    if (items.length > 0) return items;

    // Fallback to generic parsing
    const lines = this.getCandidateLines(text).filter((line) => !/ita[uú]/i.test(line));
    return this.parseGenericPurchaseLines(lines, context);
  }

  private parseSicoobCardFormat(text: string, context: ParserContext): ParsedStatementItem[] {
    const items: ParsedStatementItem[] = [];
    const allLines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];

      // Skip noise
      if (isSicoobNoise(line)) { i++; continue; }

      // Skip cardholder name lines (e.g., "JESSICA L R S VIEIRA 5468")
      if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{8,}\s*\d{0,4}$/.test(line) && !DATE_START.test(line)) {
        i++;
        continue;
      }

      const dateMatch = line.match(DATE_START);
      if (!dateMatch) {
        // Check if this is a description continuation that belongs to the NEXT date line
        // e.g., "CASA DOS UNIFORMES M" followed by "16 JAN MARINGA R$ 363,18"
        if (i + 1 < allLines.length) {
          const nextLine = allLines[i + 1];
          const nextDate = nextLine.match(DATE_START);
          if (nextDate && RS_AMOUNT.test(nextLine) && !isSicoobNoise(line)) {
            // This line is a prefix description for the next line
            const parsed = this.parseTransactionCluster(line, allLines, i + 1, context);
            if (parsed) {
              items.push(parsed.item);
              i = parsed.nextIndex;
              continue;
            }
          }
        }
        i++;
        continue;
      }

      // We have a date line - parse transaction cluster
      const parsed = this.parseTransactionCluster(null, allLines, i, context);
      if (parsed) {
        items.push(parsed.item);
        i = parsed.nextIndex;
      } else {
        i++;
      }
    }

    return items;
  }

  /**
   * Parses a transaction that may span multiple lines:
   * - Optional prefix description on a line before the date line
   * - Date line with partial or full description + possibly an R$ amount
   * - Optional continuation lines (installment codes, international amounts)
   */
  private parseTransactionCluster(
    prefixDesc: string | null,
    lines: string[],
    dateLineIdx: number,
    context: ParserContext,
  ): { item: ParsedStatementItem; nextIndex: number } | null {
    const dateLine = lines[dateLineIdx];
    const dateMatch = dateLine.match(DATE_START);
    if (!dateMatch) return null;

    const day = dateMatch[1];
    const monthAbbr = dateMatch[2].toUpperCase();
    const monthNum = MONTH_MAP[monthAbbr];
    if (!monthNum) return null;

    const afterDate = dateLine.slice(dateMatch[0].length).trim();
    let nextIdx = dateLineIdx + 1;

    // Check if this date line has an R$ amount
    const amountMatch = afterDate.match(RS_AMOUNT);
    let valor: number;
    let rawDescription: string;

    if (amountMatch) {
      // Amount is on this line
      valor = parseRsAmount(amountMatch[1]);
      rawDescription = afterDate.replace(RS_AMOUNT, '').trim();

      // Check for installment code on next line (e.g., "03/05")
      if (nextIdx < lines.length && /^\d{2}\/\d{2}$/.test(lines[nextIdx].trim())) {
        rawDescription += ' ' + lines[nextIdx].trim();
        nextIdx++;
      }
    } else {
      // No amount on date line - check if it's an international transaction
      // The R$ amount may be on a subsequent line
      rawDescription = afterDate;

      // Collect continuation lines until we find an R$ amount or a new date
      let foundAmount = false;
      while (nextIdx < lines.length) {
        const nextLine = lines[nextIdx].trim();

        // Stop at new date line or noise
        if (DATE_START.test(nextLine) && !isSicoobNoise(nextLine)) break;
        // Stop at another description prefix
        if (nextIdx + 1 < lines.length && DATE_START.test(lines[nextIdx + 1]?.trim())) break;

        if (/^R\$\s*[\d.,]+$/.test(nextLine)) {
          // Found standalone R$ amount (international transaction)
          valor = parseRsAmount(nextLine);
          foundAmount = true;
          nextIdx++;
          // Skip V.DOL line if present
          if (nextIdx < lines.length && /^V\.DOL/i.test(lines[nextIdx].trim())) {
            nextIdx++;
          }
          break;
        }

        if (/^US\$|^U\$|^V\.DOL/i.test(nextLine)) {
          // International currency info - skip
          nextIdx++;
          continue;
        }

        if (/^\d{2}\/\d{2}$/.test(nextLine)) {
          // Installment code
          rawDescription += ' ' + nextLine;
          nextIdx++;
          continue;
        }

        // Other continuation text
        rawDescription += ' ' + nextLine;
        nextIdx++;
      }

      if (!foundAmount) return null;
    }

    // Prepend prefix description if any
    if (prefixDesc) {
      rawDescription = prefixDesc + ' ' + rawDescription;
    }

    // Clean up description
    rawDescription = rawDescription
      .replace(/US\$\s*[\d.,]+\s*U\$\s*[\d.,]+/gi, '')
      .replace(/R\$\s*[\d.,]+/g, '')
      .replace(/V\.DOL\s*[\d.,]+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Skip negative amounts (payments/credits)
    if (valor! < 0) return null;

    // Skip IOF
    if (/\biof\b/i.test(rawDescription)) return null;

    // Skip anuidade
    if (/anuidade/i.test(rawDescription)) return null;

    if (!rawDescription) return null;

    const { parcelas } = extractInstallmentInfo(rawDescription);
    const descricao_normalizada = normalizeStatementDescription(rawDescription);
    if (!descricao_normalizada) return null;

    // Infer purchase date
    const [compYear, compMonth] = context.competencia.split('-').map(Number);
    const purchaseMonthNum = Number(monthNum);
    const candidateYear = purchaseMonthNum > compMonth ? compYear - 1 : compYear;
    const data_compra = `${candidateYear}-${monthNum}-${day}`;

    return {
      item: {
        descricao_original: rawDescription,
        descricao_normalizada,
        data_compra,
        valor: valor!,
        parcelas,
        banco_origem: 'sicoob',
        observacao_parser: null,
      },
      nextIndex: nextIdx,
    };
  }
}
