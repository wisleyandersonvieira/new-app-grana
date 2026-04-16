import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Target, TrendingUp, TrendingDown, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getCurrentCompetencia, getMonthName } from '@/lib/financial';
import { Badge } from '@/components/ui/badge';

type MetaView = { id: string; tipo: string; categoria: string; valor: number; realizado: number; percent: number };

export default function Metas() {
  const { user } = useAuth();
  const [comp, setComp] = useState(getCurrentCompetencia());
  const [metasReceita, setMetasReceita] = useState<MetaView[]>([]);
  const [metasDespesa, setMetasDespesa] = useState<MetaView[]>([]);
  const [metasCategoria, setMetasCategoria] = useState<MetaView[]>([]);

  const mes = comp.split('-')[1];
  const ano = comp.split('-')[0];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);
  const normalizeLabel = (value: string | null | undefined) =>
    (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  useEffect(() => {
    if (!user) return;
    const fetchMetas = async () => {
      const [{ data: metas }, { data: categorias }, { data: receitas }, { data: despesas }, { data: itensFatura }] = await Promise.all([
        supabase.from('metas').select('*').eq('usuario_id', user.id).eq('mes_ano', comp),
        supabase.from('categorias').select('id, nome').eq('usuario_id', user.id),
        supabase.from('receitas').select('valor, paga').eq('usuario_id', user.id).eq('competencia', comp).eq('paga', true),
        supabase.from('despesas').select('valor, paga, categoria_id').eq('usuario_id', user.id).eq('competencia', comp).eq('paga', true),
        supabase.from('itens_fatura').select('valor, categoria_id').eq('usuario_id', user.id).eq('competencia', comp),
      ]);

      const catMap: Record<string, string> = {};
      categorias?.forEach(c => { catMap[c.id] = c.nome; });
      const cartaoCatIds = new Set(
        (categorias ?? [])
          .filter(c => normalizeLabel(c.nome) === 'cartao de credito')
          .map(c => c.id),
      );

      const totalReceitas = receitas?.reduce((s, r) => s + r.valor, 0) ?? 0;
      const totalDespesas = (despesas?.reduce((s, d) => s + d.valor, 0) ?? 0);

      // Category totals: despesas (excl cartão) + itens_fatura
      const catTotals: Record<string, number> = {};
      despesas?.forEach(d => {
        if (d.categoria_id && cartaoCatIds.has(d.categoria_id)) return;
        if (d.categoria_id) catTotals[d.categoria_id] = (catTotals[d.categoria_id] ?? 0) + d.valor;
      });
      itensFatura?.forEach(it => {
        if (it.categoria_id) catTotals[it.categoria_id] = (catTotals[it.categoria_id] ?? 0) + it.valor;
      });

      const rec: MetaView[] = [];
      const desp: MetaView[] = [];
      const cat: MetaView[] = [];

      metas?.forEach((m: any) => {
        let realizado = 0;
        if (m.tipo === 'receita') realizado = totalReceitas;
        else if (m.tipo === 'despesa') realizado = totalDespesas;
        else if (m.tipo === 'categoria' && m.categoria_id) realizado = catTotals[m.categoria_id] ?? 0;

        const percent = m.valor > 0 ? Math.min((realizado / m.valor) * 100, 100) : 0;
        const view: MetaView = {
          id: m.id, tipo: m.tipo,
          categoria: m.categoria_id ? catMap[m.categoria_id] ?? '' : '',
          valor: m.valor, realizado, percent,
        };

        if (m.tipo === 'receita') rec.push(view);
        else if (m.tipo === 'despesa') desp.push(view);
        else cat.push(view);
      });

      setMetasReceita(rec);
      setMetasDespesa(desp);
      setMetasCategoria(cat);
    };
    fetchMetas();
  }, [user, comp]);

  const MetaCard = ({ meta, color }: { meta: MetaView; color: string }) => {
    const atingida = meta.percent >= 100;
    return (
      <div className="border rounded-lg p-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="font-medium text-sm">{meta.categoria || meta.tipo}</span>
          <Badge variant={atingida ? 'default' : 'outline'} className="text-xs">
            {atingida ? 'Atingida' : `${meta.percent.toFixed(0)}%`}
          </Badge>
        </div>
        <Progress value={meta.percent} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Realizado: {formatCurrency(meta.realizado)}</span>
          <span>Meta: {formatCurrency(meta.valor)}</span>
        </div>
      </div>
    );
  };

  const Section = ({ title, icon, metas, color }: { title: string; icon: React.ReactNode; metas: MetaView[]; color: string }) => (
    metas.length > 0 ? (
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2">{icon} {title}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metas.map(m => <MetaCard key={m.id} meta={m} color={color} />)}
          </div>
        </CardContent>
      </Card>
    ) : null
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Acompanhar Metas</h1>
        <p className="text-muted-foreground">Veja o progresso das suas metas</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Mês</label>
              <Select value={mes} onValueChange={(v) => setComp(`${ano}-${v}`)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1).padStart(2, '0')}>{getMonthName(i)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Select value={ano} onValueChange={(v) => setComp(`${v}-${mes}`)}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Section title="Metas de Receita" icon={<TrendingUp className="h-5 w-5 text-green-500" />} metas={metasReceita} color="green" />
      <Section title="Metas de Despesa" icon={<TrendingDown className="h-5 w-5 text-red-500" />} metas={metasDespesa} color="red" />
      <Section title="Metas por Categoria" icon={<Tag className="h-5 w-5 text-accent" />} metas={metasCategoria} color="blue" />

      {metasReceita.length === 0 && metasDespesa.length === 0 && metasCategoria.length === 0 && (
        <Card><CardContent className="py-6"><p className="text-muted-foreground text-sm text-center">Nenhuma meta cadastrada para este mês.</p></CardContent></Card>
      )}
    </div>
  );
}
