import { BaseStatementParser } from './base-parser';
import type { ParsedStatementItem, ParserContext } from '../types';

export class ItauParser extends BaseStatementParser {
  readonly bank = 'itau' as const;

  canParse(text: string): boolean {
    return /ita[uú]/i.test(text) && /(resumo da fatura|lancamentos: compras e saques)/i.test(text);
  }

  parse(text: string, context: ParserContext): ParsedStatementItem[] {
    const lines = this.getCandidateLines(text).filter((line) => !/sicoob/i.test(line));
    return this.parseGenericPurchaseLines(lines, context);
  }
}
