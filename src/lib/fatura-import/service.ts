import { supabase } from '@/integrations/supabase/client';
import { extractPdfText } from './pdf-text';
import { normalizeStatementDescription, startsWithUsefulPrefix, tokenizeNormalizedDescription } from './normalization';
import { ItauParser } from './parsers/itau-parser';
import { SicoobParser } from './parsers/sicoob-parser';
import type { ImportedInvoiceItem, ParsedStatementItem, ParserContext, StatementSuggestion, SupportedBank } from './types';

const parsers = [new ItauParser(), new SicoobParser()];
type SuggestionRow = {
  categoria: string | null;
  categoria_id: string | null;
  quantidade_uso: number;
  recorrente: boolean;
  subcategoria_id: string | null;
  ultima_data_uso: string | null;
  descricao_normalizada: string;
};

function scoreSimilarity(a: string, b: string): number {
  const aTokens = tokenizeNormalizedDescription(a);
  const bTokens = tokenizeNormalizedDescription(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const overlap = aTokens.filter((token) => bTokens.includes(token)).length;
  return overlap / Math.max(aTokens.length, bTokens.length);
}

export function identifyBankFromText(text: string): SupportedBank | null {
  const parser = parsers.find((candidate) => candidate.canParse(text));
  return parser?.bank ?? null;
}

export function parseStatementText(text: string, context: ParserContext): ParsedStatementItem[] {
  const parser = parsers.find((candidate) => candidate.canParse(text));
  if (!parser) {
    throw new Error('Ainda não reconhecemos o layout desta fatura. No momento suportamos Itaú e Sicoob.');
  }

  return parser.parse(text, context);
}

async function fetchSuggestionRows(userId: string, cartaoId: string): Promise<SuggestionRow[]> {
  const { data, error } = await supabase
    .from('categorias_sugeridas_cartao')
    .select('categoria, categoria_id, subcategoria_id, quantidade_uso, ultima_data_uso, recorrente, descricao_normalizada')
    .eq('usuario_id', userId)
    .eq('cartao_id', cartaoId)
    .order('quantidade_uso', { ascending: false })
    .order('ultima_data_uso', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

function chooseSuggestion(description: string, rows: SuggestionRow[]): StatementSuggestion {
  const normalized = normalizeStatementDescription(description);
  const exact = rows.find((row) => row.descricao_normalizada === normalized);
  if (exact) {
    return {
      categoria_id: exact.categoria_id,
      subcategoria_id: exact.subcategoria_id,
      categoria_nome: exact.categoria,
      confianca: 1,
      origem: 'historico_exato',
      recorrente: exact.recorrente,
    };
  }

  const bySimilarity = rows
    .map((row) => ({ row, score: scoreSimilarity(normalized, row.descricao_normalizada) }))
    .filter((entry) => entry.score >= 0.6)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.row.quantidade_uso !== a.row.quantidade_uso) return b.row.quantidade_uso - a.row.quantidade_uso;
      return (b.row.ultima_data_uso ?? '').localeCompare(a.row.ultima_data_uso ?? '');
    })[0];

  if (bySimilarity) {
    return {
      categoria_id: bySimilarity.row.categoria_id,
      subcategoria_id: bySimilarity.row.subcategoria_id,
      categoria_nome: bySimilarity.row.categoria,
      confianca: Number(bySimilarity.score.toFixed(2)),
      origem: 'historico_similar',
      recorrente: bySimilarity.row.recorrente,
    };
  }

  const byPrefix = rows.find((row) =>
    startsWithUsefulPrefix(normalized, row.descricao_normalizada) ||
    startsWithUsefulPrefix(row.descricao_normalizada, normalized)
  );
  if (byPrefix) {
    return {
      categoria_id: byPrefix.categoria_id,
      subcategoria_id: byPrefix.subcategoria_id,
      categoria_nome: byPrefix.categoria,
      confianca: 0.72,
      origem: 'historico_prefixo',
      recorrente: byPrefix.recorrente,
    };
  }

  return {
    categoria_id: null,
    subcategoria_id: null,
    categoria_nome: null,
    confianca: 0,
    origem: null,
    recorrente: false,
  };
}

export async function importInvoicePdfPreview(params: {
  userId: string;
  cartaoId: string;
  competencia: string;
  file: File;
}): Promise<{ banco: SupportedBank; textoExtraido: string; itens: ImportedInvoiceItem[] }> {
  const extracted = await extractPdfText(params.file);
  const textoExtraido = extracted.text;
  if (!textoExtraido) {
    throw new Error('Não foi possível ler o conteúdo do PDF. Verifique se o arquivo possui texto selecionável.');
  }

  const banco = identifyBankFromText(textoExtraido);
  if (!banco) {
    throw new Error('Ainda não reconhecemos o layout desta fatura. No momento suportamos Itaú e Sicoob.');
  }

  const parsedItems = parseStatementText(textoExtraido, {
    competencia: params.competencia,
    pdfLayout: extracted,
  });
  if (parsedItems.length === 0) {
    throw new Error('Nenhum lançamento válido foi encontrado nesta fatura.');
  }
  const suggestionRows = await fetchSuggestionRows(params.userId, params.cartaoId);
  const itens = parsedItems.map((item) => {
    const suggestion = chooseSuggestion(item.descricao_normalizada, suggestionRows);
    return {
      ...item,
      categoria_id: suggestion.categoria_id,
      subcategoria_id: suggestion.subcategoria_id,
      categoria_sugerida_id: suggestion.categoria_id,
      subcategoria_sugerida_id: suggestion.subcategoria_id,
      sugestao_confianca: suggestion.origem ? suggestion.confianca : null,
      sugestao_origem: suggestion.origem,
      recorrente: suggestion.recorrente,
      importado_pdf: true,
    };
  });

  return { banco, textoExtraido, itens };
}

export async function learnInvoiceCategorization(params: {
  userId: string;
  cartaoId: string;
  items: Array<{
    categoria_id: string | null;
    subcategoria_id: string | null;
    descricao: string;
    descricao_normalizada?: string | null;
    data_compra?: string | null;
  }>;
  categoriasMap: Record<string, string>;
}) {
  const payload = params.items
    .filter((item) => item.categoria_id && item.subcategoria_id)
    .map((item) => ({
      usuario_id: params.userId,
      cartao_id: params.cartaoId,
      descricao_normalizada: item.descricao_normalizada || normalizeStatementDescription(item.descricao),
      categoria: item.categoria_id ? params.categoriasMap[item.categoria_id] ?? null : null,
      categoria_id: item.categoria_id,
      subcategoria_id: item.subcategoria_id,
      quantidade_uso: 1,
      ultima_data_uso: item.data_compra ?? new Date().toISOString().slice(0, 10),
      recorrente: false,
    }))
    .filter((item) => item.descricao_normalizada);

  for (const row of payload) {
    const { data: existing } = await supabase
      .from('categorias_sugeridas_cartao')
      .select('id, quantidade_uso, ultima_data_uso')
      .eq('usuario_id', row.usuario_id)
      .eq('cartao_id', row.cartao_id)
      .eq('descricao_normalizada', row.descricao_normalizada)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('categorias_sugeridas_cartao')
        .update({
          categoria: row.categoria,
          categoria_id: row.categoria_id,
          subcategoria_id: row.subcategoria_id,
          quantidade_uso: (existing.quantidade_uso ?? 0) + 1,
          ultima_data_uso: row.ultima_data_uso,
          recorrente: (existing.quantidade_uso ?? 0) + 1 >= 3,
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('categorias_sugeridas_cartao').insert(row);
    }
  }
}
