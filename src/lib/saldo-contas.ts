import { supabase } from '@/integrations/supabase/client';

export type ContaBase = {
  id: string;
  nome: string;
  tipo: string;
  saldo_inicial: number | null;
  data_saldo_inicial: string | null;
};

export type MovimentoLancamento = { conta_id: string | null; valor: number; data_pagamento: string | null };
export type MovimentoTransferencia = {
  conta_origem_id: string | null;
  conta_destino_id: string | null;
  valor: number;
  data: string | null;
};
/** Lançamentos de cartão: contam apenas como data de movimentação, não no saldo. */
export type MovimentoCartao = { conta_id: string | null; data: string | null };

export type MovimentosContas = {
  receitas: MovimentoLancamento[];
  despesas: MovimentoLancamento[];
  transferencias: MovimentoTransferencia[];
  lancamentosCartao: MovimentoCartao[];
};

export type SaldoConta = {
  id: string;
  nome: string;
  tipo: string;
  saldo_inicial: number;
  data_saldo_inicial: string | null;
  saldo: number;
  ultimaMovimentacao: string | null;
};

const PAGE_SIZE = 1000;

export function getTodayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

/** Consulta que aceita paginação por `range`, como os builders do Supabase. */
type RangeQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

/** Busca paginada: o PostgREST devolve no máximo 1000 linhas por requisição. */
export async function fetchAllPaginated<T>(builder: () => RangeQuery<T>): Promise<T[]> {
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await builder().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/**
 * Uma consulta por tabela para todas as contas de uma vez.
 * Saldo: receitas e despesas pagas até a data de referência, mais transferências.
 * Última movimentação: as mesmas datas e, para cartões, a data de lançamento
 * das despesas do cartão e da compra dos itens das faturas dele.
 */
export async function fetchMovimentosContas(
  userId: string,
  dataRef: string,
  contas: ContaBase[],
): Promise<MovimentosContas> {
  const [receitas, despesas, transferencias] = await Promise.all([
    fetchAllPaginated<MovimentoLancamento>(() =>
      supabase.from('receitas').select('conta_id, valor, data_pagamento').eq('usuario_id', userId).eq('paga', true).lte('data_pagamento', dataRef),
    ),
    fetchAllPaginated<MovimentoLancamento>(() =>
      supabase.from('despesas').select('conta_id, valor, data_pagamento').eq('usuario_id', userId).eq('paga', true).lte('data_pagamento', dataRef),
    ),
    fetchAllPaginated<MovimentoTransferencia>(() =>
      supabase.from('transferencias').select('conta_origem_id, conta_destino_id, valor, data').eq('usuario_id', userId).lte('data', dataRef),
    ),
  ]);

  const cartaoIds = contas.filter((conta) => conta.tipo === 'cartao').map((conta) => conta.id);
  const lancamentosCartao: MovimentoCartao[] = [];

  if (cartaoIds.length > 0) {
    const [despesasCartao, faturas] = await Promise.all([
      fetchAllPaginated<MovimentoCartao>(() =>
        supabase.from('despesas').select('conta_id, data').eq('usuario_id', userId).in('conta_id', cartaoIds).lte('data', dataRef),
      ),
      fetchAllPaginated<{ id: string; conta_id: string | null }>(() =>
        supabase.from('faturas_cartao').select('id, conta_id').eq('usuario_id', userId).in('conta_id', cartaoIds),
      ),
    ]);

    lancamentosCartao.push(...despesasCartao);

    if (faturas.length > 0) {
      const contaPorFatura = new Map(faturas.map((fatura) => [fatura.id, fatura.conta_id]));
      const itens = await fetchAllPaginated<{ fatura_id: string; data_compra: string | null; data: string | null }>(() =>
        supabase.from('itens_fatura').select('fatura_id, data_compra, data').eq('usuario_id', userId),
      );

      itens.forEach((item) => {
        const contaId = contaPorFatura.get(item.fatura_id);
        if (!contaId) return;
        const data = item.data_compra ?? item.data;
        if (!data || data > dataRef) return;
        lancamentosCartao.push({ conta_id: contaId, data });
      });
    }
  }

  return { receitas, despesas, transferencias, lancamentosCartao };
}

/** Cálculo puro: mesma ordem de operações do relatório Saldo de Contas. */
export function calcularSaldosComMovimentos(contas: ContaBase[], movimentos: MovimentosContas): SaldoConta[] {
  return contas.map((conta) => {
    let saldo = conta.saldo_inicial ?? 0;
    let ultimaMovimentacao: string | null = null;

    const registrarData = (data: string | null | undefined) => {
      if (!data) return;
      if (!ultimaMovimentacao || data > ultimaMovimentacao) ultimaMovimentacao = data;
    };

    movimentos.receitas.forEach((receita) => {
      if (receita.conta_id !== conta.id) return;
      saldo += receita.valor;
      registrarData(receita.data_pagamento);
    });

    movimentos.despesas.forEach((despesa) => {
      if (despesa.conta_id !== conta.id) return;
      saldo -= despesa.valor;
      registrarData(despesa.data_pagamento);
    });

    movimentos.transferencias.forEach((transferencia) => {
      if (transferencia.conta_destino_id === conta.id) {
        saldo += transferencia.valor;
        registrarData(transferencia.data);
      }
      if (transferencia.conta_origem_id === conta.id) {
        saldo -= transferencia.valor;
        registrarData(transferencia.data);
      }
    });

    if (conta.tipo === 'cartao') {
      movimentos.lancamentosCartao.forEach((lancamento) => {
        if (lancamento.conta_id !== conta.id) return;
        registrarData(lancamento.data);
      });
    }

    return {
      id: conta.id,
      nome: conta.nome,
      tipo: conta.tipo,
      saldo_inicial: conta.saldo_inicial ?? 0,
      data_saldo_inicial: conta.data_saldo_inicial,
      saldo,
      ultimaMovimentacao,
    };
  });
}

export async function calcularSaldosContas(
  userId: string,
  dataRef: string,
  contas: ContaBase[],
): Promise<SaldoConta[]> {
  const movimentos = await fetchMovimentosContas(userId, dataRef, contas);
  return calcularSaldosComMovimentos(contas, movimentos);
}
