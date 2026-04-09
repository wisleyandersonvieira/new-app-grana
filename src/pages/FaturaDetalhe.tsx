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

type ItemFatura = {
  id?: string;
  descricao: string;
  categoria_id: string;
  subcategoria_id: string;
  valor: string; // stored as string for editing
};

type Categoria = { id: string; nome: string };
type Subcategoria = { id: string; nome: string; categoria_id: string };

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
    // Fetch fatura
    const { data: fat } = await supabase.from('faturas_cartao').select('*').eq('id', id).single();
    if (!fat) { toast.error('Fatura não encontrada.'); navigate('/faturas'); return; }
    setFatura(fat);

    // Check if paid (consolidated despesa with lote_id = fatura id, paga = true)
    const { data: despConsolidada } = await supabase.from('despesas').select('paga').eq('lote_id', id).maybeSingle();
    setIsPaid(despConsolidada?.paga === true);

    // Fetch cartão name
    const { data: cartao } = await supabase.from('contas').select('nome').eq('id', fat.cartao_id).single();
    if (cartao) setCartaoNome(cartao.nome);

    // Fetch previous fatura total
    const { data: prevFats } = await supabase.from('faturas_cartao')
      .select('valor_total')
      .eq('cartao_id', fat.cartao_id)
      .eq('usuario_id', user.id)
      .lt('competencia', fat.competencia)
      .order('competencia', { ascending: false })
      .limit(1);
    setFaturaAnteriorTotal(prevFats && prevFats.length > 0 ? prevFats[0].valor_total : null);

    // Fetch items
    const { data: existingItems } = await supabase.from('itens_fatura').select('*').eq('fatura_id', id);
    if (existingItems && existingItems.length > 0) {
      setItems(existingItems.map(it => ({
        id: it.id,
        descricao: it.descricao ?? '',
        categoria_id: it.categoria_id ?? '',
        subcategoria_id: it.subcategoria_id ?? '',
        valor: it.valor ? it.valor.toFixed(2).replace('.', ',') : '',
      })));
    }

    // Fetch categorias and subcategorias
    const [{ data: cats }, { data: subs }] = await Promise.all([
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).eq('bloqueada', false).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id').eq('usuario_id', user.id).eq('bloqueada', false).order('nome'),
    ]);
    if (cats) setCategorias(cats);
    if (subs) setSubcategorias(subs);
  }, [user, id, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addItem = () => {
    setItems(prev => [...prev, { descricao: '', categoria_id: '', subcategoria_id: '', valor: '' }]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemFatura, value: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'categoria_id') updated.subcategoria_id = '';
      return updated;
    }));
  };

  const total = items.reduce((sum, item) => sum + parseCurrencyInput(item.valor), 0);

  const handleSave = async () => {
    if (!user || !fatura || isPaid) return;
    setLoading(true);

    // 1. Delete old items
    await supabase.from('itens_fatura').delete().eq('fatura_id', fatura.id);

    // 2. Insert new items
    if (items.length > 0) {
      const inserts = items.map(item => ({
        fatura_id: fatura.id,
        usuario_id: user.id,
        descricao: item.descricao || null,
        categoria_id: item.categoria_id || null,
        subcategoria_id: item.subcategoria_id || null,
        valor: parseCurrencyInput(item.valor),
        competencia: fatura.competencia,
        data: fatura.vencimento,
      }));
      const { error: insertErr } = await supabase.from('itens_fatura').insert(inserts);
      if (insertErr) { toast.error('Erro ao salvar itens.'); setLoading(false); return; }
    }

    // 3. Update fatura valor_total
    await supabase.from('faturas_cartao').update({ valor_total: total }).eq('id', fatura.id);

    // 4. Delete old consolidated despesa
    await supabase.from('despesas').delete().eq('lote_id', fatura.id);

    // 5. Ensure "Cartão De Crédito" category and "Fatura Consolidada" subcategory exist
    let catId: string | null = null;
    let subId: string | null = null;

    const { data: catData } = await supabase.from('categorias').select('id').eq('nome', 'Cartão De Crédito').eq('usuario_id', user.id).maybeSingle();
    if (catData) {
      catId = catData.id;
    } else {
      const { data: newCat } = await supabase.from('categorias').insert({ nome: 'Cartão De Crédito', usuario_id: user.id, obrigatoria: true }).select('id').single();
      if (newCat) catId = newCat.id;
    }

    if (catId) {
      const { data: subData } = await supabase.from('subcategorias').select('id').eq('nome', 'Fatura Consolidada').eq('categoria_id', catId).eq('usuario_id', user.id).maybeSingle();
      if (subData) {
        subId = subData.id;
      } else {
        const { data: newSub } = await supabase.from('subcategorias').insert({ nome: 'Fatura Consolidada', categoria_id: catId, usuario_id: user.id, obrigatoria: true }).select('id').single();
        if (newSub) subId = newSub.id;
      }
    }

    // 6. Create new consolidated despesa
    if (total > 0) {
      await supabase.from('despesas').insert({
        usuario_id: user.id,
        categoria_id: catId,
        subcategoria_id: subId,
        descricao: `Fatura ${cartaoNome} - ${formatCompetencia(fatura.competencia)}`,
        valor: total,
        data: fatura.vencimento,
        competencia: fatura.competencia,
        conta_id: fatura.cartao_id,
        paga: false,
        lote_id: fatura.id,
      });
    }

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
          <p className="text-muted-foreground">{formatCompetencia(fatura.competencia)} • Vencimento: {fatura.vencimento}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/faturas')}>Voltar</Button>
      </div>

      {isPaid && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          Esta fatura já foi paga e não pode ser editada.
        </div>
      )}

      {faturaAnteriorTotal != null && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-muted-foreground">Total fatura anterior: <span className="font-semibold text-foreground">{formatCurrency(faturaAnteriorTotal)}</span></p>
          </CardContent>
        </Card>
      )}

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
                  <th className="py-2 px-2">Valor (R$)</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const filteredSubs = subcategorias.filter(s => s.categoria_id === item.categoria_id);
                  return (
                    <tr key={idx} className="border-b">
                      <td className="py-2 px-2">
                        <Input value={item.descricao} onChange={(e) => updateItem(idx, 'descricao', e.target.value)} className="h-8" disabled={isPaid} placeholder="Descrição" />
                      </td>
                      <td className="py-2 px-2">
                        <Select value={item.categoria_id} onValueChange={(v) => updateItem(idx, 'categoria_id', v)} disabled={isPaid}>
                          <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                          <SelectContent>
                            {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Select value={item.subcategoria_id} onValueChange={(v) => updateItem(idx, 'subcategoria_id', v)} disabled={isPaid || !item.categoria_id}>
                          <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Subcategoria" /></SelectTrigger>
                          <SelectContent>
                            {filteredSubs.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Input value={item.valor} onChange={(e) => updateItem(idx, 'valor', e.target.value)} className="h-8 w-[120px]" disabled={isPaid} placeholder="0,00" />
                      </td>
                      <td className="py-2 px-2">
                        {!isPaid && <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4" /></Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={3} className="py-2 px-2 text-right">Total:</td>
                  <td className="py-2 px-2">{formatCurrency(total)}</td>
                  <td></td>
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
