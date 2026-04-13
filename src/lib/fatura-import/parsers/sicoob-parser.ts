import { BaseStatementParser } from './base-parser';
import type { ParsedStatementItem, ParserContext } from '../types';

export class SicoobParser extends BaseStatementParser {
  readonly bank = 'sicoob' as const;

  canParse(text: string): boolean {
    return /sicoob/i.test(text) && /(resumo da fatura|movimenta[cç])/i.test(text);
  }

  parse(text: string, context: ParserContext): ParsedStatementItem[] {
    const lines = this.getCandidateLines(text).filter((line) => !/ita[uú]/i.test(line));
    return this.parseGenericPurchaseLines(lines, context);
  }
}
