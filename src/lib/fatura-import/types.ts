export type SupportedBank = 'itau' | 'sicoob';

export type ParsedStatementItem = {
  descricao_original: string;
  descricao_normalizada: string;
  data_compra: string | null;
  valor: number;
  parcelas: string | null;
  banco_origem: SupportedBank;
  observacao_parser: string | null;
};

export type StatementSuggestion = {
  categoria_id: string | null;
  subcategoria_id: string | null;
  categoria_nome?: string | null;
  confianca: number;
  origem: 'historico_exato' | 'historico_similar' | 'historico_prefixo' | null;
  recorrente: boolean;
};

export type ImportedInvoiceItem = ParsedStatementItem & {
  categoria_id: string | null;
  subcategoria_id: string | null;
  categoria_sugerida_id: string | null;
  subcategoria_sugerida_id: string | null;
  sugestao_confianca: number | null;
  sugestao_origem: StatementSuggestion['origem'];
  recorrente: boolean;
  importado_pdf: boolean;
};

import type { PdfExtractedDocument } from './pdf-text';

export type ParserContext = {
  competencia: string;
  pdfLayout?: PdfExtractedDocument;
  expectedTotalCurrentCharges?: number | null;
  statementDate?: string | null;
  dueDate?: string | null;
};

export interface StatementParser {
  readonly bank: SupportedBank;
  canParse(text: string): boolean;
  parse(text: string, context: ParserContext): ParsedStatementItem[];
}
