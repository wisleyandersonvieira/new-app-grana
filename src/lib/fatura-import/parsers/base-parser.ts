import { extractInstallmentInfo, normalizeStatementDescription } from '../normalization';
import type { ParsedStatementItem, ParserContext, StatementParser } from '../types';

const AMOUNT_AT_END_PATTERN = /(-?\d[\d.]*,\d{2})$/;

function parseAmount(raw: string): number {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  return Number.parseFloat(normalized);
}

function inferPurchaseDate(dayMonth: string, competencia: string): string | null {
  const [year, month] = competencia.split('-').map(Number);
  const [day, purchaseMonth] = dayMonth.split('/').map(Number);
  if (!year || !month || !day || !purchaseMonth) return null;
  const candidateYear = purchaseMonth > month ? year - 1 : year;
  return `${candidateYear}-${String(purchaseMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isNoiseLine(line: string): boolean {
  const noisePatterns = [
    /resumo da fatura/i,
    /lancamentos/i,
    /movimentac/i,
    /pagamento minimo/i,
    /saldo anterior/i,
    /limite/i,
    /encargos/i,
    /iof/i,
    /c et/i,
    /total/i,
    /rotativo/i,
    /anuidade/i,
    /juros/i,
    /programa/i,
    /central de atendimento/i,
  ];

  return noisePatterns.some((pattern) => pattern.test(line));
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
      const purchaseDate = dateMatch ? inferPurchaseDate(dateMatch[1], context.competencia) : null;
      const { parcelas } = extractInstallmentInfo(rawDescription);
      const descricao_normalizada = normalizeStatementDescription(rawDescription);
      if (!descricao_normalizada) continue;

      items.push({
        descricao_original: rawDescription,
        descricao_normalizada,
        data_compra: purchaseDate,
        valor: parseAmount(valueMatch[1]),
        parcelas,
        banco_origem: this.bank,
        observacao_parser: null,
      });
    }

    return items;
  }

  abstract parse(text: string, context: ParserContext): ParsedStatementItem[];
}
