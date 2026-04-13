import { extractInstallmentInfo, normalizeStatementDescription, stripAccents } from '../normalization';
import { BaseStatementParser } from './base-parser';
import type { ParsedStatementItem, ParserContext } from '../types';

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
};

// Matches: "DD MMM DESCRIPTION ... R$ X.XXX,XX" (with optional city, installments, international amounts)
// Also handles negative: "-R$ X.XXX,XX"
const SICOOB_LINE =
  /^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+(-?\s*R\$\s*[\d.,]+)\s*(?:V\.DOL\s*[\d.,]+)?$/i;

// International transaction: extract the R$ amount from "US$ ... U$ ... R$ 158,58 V.DOL ..."
const INTL_RS_AMOUNT = /R\$\s*([\d.,]+)\s*(?:V\.DOL|$)/i;

// Regular R$ amount at end of description
const RS_AMOUNT_END = /(-?\s*R\$\s*[\d.,]+)\s*(?:V\.DOL\s*[\d.,]+)?\s*$/i;

// Noise lines specific to Sicoob Card statements
const SICOOB_NOISE = [
  /^saldo anterior/i,
  /^total\b/i,
  /^pagamento\b/i,
  /protecao perda/i,
  /^data\s+descri/i,
  /movimenta[cç]/i,
  /^jessica|^wisley|^\w+\s+\w+\s+\w+\s+vieira/i, // cardholder name lines
  /^\d{4}$/,  // card suffix lines like "7372"
  /sicoob card/i,
  /ref\s+\d+\s+\w+\s+a\s+\d+/i, // "REF 2 MAR A 1 ABR"
];

function isSicoobNoise(line: string): boolean {
  const n = stripAccents(line).trim();
  return SICOOB_NOISE.some((re) => re.test(n));
}

function parseRsAmount(raw: string): number {
  const cleaned = raw.replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return Math.abs(Number.parseFloat(cleaned));
}

export class SicoobParser extends BaseStatementParser {
  readonly bank = 'sicoob' as const;

  canParse(text: string): boolean {
    return /sicoob/i.test(text) && /(resumo da fatura|movimenta[cç]|sicoob card)/i.test(text);
  }

  parse(text: string, context: ParserContext): ParsedStatementItem[] {
    // Try the new Sicoob Card format first (DD MMM + R$ amounts)
    const cardItems = this.parseSicoobCardFormat(text, context);
    if (cardItems.length > 0) return cardItems;

    // Fallback to generic parsing
    const lines = this.getCandidateLines(text).filter((line) => !/ita[uú]/i.test(line));
    return this.parseGenericPurchaseLines(lines, context);
  }

  private parseSicoobCardFormat(text: string, context: ParserContext): ParsedStatementItem[] {
    const items: ParsedStatementItem[] = [];
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 4);

    for (const line of lines) {
      if (isSicoobNoise(line)) continue;

      // Match: DD MMM <description> ... R$ X.XXX,XX
      const dateMatch = line.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/i);
      if (!dateMatch) continue;

      const amountMatch = line.match(RS_AMOUNT_END);
      if (!amountMatch) continue;

      const day = dateMatch[1];
      const monthAbbr = dateMatch[2].toUpperCase();
      const monthNum = MONTH_MAP[monthAbbr];
      if (!monthNum) continue;

      // Extract R$ amount (for international transactions, get the BRL value)
      const intlMatch = line.match(INTL_RS_AMOUNT);
      const valor = intlMatch ? parseRsAmount(intlMatch[0]) : parseRsAmount(amountMatch[1]);

      // Check for negative amounts (credits/payments)
      const isNegative = amountMatch[1].includes('-');

      // Extract description: everything between date and amount
      const afterDate = line.slice(dateMatch[0].length);
      let rawDescription = afterDate.replace(RS_AMOUNT_END, '').trim();

      // Remove international USD amounts from description
      rawDescription = rawDescription.replace(/US\$\s*[\d.,]+\s*U\$\s*[\d.,]+/gi, '').trim();

      // Remove trailing city name (ALL CAPS at end, typically after last space-separated word)
      // But keep it if it's part of the merchant name
      // We don't strip the city - it's part of the description context

      if (!rawDescription) continue;

      const { parcelas } = extractInstallmentInfo(rawDescription);
      const descricao_normalizada = normalizeStatementDescription(rawDescription);
      if (!descricao_normalizada) continue;

      // Infer purchase date
      const [compYear, compMonth] = context.competencia.split('-').map(Number);
      const purchaseMonthNum = Number(monthNum);
      const candidateYear = purchaseMonthNum > compMonth ? compYear - 1 : compYear;
      const data_compra = `${candidateYear}-${monthNum}-${day}`;

      // Skip payment/credit lines (negative values like "PAGAMENTO DEBITO EM CONTA")
      if (isNegative) continue;

      // Skip IOF lines
      if (/\biof\b/i.test(rawDescription)) continue;

      // Skip anuidade/fee lines
      if (/anuidade/i.test(rawDescription)) continue;
      if (/desc\s+anuidade/i.test(rawDescription)) continue;

      items.push({
        descricao_original: rawDescription,
        descricao_normalizada,
        data_compra,
        valor,
        parcelas,
        banco_origem: 'sicoob',
        observacao_parser: null,
      });
    }

    return items;
  }
}
