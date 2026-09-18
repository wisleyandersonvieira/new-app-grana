export type Classificacao = 'receita' | 'despesa' | 'ambos';

/** Tipo da tela de lançamento que consome a classificação. */
export type TipoLancamento = 'receita' | 'despesa';

export const CLASSIFICACAO_PADRAO: Classificacao = 'ambos';

export const CLASSIFICACAO_LABELS: Record<Classificacao, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  ambos: 'Ambos',
};

export const CLASSIFICACAO_OPTIONS: Array<{ value: Classificacao; label: string }> = [
  { value: 'receita', label: CLASSIFICACAO_LABELS.receita },
  { value: 'despesa', label: CLASSIFICACAO_LABELS.despesa },
  { value: 'ambos', label: CLASSIFICACAO_LABELS.ambos },
];

/** Valores desconhecidos ou ausentes são tratados como 'ambos' (comportamento anterior à classificação). */
export function normalizeClassificacao(value: string | null | undefined): Classificacao {
  return value === 'receita' || value === 'despesa' || value === 'ambos' ? value : CLASSIFICACAO_PADRAO;
}

export function getClassificacaoLabel(value: string | null | undefined): string {
  return CLASSIFICACAO_LABELS[normalizeClassificacao(value)];
}

/** Uma opção aparece na tela quando a classificação é igual ao tipo da tela ou é 'ambos'. */
export function isVisivelPara(classificacao: string | null | undefined, tipo: TipoLancamento): boolean {
  const normalized = normalizeClassificacao(classificacao);
  return normalized === tipo || normalized === 'ambos';
}
