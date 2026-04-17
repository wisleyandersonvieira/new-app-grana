import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getCurrentCompetencia, getMonthName } from '@/lib/financial';
import { isCreditCardCategoryName } from '@/lib/credit-card-category';

type CatRow = { nome: string; total: number };

export default function RelatorioPorCategoria() {
  const { user } = useAuth();
  const [comp, setComp] = useState(getCurrentCompetencia());
  const [rows, setRows] = useState<CatRow[]>([]);

  const mes = comp.split('-')[1];
  const ano = comp.split('-')[0];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);
  const generate = async () => {
    if (!user) return;
    // Fetch despesas (excluding "Cartão de Crédito") + itens_fatura for the competencia
    // itens_fatura.competencia is a DATE, so we use range matching for the month
    const compStart = `${comp}-01`;
    const compEnd = `${comp}-31`;
    const [{ data: despesas }, { data: itensFatura }, { data: categorias }] = await Promise.all([
      supabase.from('despesas').select('categoria_id, valor').eq('usuario_id', user.id).eq('competencia', comp),
      supabase
        .from('itens_fatura')
        .select('categoria_id, valor, competencia, faturas_cartao(mes_ano)')
        .eq('usuario_id', user.id)
        .gte('competencia', compStart)
        .lte('competencia', compEnd),
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id),
    ]);

    const catMap: Record<string, string> = {};
    categorias?.forEach(c => { catMap[c.id] = c.nome; });
    const cartaoCatIds = new Set(
      (categorias ?? [])
        .filter(c => isCreditCardCategoryName(c.nome))
        .map(c => c.id),
    );

    const totals: Record<string, number> = {};
    despesas?.forEach(d => {
      if (d.categoria_id && cartaoCatIds.has(d.categoria_id)) return; // exclude
      const nome = d.categoria_id ? (catMap[d.categoria_id] ?? 'Sem categoria') : 'Sem categoria';
      totals[nome] = (totals[nome] ?? 0) + d.valor;
    });
    itensFatura?.forEach(it => {
      // Skip if item is somehow categorized as the credit card umbrella category
      if (it.categoria_id && cartaoCatIds.has(it.categoria_id)) return;
      const nome = it.categoria_id ? (catMap[it.categoria_id] ?? 'Sem categoria') : 'Sem categoria';
      totals[nome] = (totals[nome] ?? 0) + it.valor;
    });

    const result = Object.entries(totals).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
    setRows(result);
  };

  useEffect(() => { generate(); }, [user, comp]);

  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Relatório por Categoria</h1>
        <p className="text-muted-foreground">Gastos agrupados por categoria</p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Mês</label>
              <Select value={mes} onValueChange={(v) => setComp(`${ano}-${v}`)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1).padStart(2, '0')}>{getMonthName(i)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Select value={ano} onValueChange={(v) => setComp(`${v}-${mes}`)}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5 text-accent" /> Resultado</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? <p className="text-muted-foreground text-sm">Sem dados para o período.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="py-2 px-3">Categoria</th><th className="py-2 px-3 text-right">Total</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.nome} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3">{r.nome}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold"><td className="py-2 px-3">Total Geral</td><td className="py-2 px-3 text-right">{formatCurrency(total)}</td></tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
