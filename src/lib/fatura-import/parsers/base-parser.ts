import {
  extractInstallmentInfo,
  inferTransactionDate,
  normalizeStatementDescription,
  parseBrazilianCurrency,
  stripAccents,
} from '../normalization';
import type { ParsedStatementItem, ParserContext, StatementParser } from '../types';

// Matches a positive or negative Brazilian currency value at the end of a line.
// Also handles "- 52,50" (minus sign separated by space, as used in Itaú reversals).
const AMOUNT_AT_END_PATTERN = /(-\s*\d[\d.]*,\d{2}|\d[\d.]*,\d{2})$/;

function isNoiseLine(line: string): boolean {
  // Strip accents so patterns work regardless of diacritics in extracted PDF text
  // e.g. "Lançamentos" is normalised to "Lancamentos" before matching.
  const normalized = stripAccents(line).toLowerCase();

  const noisePatterns = [
    /resumo da fatura/,
    /lancamentos/,
    /movimentac/,
    /pagamento minimo/,
    /saldo anterior/,
    /limite/,
    /encargos/,
    /iof/,
    /\bcet\b/,
    /total/,
    /rotativo/,
    /juros/,
    /programa/,
    /central de atendimento/,
    // Future-instalment summary lines present in Itaú statements
    /proxima fatura/,
    /demais faturas/,
    // Exchange-rate metadata lines from international transactions
    /dolar.*conversao/,
    /conversao.*dolar/,
    // Repasse de IOF line
    /repasse.*iof/,
  ];

  return noisePatterns.some((pattern) => pattern.test(normalized));
}

export abstract class BaseStatementParser implements StatementParser {
  abstract readonly bank: StatementParser['bank'];
  abstract canParse(text: string): boolean;

  protected getCandidateLines(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 4)
      .filter((line) => !isNoiseLine(line));
  }

  protected parseGenericPurchaseLines(lines: string[], context: ParserContext): ParsedStatementItem[] {
    const items: ParsedStatementItem[] = [];

    for (const line of lines) {
      const valueMatch = line.match(AMOUNT_AT_END_PATTERN);
      if (!valueMatch) continue;

      const lineWithoutValue = line.slice(0, line.length - valueMatch[1].length).trim();
      const dateMatch = lineWithoutValue.match(/^(\d{2}\/\d{2})\s+(.+)$/);
      const rawDescription = dateMatch ? dateMatch[2].trim() : lineWithoutValue;
      const purchaseDate = dateMatch ? inferTransactionDate(dateMatch[1], context.competencia) : null;
      const { parcelas } = extractInstallmentInfo(rawDescription);
      const descricao_normalizada = normalizeStatementDescription(rawDescription);
      if (!descricao_normalizada) continue;

      items.push({
        descricao_original: rawDescription,
        descricao_normalizada,
        data_compra: purchaseDate,
        valor: parseBrazilianCurrency(valueMatch[1]),
        parcelas,
        banco_origem: this.bank,
        observacao_parser: null,
      });
    }

    return items;
  }

  abstract parse(text: string, context: ParserContext): ParsedStatementItem[];
}
