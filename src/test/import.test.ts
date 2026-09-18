import { describe, expect, it } from 'vitest';
import {
  parseImportedCompetencia,
  parseImportedDate,
  parseTransactionImportRows,
  validateTransactionImportRows,
} from '@/lib/import';

describe('import helpers', () => {
  it('converte datas em formatos comuns', () => {
    expect(parseImportedDate('2026-04-09')).toBe('2026-04-09');
    expect(parseImportedDate('09/04/2026')).toBe('2026-04-09');
    expect(parseImportedDate(46021)).toBe('2025-12-30');
  });

  it('converte competencia em formatos comuns', () => {
    expect(parseImportedCompetencia('2026-04')).toBe('2026-04');
    expect(parseImportedCompetencia('04/2026')).toBe('2026-04');
  });

  it('parseia e valida linhas de importacao', () => {
    const parsed = parseTransactionImportRows([
      {
        Data: '09/04/2026',
        Valor: '1.234,56',
        Categoria: 'Salário',
        Subcategoria: 'Fixo',
        Conta: 'Banco',
        Descricao: 'Abril',
        Competencia: '04/2026',
        Paga: 'sim',
      },
    ]);

    const validated = validateTransactionImportRows(
      parsed.rows,
      [{ id: 'cat-1', nome: 'Salário' }],
      [{ id: 'sub-1', nome: 'Fixo', categoria_id: 'cat-1' }],
      [{ id: 'conta-1', nome: 'Banco' }],
    );

    expect(parsed.errors).toEqual([]);
    expect(validated.errors).toEqual([]);
    expect(validated.rows[0]).toMatchObject({
      data: '2026-04-09',
      valor: 1234.56,
      categoriaId: 'cat-1',
      subcategoriaId: 'sub-1',
      contaId: 'conta-1',
      competencia: '2026-04',
      paga: true,
    });
  });

  it('recusa linha com categoria ou subcategoria incompativel com o tipo da importacao', () => {
    const parsed = parseTransactionImportRows([
      { Data: '09/04/2026', Valor: '100,00', Categoria: 'Mercado', Conta: 'Banco' },
      { Data: '10/04/2026', Valor: '200,00', Categoria: 'Receitas', Subcategoria: 'Taxas', Conta: 'Banco' },
    ]);

    const validated = validateTransactionImportRows(
      parsed.rows,
      [
        { id: 'cat-1', nome: 'Mercado', classificacao: 'despesa' },
        { id: 'cat-2', nome: 'Receitas', classificacao: 'ambos' },
      ],
      [{ id: 'sub-1', nome: 'Taxas', categoria_id: 'cat-2', classificacao: 'despesa' }],
      [{ id: 'conta-1', nome: 'Banco' }],
      'receita',
    );

    expect(validated.rows).toEqual([]);
    expect(validated.errors).toEqual([
      'Linha 2: categoria "Mercado" não está disponível para receitas.',
      'Linha 3: subcategoria "Taxas" não está disponível para receitas.',
    ]);
  });

  it('mantem linha quando a classificacao e compativel ou "ambos"', () => {
    const parsed = parseTransactionImportRows([
      { Data: '09/04/2026', Valor: '100,00', Categoria: 'Mercado', Subcategoria: 'Feira', Conta: 'Banco' },
    ]);

    const validated = validateTransactionImportRows(
      parsed.rows,
      [{ id: 'cat-1', nome: 'Mercado', classificacao: 'despesa' }],
      [{ id: 'sub-1', nome: 'Feira', categoria_id: 'cat-1', classificacao: 'ambos' }],
      [{ id: 'conta-1', nome: 'Banco' }],
      'despesa',
    );

    expect(validated.errors).toEqual([]);
    expect(validated.rows).toHaveLength(1);
  });
});
