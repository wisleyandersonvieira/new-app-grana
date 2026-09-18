import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { method: string; args: unknown[] };

const supabaseState = vi.hoisted(() => ({
  rowsByTable: {} as Record<string, unknown[]>,
  callsByTable: {} as Record<string, QueryCall[]>,
}));

vi.mock('@/integrations/supabase/client', () => {
  type QueryBuilder = {
    select: (...args: unknown[]) => QueryBuilder;
    eq: (...args: unknown[]) => QueryBuilder;
    lte: (...args: unknown[]) => QueryBuilder;
    in: (...args: unknown[]) => QueryBuilder;
    range: (from: number, to: number) => Promise<{ data: unknown[]; error: null }>;
  };

  const createBuilder = (table: string): QueryBuilder => {
    const push = (call: QueryCall) => {
      supabaseState.callsByTable[table] = [...(supabaseState.callsByTable[table] ?? []), call];
    };
    const record = (method: string) => (...args: unknown[]) => {
      push({ method, args });
      return builder;
    };
    const builder: QueryBuilder = {
      select: record('select'),
      eq: record('eq'),
      lte: record('lte'),
      in: record('in'),
      range: (from, to) => {
        push({ method: 'range', args: [from, to] });
        const rows = supabaseState.rowsByTable[table] ?? [];
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
    };
    return builder;
  };

  return { supabase: { from: (table: string) => createBuilder(table) } };
});

const { calcularSaldosComMovimentos, fetchMovimentosContas, getTodayIsoDate } = await import('@/lib/saldo-contas');
import type { ContaBase, MovimentosContas } from '@/lib/saldo-contas';

const conta = (overrides: Partial<ContaBase> = {}): ContaBase => ({
  id: 'conta-1',
  nome: 'Banco',
  tipo: 'conta',
  saldo_inicial: 100,
  data_saldo_inicial: '2026-01-01',
  ...overrides,
});

const movimentos = (overrides: Partial<MovimentosContas> = {}): MovimentosContas => ({
  receitas: [],
  despesas: [],
  transferencias: [],
  lancamentosCartao: [],
  ...overrides,
});

const filtrosDe = (table: string) => (supabaseState.callsByTable[table] ?? [])
  .filter((call) => call.method !== 'range')
  .map((call) => `${call.method}(${call.args.map((arg) => JSON.stringify(arg)).join(', ')})`);

describe('calcularSaldosComMovimentos', () => {
  it('soma receita paga da conta', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      receitas: [{ conta_id: 'conta-1', valor: 250.5, data_pagamento: '2026-03-10' }],
    }));

    expect(resultado.saldo).toBe(350.5);
    expect(resultado.ultimaMovimentacao).toBe('2026-03-10');
  });

  it('subtrai despesa paga da conta', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      despesas: [{ conta_id: 'conta-1', valor: 40, data_pagamento: '2026-03-11' }],
    }));

    expect(resultado.saldo).toBe(60);
    expect(resultado.ultimaMovimentacao).toBe('2026-03-11');
  });

  it('soma transferência de entrada', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      transferencias: [{ conta_origem_id: 'conta-2', conta_destino_id: 'conta-1', valor: 70, data: '2026-03-12' }],
    }));

    expect(resultado.saldo).toBe(170);
    expect(resultado.ultimaMovimentacao).toBe('2026-03-12');
  });

  it('subtrai transferência de saída', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      transferencias: [{ conta_origem_id: 'conta-1', conta_destino_id: 'conta-2', valor: 70, data: '2026-03-12' }],
    }));

    expect(resultado.saldo).toBe(30);
    expect(resultado.ultimaMovimentacao).toBe('2026-03-12');
  });

  it('transferência entre a mesma conta não muda o saldo', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      transferencias: [{ conta_origem_id: 'conta-1', conta_destino_id: 'conta-1', valor: 70, data: '2026-03-12' }],
    }));

    expect(resultado.saldo).toBe(100);
  });

  it('ignora movimentos de outras contas e sem conta', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      receitas: [
        { conta_id: 'conta-2', valor: 999, data_pagamento: '2026-06-01' },
        { conta_id: null, valor: 999, data_pagamento: '2026-06-02' },
      ],
      despesas: [{ conta_id: 'conta-2', valor: 999, data_pagamento: '2026-06-03' }],
      transferencias: [{ conta_origem_id: 'conta-2', conta_destino_id: 'conta-3', valor: 999, data: '2026-06-04' }],
    }));

    expect(resultado.saldo).toBe(100);
    expect(resultado.ultimaMovimentacao).toBeNull();
  });

  it('trata saldo inicial ausente como zero e sem movimento devolve saldo inicial', () => {
    const [semSaldo] = calcularSaldosComMovimentos([conta({ saldo_inicial: null })], movimentos());
    expect(semSaldo.saldo).toBe(0);
    expect(semSaldo.saldo_inicial).toBe(0);
    expect(semSaldo.ultimaMovimentacao).toBeNull();

    const [comSaldo] = calcularSaldosComMovimentos([conta()], movimentos());
    expect(comSaldo.saldo).toBe(100);
  });

  it('última movimentação é a data mais recente entre todas as fontes', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      receitas: [{ conta_id: 'conta-1', valor: 10, data_pagamento: '2026-02-05' }],
      despesas: [{ conta_id: 'conta-1', valor: 10, data_pagamento: '2026-04-20' }],
      transferencias: [{ conta_origem_id: 'conta-1', conta_destino_id: null, valor: 10, data: '2026-03-15' }],
    }));

    expect(resultado.ultimaMovimentacao).toBe('2026-04-20');
  });

  it('ignora datas nulas na última movimentação', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      receitas: [{ conta_id: 'conta-1', valor: 10, data_pagamento: null }],
      despesas: [{ conta_id: 'conta-1', valor: 5, data_pagamento: '2026-01-31' }],
    }));

    expect(resultado.saldo).toBe(105);
    expect(resultado.ultimaMovimentacao).toBe('2026-01-31');
  });

  it('cartão considera lançamentos do cartão só na data, não no saldo', () => {
    const cartao = conta({ id: 'cartao-1', nome: 'Cartão', tipo: 'cartao', saldo_inicial: 0 });
    const [resultado] = calcularSaldosComMovimentos([cartao], movimentos({
      despesas: [{ conta_id: 'cartao-1', valor: 30, data_pagamento: '2026-03-01' }],
      lancamentosCartao: [
        { conta_id: 'cartao-1', data: '2026-05-09' },
        { conta_id: 'cartao-1', data: '2026-04-02' },
      ],
    }));

    expect(resultado.saldo).toBe(-30);
    expect(resultado.ultimaMovimentacao).toBe('2026-05-09');
  });

  it('conta comum ignora lançamentos de cartão', () => {
    const [resultado] = calcularSaldosComMovimentos([conta()], movimentos({
      lancamentosCartao: [{ conta_id: 'conta-1', data: '2026-09-09' }],
    }));

    expect(resultado.ultimaMovimentacao).toBeNull();
  });

  it('calcula todas as contas recebidas de uma vez', () => {
    const resultado = calcularSaldosComMovimentos(
      [conta(), conta({ id: 'conta-2', nome: 'Carteira', saldo_inicial: 0 })],
      movimentos({
        receitas: [{ conta_id: 'conta-2', valor: 15, data_pagamento: '2026-03-03' }],
        despesas: [{ conta_id: 'conta-1', valor: 25, data_pagamento: '2026-03-04' }],
      }),
    );

    expect(resultado.map((item) => [item.id, item.saldo])).toEqual([['conta-1', 75], ['conta-2', 15]]);
  });
});

describe('fetchMovimentosContas', () => {
  beforeEach(() => {
    supabaseState.rowsByTable = {};
    supabaseState.callsByTable = {};
  });

  it('só considera lançamentos pagos até a data de referência', async () => {
    supabaseState.rowsByTable = {
      receitas: [{ conta_id: 'conta-1', valor: 10, data_pagamento: '2026-03-01' }],
      despesas: [{ conta_id: 'conta-1', valor: 4, data_pagamento: '2026-03-02' }],
      transferencias: [],
    };

    const resultado = await fetchMovimentosContas('user-1', '2026-03-31', [conta()]);

    expect(filtrosDe('receitas')).toEqual([
      'select("conta_id, valor, data_pagamento")',
      'eq("usuario_id", "user-1")',
      'eq("paga", true)',
      'lte("data_pagamento", "2026-03-31")',
    ]);
    expect(filtrosDe('despesas')).toEqual([
      'select("conta_id, valor, data_pagamento")',
      'eq("usuario_id", "user-1")',
      'eq("paga", true)',
      'lte("data_pagamento", "2026-03-31")',
    ]);
    expect(filtrosDe('transferencias')).toEqual([
      'select("conta_origem_id, conta_destino_id, valor, data")',
      'eq("usuario_id", "user-1")',
      'lte("data", "2026-03-31")',
    ]);
    expect(resultado.receitas).toHaveLength(1);
    expect(resultado.lancamentosCartao).toEqual([]);
  });

  it('não busca dados de cartão quando não há cartão', async () => {
    await fetchMovimentosContas('user-1', '2026-03-31', [conta()]);

    expect(supabaseState.callsByTable.faturas_cartao).toBeUndefined();
    expect(supabaseState.callsByTable.itens_fatura).toBeUndefined();
  });

  it('reúne despesas do cartão e compras dos itens da fatura, respeitando a data de referência', async () => {
    supabaseState.rowsByTable = {
      despesas: [{ conta_id: 'cartao-1', data: '2026-03-20' }],
      faturas_cartao: [{ id: 'fatura-1', conta_id: 'cartao-1' }, { id: 'fatura-outra', conta_id: null }],
      itens_fatura: [
        { fatura_id: 'fatura-1', data_compra: '2026-03-18', data: '2026-03-25' },
        { fatura_id: 'fatura-1', data_compra: null, data: '2026-03-19' },
        { fatura_id: 'fatura-1', data_compra: '2026-04-05', data: null },
        { fatura_id: 'fatura-desconhecida', data_compra: '2026-03-10', data: null },
      ],
    };

    const cartao = conta({ id: 'cartao-1', tipo: 'cartao' });
    const resultado = await fetchMovimentosContas('user-1', '2026-03-31', [cartao]);

    // data_compra quando existe, senão a data do item; nada depois da data de referência
    // e nada de faturas que não são do cartão.
    expect(resultado.lancamentosCartao).toEqual([
      { conta_id: 'cartao-1', data: '2026-03-20' },
      { conta_id: 'cartao-1', data: '2026-03-18' },
      { conta_id: 'cartao-1', data: '2026-03-19' },
    ]);
    expect(filtrosDe('faturas_cartao')).toEqual([
      'select("id, conta_id")',
      'eq("usuario_id", "user-1")',
      'in("conta_id", ["cartao-1"])',
    ]);
  });
});

describe('getTodayIsoDate', () => {
  it('devolve a data no formato YYYY-MM-DD', () => {
    expect(getTodayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
