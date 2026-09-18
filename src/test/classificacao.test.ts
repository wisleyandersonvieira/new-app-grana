import { describe, expect, it } from 'vitest';
import {
  CLASSIFICACAO_LABELS,
  CLASSIFICACAO_OPTIONS,
  CLASSIFICACAO_PADRAO,
  getClassificacaoLabel,
  isVisivelPara,
  normalizeClassificacao,
} from '@/lib/classificacao';

describe('classificacao', () => {
  it('usa "ambos" como padrão', () => {
    expect(CLASSIFICACAO_PADRAO).toBe('ambos');
  });

  it('expõe labels em português', () => {
    expect(CLASSIFICACAO_LABELS).toEqual({ receita: 'Receita', despesa: 'Despesa', ambos: 'Ambos' });
  });

  it('expõe as opções dos selects na ordem receita, despesa e ambos', () => {
    expect(CLASSIFICACAO_OPTIONS).toEqual([
      { value: 'receita', label: 'Receita' },
      { value: 'despesa', label: 'Despesa' },
      { value: 'ambos', label: 'Ambos' },
    ]);
  });

  it('normaliza valores ausentes ou desconhecidos para "ambos"', () => {
    expect(normalizeClassificacao('receita')).toBe('receita');
    expect(normalizeClassificacao('despesa')).toBe('despesa');
    expect(normalizeClassificacao('ambos')).toBe('ambos');
    expect(normalizeClassificacao(null)).toBe('ambos');
    expect(normalizeClassificacao(undefined)).toBe('ambos');
    expect(normalizeClassificacao('')).toBe('ambos');
    expect(normalizeClassificacao('outro')).toBe('ambos');
  });

  it('mostra a opção quando a classificação é igual ao tipo da tela', () => {
    expect(isVisivelPara('receita', 'receita')).toBe(true);
    expect(isVisivelPara('despesa', 'despesa')).toBe(true);
  });

  it('esconde a opção quando a classificação é do tipo oposto', () => {
    expect(isVisivelPara('receita', 'despesa')).toBe(false);
    expect(isVisivelPara('despesa', 'receita')).toBe(false);
  });

  it('mostra "ambos" nas duas telas', () => {
    expect(isVisivelPara('ambos', 'receita')).toBe(true);
    expect(isVisivelPara('ambos', 'despesa')).toBe(true);
  });

  it('trata classificação ausente como "ambos" (registros anteriores à migration)', () => {
    expect(isVisivelPara(null, 'receita')).toBe(true);
    expect(isVisivelPara(undefined, 'despesa')).toBe(true);
  });

  it('retorna o label da classificação', () => {
    expect(getClassificacaoLabel('receita')).toBe('Receita');
    expect(getClassificacaoLabel('despesa')).toBe('Despesa');
    expect(getClassificacaoLabel(null)).toBe('Ambos');
  });
});
