import { BaseStatementParser } from './base-parser';
import type { ParsedStatementItem, ParserContext } from '../types';
import { parseItauDocument, parseItauStatement } from './itau-helpers';
import { stripAccents } from '../normalization';

export class ItauParser extends BaseStatementParser {
  readonly bank = 'itau' as const;

  canParse(text: string): boolean {
    const n = stripAccents(text).toLowerCase();
    return /ita[uú]/i.test(text) && (
      /resumo da fatura/.test(n) ||
      /lancamentos.*compras e saques/.test(n)
    );
  }

  parse(text: string, context: ParserContext): ParsedStatementItem[] {
    if (context.pdfLayout) {
      return parseItauDocument(context.pdfLayout, context).items;
    }
    return parseItauStatement(text, context);
  }
}
