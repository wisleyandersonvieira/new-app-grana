import { parseCurrencyInput } from '@/lib/financial';
import { isVisivelPara, type Classificacao, type TipoLancamento } from '@/lib/classificacao';

export interface ImportReferenceItem {
  id: string;
  nome: string;
  classificacao?: Classificacao;
}

export interface ImportSubcategoryItem extends ImportReferenceItem {
  categoria_id: string;
}

export interface ParsedTransactionImportRow {
  rowNumber: number;
  data: string;
  valor: number;
  descricao: string | null;
  competencia: string | null;
  paga: boolean;
  dataPagamento: string | null;
  categoriaNome: string;
  subcategoriaNome: string | null;
  contaNome: string;
}

export interface ValidatedTransactionImportRow extends ParsedTransactionImportRow {
  categoriaId: string;
  subcategoriaId: string | null;
  contaId: string;
}

const HEADER_ALIASES: Record<string, string[]> = {
  data: ['data', 'vencimento', 'data vencimento'],
  valor: ['valor', 'valor r$', 'valor rs'],
  descricao: ['descricao', 'descrição', 'historico', 'histórico', 'observacao', 'observação'],
  competencia: ['competencia', 'competência', 'mes ano', 'mês ano'],
  paga: ['paga', 'pago', 'status', 'quitada', 'recebida'],
  dataPagamento: ['data pagamento', 'pagamento', 'recebimento', 'data recebimento'],
  categoriaNome: ['categoria'],
  subcategoriaNome: ['subcategoria', 'sub categoria'],
  contaNome: ['conta', 'carteira'],
};

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function excelSerialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000).toISOString().slice(0, 10);
}

export function parseImportedDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return excelSerialToDate(value);
  }

  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

export function parseImportedCompetencia(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const br = raw.match(/^(\d{2})\/(\d{4})$/);
  if (br) return `${br[2]}-${br[1]}`;

  return null;
}

function parseImportedBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;

  const normalized = normalizeHeader(value);
  return ['sim', 'true', '1', 'paga', 'pago', 'recebida', 'recebido', 'quitada', 'quitado'].includes(normalized);
}

function resolveField(rawRow: Record<string, unknown>, field: keyof typeof HEADER_ALIASES): unknown {
  const entries = Object.entries(rawRow);
  for (const [header, value] of entries) {
    if (HEADER_ALIASES[field].includes(normalizeHeader(header))) {
      return value;
    }
  }
  return undefined;
}

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function parseTransactionImportRows(rawRows: Record<string, unknown>[]): { rows: ParsedTransactionImportRow[]; errors: string[] } {
  const parsedRows: ParsedTransactionImportRow[] = [];
  const errors: string[] = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const categoriaNome = toTrimmedString(resolveField(rawRow, 'categoriaNome'));
    const contaNome = toTrimmedString(resolveField(rawRow, 'contaNome'));
    const data = parseImportedDate(resolveField(rawRow, 'data'));
    const dataPagamento = parseImportedDate(resolveField(rawRow, 'dataPagamento'));
    const competencia = parseImportedCompetencia(resolveField(rawRow, 'competencia'));
    const valorBruto = resolveField(rawRow, 'valor');
    const valor = typeof valorBruto === 'number' ? valorBruto : parseCurrencyInput(toTrimmedString(valorBruto));
    const paga = parseImportedBoolean(resolveField(rawRow, 'paga'));
    const descricao = toTrimmedString(resolveField(rawRow, 'descricao')) || null;
    const subcategoriaNome = toTrimmedString(resolveField(rawRow, 'subcategoriaNome')) || null;

    if (!categoriaNome) errors.push(`Linha ${rowNumber}: categoria é obrigatória.`);
    if (!contaNome) errors.push(`Linha ${rowNumber}: conta é obrigatória.`);
    if (!data) errors.push(`Linha ${rowNumber}: data inválida. Use YYYY-MM-DD ou DD/MM/YYYY.`);
    if (!(valor > 0)) errors.push(`Linha ${rowNumber}: valor inválido.`);
    if (resolveField(rawRow, 'competencia') !== undefined && !competencia) {
      errors.push(`Linha ${rowNumber}: competência inválida. Use YYYY-MM ou MM/YYYY.`);
    }
    if (resolveField(rawRow, 'dataPagamento') !== undefined && toTrimmedString(resolveField(rawRow, 'dataPagamento')) && !dataPagamento) {
      errors.push(`Linha ${rowNumber}: data de pagamento inválida.`);
    }

    if (!categoriaNome || !contaNome || !data || !(valor > 0)) return;

    parsedRows.push({
      rowNumber,
      data,
      valor,
      descricao,
      competencia,
      paga,
      dataPagamento,
      categoriaNome,
      subcategoriaNome,
      contaNome,
    });
  });

  return { rows: parsedRows, errors };
}

function describeTipo(tipo: TipoLancamento) {
  return tipo === 'receita' ? 'receitas' : 'despesas';
}

export function validateTransactionImportRows(
  rows: ParsedTransactionImportRow[],
  categories: ImportReferenceItem[],
  subcategories: ImportSubcategoryItem[],
  accounts: ImportReferenceItem[],
  tipo?: TipoLancamento,
): { rows: ValidatedTransactionImportRow[]; errors: string[] } {
  const categoryMap = new Map(categories.map((item) => [normalizeHeader(item.nome), item]));
  const accountMap = new Map(accounts.map((item) => [normalizeHeader(item.nome), item]));
  const subcategoryMap = new Map(
    subcategories.map((item) => [`${item.categoria_id}:${normalizeHeader(item.nome)}`, item]),
  );

  const validatedRows: ValidatedTransactionImportRow[] = [];
  const errors: string[] = [];

  rows.forEach((row) => {
    const category = categoryMap.get(normalizeHeader(row.categoriaNome));
    if (!category) {
      errors.push(`Linha ${row.rowNumber}: categoria "${row.categoriaNome}" não encontrada.`);
      return;
    }

    if (tipo && !isVisivelPara(category.classificacao, tipo)) {
      errors.push(`Linha ${row.rowNumber}: categoria "${row.categoriaNome}" não está disponível para ${describeTipo(tipo)}.`);
      return;
    }

    const account = accountMap.get(normalizeHeader(row.contaNome));
    if (!account) {
      errors.push(`Linha ${row.rowNumber}: conta "${row.contaNome}" não encontrada.`);
      return;
    }

    let subcategoryId: string | null = null;
    if (row.subcategoriaNome) {
      const key = `${category.id}:${normalizeHeader(row.subcategoriaNome)}`;
      const subcategory = subcategoryMap.get(key);
      if (!subcategory) {
        errors.push(`Linha ${row.rowNumber}: subcategoria "${row.subcategoriaNome}" não encontrada na categoria "${row.categoriaNome}".`);
        return;
      }
      if (tipo && !isVisivelPara(subcategory.classificacao, tipo)) {
        errors.push(`Linha ${row.rowNumber}: subcategoria "${row.subcategoriaNome}" não está disponível para ${describeTipo(tipo)}.`);
        return;
      }
      subcategoryId = subcategory.id;
    }

    validatedRows.push({
      ...row,
      categoriaId: category.id,
      subcategoriaId: subcategoryId,
      contaId: account.id,
    });
  });

  return { rows: validatedRows, errors };
}
