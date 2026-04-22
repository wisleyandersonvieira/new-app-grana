import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Plus, Trash2, Save } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency, parseCurrencyInput, formatCompetencia } from '@/lib/financial';
import { Badge } from '@/components/ui/badge';
import { learnInvoiceCategorization } from '@/lib/fatura-import/service';
import { normalizeInstallmentText, normalizeStatementDescription } from '@/lib/fatura-import/normalization';
import { sanitizeCreditCardCategoryData } from '@/lib/credit-card-category';
import { resolveInvoiceStatus } from '@/lib/invoice-status';

type ItemFatura = {
  id?: string;
  descricao: string;
  descricao_original?: string | null;
  descricao_normalizada?: string | null;
  categoria_id: string;
  subcategoria_id: string;
  categoria_sugerida_id?: string | null;
  subcategoria_sugerida_id?: string | null;
  sugestao_origem?: string | null;
  sugestao_confianca?: number | null;
  recorrente?: boolean;
  importado_pdf?: boolean;
  parcelas: string;
  valor: string;
  data_compra?: string | null;
  banco_origem?: string | null;
  observacao_parser?: string | null;
};

type Categoria = { id: string; nome: string };
type Subcategoria = { id: string; nome: string; categoria_id: string };

function parseParcelas(parcelas: string) {
  const normalized = normalizeInstallmentText(parcelas);
  if (!normalized) return { parcela_atual: null, total_parcelas: null, parcelas: null };
  const [parcelaAtual, totalParcelas] = normalized.split('/').map(Number);
  return {
    parcela_atual: parcelaAtual,
    total_parcelas: totalParcelas,
    parcelas: normalized,
  };
}

export default function FaturaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [fatura, setFatura] = useState<any>(null);
  const [cartaoNome, setCartaoNome] = useState('');
  const [items, setItems] = useState<ItemFatura[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [faturaAnteriorTotal, setFaturaAnteriorTotal] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!user || !id) return;

    await sanitizeCreditCardCategoryData(user.id);

    const { data: fat } = await supabase.from('faturas_cartao').select('*').eq('id', id).single();
    if (!fat) {
      toast.error('Fatura não encontrada.');
      navigate('/faturas');
      return;
    }
    const [{ data: cartao }, { data: prevFats }, { data: existingItems }, { data: cats }, { data: subs }, { data: linkedExpenses }] = await Promise.all([
      supabase.from('contas').select('nome').eq('id', fat.conta_id).single(),
      supabase.from('faturas_cartao')
        .select('valor_total')
        .eq('conta_id', fat.conta_id)
        .eq('usuario_id', user.id)
        .lt('mes_ano', fat.mes_ano)
        .order('mes_ano', { ascending: false })
        .limit(1),
      supabase.from('itens_fatura').select('*').eq('fatura_id', id).order('data_compra', { ascending: true }),
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).eq('bloqueada', false).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id').eq('usuario_id', user.id).eq('bloqueada', false).order('nome'),
      supabase.from('despesas').select('paga, data_pagamento').eq('usuario_id', user.id).eq('lote_id', fat.id),
    ]);

    const statusAtual = resolveInvoiceStatus(fat.status, linkedExpenses ?? []);
    setFatura({ ...fat, status: statusAtual });
    setIsPaid(statusAtual === 'quitada');

    if (cartao) setCartaoNome(cartao.nome);
    setFaturaAnteriorTotal(prevFats && prevFats.length > 0 ? prevFats[0].valor_total : null);
    if (cats) setCategorias(cats);
    if (subs) setSubcategorias(subs);

    if (existingItems) {
      setItems(existingItems.map((it) => ({
        id: it.id,
        descricao: it.descricao ?? '',
        descricao_original: it.descricao_original,
        descricao_normalizada: it.descricao_normalizada,
        categoria_id: it.categoria_id ?? '',
        subcategoria_id: it.subcategoria_id ?? '',
        categoria_sugerida_id: it.categoria_sugerida_id,
        subcategoria_sugerida_id: it.subcategoria_sugerida_id,
        sugestao_origem: it.sugestao_origem,
        sugestao_confianca: it.sugestao_confianca,
        recorrente: it.recorrente,
        importado_pdf: it.importado_pdf,
        parcelas: it.parcelas ?? '',
        valor: it.valor ? it.valor.toFixed(2).replace('.', ',') : '',
        data_compra: it.data_compra,
        banco_origem: it.banco_origem,
        observacao_parser: it.observacao_parser,
      })));
    }
  }, [user, id, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addItem = () => {
    setItems((prev) => [...prev, {
      descricao: '',
      categoria_id: '',
      subcategoria_id: '',
      parcelas: '',
      valor: '',
      importado_pdf: false,
      recorrente: false,
    }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemFatura, value: string) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'categoria_id') updated.subcategoria_id = '';
      return updated;
    }));
  };

  const total = items.reduce((sum, item) => sum + parseCurrencyInput(item.valor), 0);
  const suggestedCount = items.filter((item) => item.sugestao_origem && item.categoria_id && item.subcategoria_id).length;
  const uncategorizedCount = items.filter((item) => !item.categoria_id || !item.subcategoria_id).length;

  const handleSave = async () => {
    if (!user || !fatura || isPaid) return;
    setLoading(true);

    const { canonicalCategoryId, canonicalSubcategoryId } = await sanitizeCreditCardCategoryData(user.id);

    await supabase.from('itens_fatura').delete().eq('fatura_id', fatura.id);

    if (items.length > 0) {
      const inserts = items.map((item) => {
        const parcelamento = parseParcelas(item.parcelas);
        const descricaoNormalizada = normalizeStatementDescription(item.descricao);
        return {
          fatura_id: fatura.id,
          usuario_id: user.id,
          descricao: item.descricao || null,
          descricao_original: item.descricao_original || item.descricao || null,
          descricao_normalizada: descricaoNormalizada || null,
          categoria_id: item.categoria_id || null,
          subcategoria_id: item.subcategoria_id || null,
          categoria_sugerida_id: item.categoria_sugerida_id || null,
          subcategoria_sugerida_id: item.subcategoria_sugerida_id || null,
          sugestao_origem: item.sugestao_origem || null,
          sugestao_confianca: item.sugestao_confianca ?? null,
          recorrente: Boolean(item.recorrente),
          importado_pdf: Boolean(item.importado_pdf),
          banco_origem: item.banco_origem || null,
          observacao_parser: item.observacao_parser || null,
          valor: parseCurrencyInput(item.valor),
          competencia: `${fatura.mes_ano}-01`,
          data: fatura.data_vencimento,
          data_compra: item.data_compra || null,
          parcelas: parcelamento.parcelas,
          parcela_atual: parcelamento.parcela_atual,
          total_parcelas: parcelamento.total_parcelas,
        };
      });

      const { error: insertErr } = await supabase.from('itens_fatura').insert(inserts);
      if (insertErr) {
        toast.error('Erro ao salvar itens.');
        setLoading(false);
        return;
      }
    }

    await supabase.from('faturas_cartao').update({ valor_total: total, status: 'aberta' }).eq('id', fatura.id);
    await supabase.from('despesas').delete().eq('lote_id', fatura.id);

    if (total > 0) {
      await supabase.from('despesas').insert({
        usuario_id: user.id,
        categoria_id: canonicalCategoryId,
        subcategoria_id: canonicalSubcategoryId,
        descricao: `Fatura ${cartaoNome} - ${formatCompetencia(fatura.mes_ano)}`,
        valor: total,
        data: fatura.data_vencimento,
        competencia: fatura.mes_ano,
        conta_id: fatura.conta_id,
        paga: false,
        lote_id: fatura.id,
      } as any);
    }

    const categoriasMap = categorias.reduce<Record<string, string>>((acc, categoria) => {
      acc[categoria.id] = categoria.nome;
      return acc;
    }, {});

    await learnInvoiceCategorization({
      userId: user.id,
      cartaoId: fatura.conta_id,
      items: items.map((item) => ({
        categoria_id: item.categoria_id || null,
        subcategoria_id: item.subcategoria_id || null,
        descricao: item.descricao,
        descricao_normalizada: normalizeStatementDescription(item.descricao),
        data_compra: item.data_compra,
      })),
      categoriasMap,
    });

    toast.success('Fatura salva com sucesso!');
    setLoading(false);
    fetchData();
  };

  if (!fatura) return <div className="p-6">Carregando...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fatura — {cartaoNome}</h1>
          <p className="text-muted-foreground">{formatCompetencia(fatura.mes_ano)} • Vencimento: {fatura.data_vencimento}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/faturas')}>Voltar</Button>
      </div>

      {isPaid && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          Esta fatura já foi paga e não pode ser editada.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {faturaAnteriorTotal != null && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fatura anterior</p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(faturaAnteriorTotal)}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sugestões aplicadas</p>
            <p className="mt-1 text-xl font-semibold">{suggestedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Itens para revisar</p>
            <p className="mt-1 text-xl font-semibold">{uncategorizedCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-accent" /> Itens da Fatura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Descrição</th>
                  <th className="py-2 px-2">Categoria</th>
                  <th className="py-2 px-2">Subcategoria</th>
                  <th className="py-2 px-2">Parcelas</th>
                  <th className="py-2 px-2">Valor</th>
                  <th className="py-2 px-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const filteredSubs = subcategorias.filter((subcategoria) => subcategoria.categoria_id === item.categoria_id);
                  const isSuggested = Boolean(item.sugestao_origem && item.categoria_sugerida_id && item.subcategoria_sugerida_id);
                  const needsReview = !item.categoria_id || !item.subcategoria_id;

                  return (
                    <tr key={idx} className={`border-b align-top ${needsReview ? 'bg-amber-50/40' : ''}`}>
                      <td className="py-2 px-2 min-w-[280px]">
                        <Input
                          value={item.descricao}
                          onChange={(e) => updateItem(idx, 'descricao', e.target.value)}
                          className="h-8"
                          disabled={isPaid}
                          placeholder="Descrição"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isSuggested && <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">Sugerido</Badge>}
                          {item.recorrente && <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">Recorrente</Badge>}
                          {item.parcelas && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Parcelado</Badge>}
                          {needsReview && <Badge variant="outline">Revisar</Badge>}
                        </div>
                        {(item.data_compra || item.banco_origem) && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {[item.data_compra ? `Compra em ${item.data_compra}` : null, item.banco_origem?.toUpperCase()].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <Select value={item.categoria_id} onValueChange={(v) => updateItem(idx, 'categoria_id', v)} disabled={isPaid}>
                          <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                          <SelectContent>
                            {categorias.map((categoria) => <SelectItem key={categoria.id} value={categoria.id}>{categoria.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Select value={item.subcategoria_id} onValueChange={(v) => updateItem(idx, 'subcategoria_id', v)} disabled={isPaid || !item.categoria_id}>
                          <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Subcategoria" /></SelectTrigger>
                          <SelectContent>
                            {filteredSubs.map((subcategoria) => <SelectItem key={subcategoria.id} value={subcategoria.id}>{subcategoria.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={item.parcelas}
                          onChange={(e) => updateItem(idx, 'parcelas', e.target.value)}
                          className="h-8 w-[100px]"
                          disabled={isPaid}
                          placeholder="1/10"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={item.valor}
                          onChange={(e) => updateItem(idx, 'valor', e.target.value)}
                          className="h-8 w-[120px]"
                          disabled={isPaid}
                          placeholder="0,00"
                        />
                      </td>
                      <td className="py-2 px-2">
                        {!isPaid && (
                          <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={4} className="py-2 px-2 text-right">Total:</td>
                  <td className="py-2 px-2">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {!isPaid && (
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={addItem}><Plus className="mr-2 h-4 w-4" /> Adicionar Item</Button>
              <Button onClick={handleSave} disabled={loading}><Save className="mr-2 h-4 w-4" /> Salvar Fatura</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
