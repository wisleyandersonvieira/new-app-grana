import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Target, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getCurrentCompetencia, getMonthName } from '@/lib/financial';
import { Badge } from '@/components/ui/badge';
import { isCreditCardCategoryName } from '@/lib/credit-card-category';

type MetaNatureza = 'receita' | 'despesa';
type MetaView = {
  id: string;
  tipo: string;
  natureza: MetaNatureza;
  categoria: string;
  valor: number;
  realizado: number;
  percent: number;
  diff: number;
  title: string;
  status: string;
  statusClassName: string;
  progressClassName: string;
  detail: string;
  priority: number;
};

const getMetaNatureza = (meta: { tipo?: string | null; natureza?: MetaNatureza | null }): MetaNatureza =>
  meta.natureza ?? (meta.tipo === 'receita' ? 'receita' : 'despesa');

const getPerformance = (natureza: MetaNatureza, percent: number, diff: number) => {
  if (natureza === 'receita') {
    if (percent >= 100) {
      return {
        status: 'Atingida',
        statusClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        progressClassName: '[&>div]:bg-emerald-500',
        detail: `Superou a meta em ${formatCurrency(Math.max(0, diff))}.`,
        priority: 3,
      };
    }
    if (percent >= 60) {
      return {
        status: 'Em andamento',
        statusClassName: 'border-amber-200 bg-amber-50 text-amber-700',
        progressClassName: '[&>div]:bg-amber-500',
        detail: `Faltam ${formatCurrency(Math.abs(diff))} para atingir a meta.`,
        priority: 2,
      };
    }
    return {
      status: 'Abaixo do esperado',
      statusClassName: 'border-rose-200 bg-rose-50 text-rose-700',
      progressClassName: '[&>div]:bg-rose-500',
      detail: `Faltam ${formatCurrency(Math.abs(diff))} para atingir a meta.`,
      priority: 1,
    };
  }

  if (percent > 100) {
    return {
      status: 'Acima do orçamento',
      statusClassName: 'border-rose-200 bg-rose-50 text-rose-700',
      progressClassName: '[&>div]:bg-rose-500',
      detail: `Está ${formatCurrency(diff)} acima do orçamento.`,
      priority: 1,
    };
  }
  if (percent >= 85) {
    return {
      status: 'No limite',
      statusClassName: 'border-amber-200 bg-amber-50 text-amber-700',
      progressClassName: '[&>div]:bg-amber-500',
      detail: `Ainda restam ${formatCurrency(Math.abs(diff))} do orçamento.`,
      priority: 2,
    };
  }
  return {
    status: 'Dentro do orçamento',
    statusClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    progressClassName: '[&>div]:bg-emerald-500',
    detail: `Ainda restam ${formatCurrency(Math.abs(diff))} do orçamento.`,
    priority: 3,
  };
};

export default function Metas() {
  const { user } = useAuth();
  const [comp, setComp] = useState(getCurrentCompetencia());
  const [metasReceita, setMetasReceita] = useState<MetaView[]>([]);
  const [orcamentos, setOrcamentos] = useState<MetaView[]>([]);

  const mes = comp.split('-')[1];
  const ano = comp.split('-')[0];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);

  useEffect(() => {
    if (!user) return;
    const fetchMetas = async () => {
      const compStart = `${comp}-01`;
      const compEnd = `${comp}-31`;
      const [{ data: metas }, { data: categorias }, { data: receitas }, { data: despesas }, { data: itensFatura }] = await Promise.all([
        supabase.from('metas').select('*').eq('usuario_id', user.id).eq('mes_ano', comp),
        supabase.from('categorias').select('id, nome').eq('usuario_id', user.id),
        supabase.from('receitas').select('valor, paga, categoria_id').eq('usuario_id', user.id).eq('competencia', comp).eq('paga', true),
        supabase.from('despesas').select('valor, paga, categoria_id').eq('usuario_id', user.id).eq('competencia', comp).eq('paga', true),
        supabase.from('itens_fatura').select('valor, categoria_id').eq('usuario_id', user.id).gte('competencia', compStart).lte('competencia', compEnd),
      ]);

      const catMap: Record<string, string> = {};
      categorias?.forEach(c => { catMap[c.id] = c.nome; });
      const cartaoCatIds = new Set(
        (categorias ?? [])
          .filter(c => isCreditCardCategoryName(c.nome))
          .map(c => c.id),
      );

      const totalReceitas = receitas?.reduce((sum, receita) => sum + receita.valor, 0) ?? 0;
      const totalDespesas = despesas?.reduce((sum, despesa) => sum + despesa.valor, 0) ?? 0;

      const receitasCategoria: Record<string, number> = {};
      receitas?.forEach(receita => {
        if (receita.categoria_id) receitasCategoria[receita.categoria_id] = (receitasCategoria[receita.categoria_id] ?? 0) + receita.valor;
      });

      const despesasCategoria: Record<string, number> = {};
      despesas?.forEach(despesa => {
        if (despesa.categoria_id && cartaoCatIds.has(despesa.categoria_id)) return;
        if (despesa.categoria_id) despesasCategoria[despesa.categoria_id] = (despesasCategoria[despesa.categoria_id] ?? 0) + despesa.valor;
      });
      itensFatura?.forEach(item => {
        if (item.categoria_id && cartaoCatIds.has(item.categoria_id)) return;
        if (item.categoria_id) despesasCategoria[item.categoria_id] = (despesasCategoria[item.categoria_id] ?? 0) + item.valor;
      });

      const receitaViews: MetaView[] = [];
      const orcamentoViews: MetaView[] = [];

      metas?.forEach((meta: any) => {
        const natureza = getMetaNatureza(meta);
        let realizado = 0;
        let title = natureza === 'receita' ? 'Meta de receita' : 'Orçamento de despesas';

        if (meta.tipo === 'receita') realizado = totalReceitas;
        else if (meta.tipo === 'despesa') realizado = totalDespesas;
        else if (meta.tipo === 'categoria' && meta.categoria_id) {
          realizado = natureza === 'receita'
            ? receitasCategoria[meta.categoria_id] ?? 0
            : despesasCategoria[meta.categoria_id] ?? 0;
          const categoryName = catMap[meta.categoria_id] ?? 'categoria';
          title = natureza === 'receita' ? `Meta de ${categoryName}` : `Orçamento de ${categoryName}`;
        }

        const rawPercent = meta.valor > 0 ? (realizado / meta.valor) * 100 : 0;
        const diff = natureza === 'receita' ? realizado - meta.valor : realizado - meta.valor;
        const performance = getPerformance(natureza, rawPercent, diff);
        const view: MetaView = {
          id: meta.id,
          tipo: meta.tipo,
          natureza,
          categoria: meta.categoria_id ? catMap[meta.categoria_id] ?? '' : '',
          valor: meta.valor,
          realizado,
          percent: Math.min(rawPercent, 100),
          diff,
          title,
          ...performance,
        };

        if (natureza === 'receita') receitaViews.push(view);
        else orcamentoViews.push(view);
      });

      receitaViews.sort((a, b) => a.priority - b.priority || b.percent - a.percent);
      orcamentoViews.sort((a, b) => a.priority - b.priority || b.percent - a.percent);
      setMetasReceita(receitaViews);
      setOrcamentos(orcamentoViews);
    };
    fetchMetas();
  }, [user, comp]);

  const summary = useMemo(() => {
    const receitasAtingidas = metasReceita.filter(meta => meta.realizado >= meta.valor).length;
    const orcamentosEstourados = orcamentos.filter(meta => meta.realizado > meta.valor).length;
    const orcamentosDentro = orcamentos.filter(meta => meta.realizado <= meta.valor).length;
    return { receitasAtingidas, orcamentosEstourados, orcamentosDentro };
  }, [metasReceita, orcamentos]);

  const MetaCard = ({ meta }: { meta: MetaView }) => (
    <div className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{meta.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{meta.detail}</p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${meta.statusClassName}`}>{meta.status}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Realizado</p>
          <p className="font-semibold">{formatCurrency(meta.realizado)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{meta.natureza === 'receita' ? 'Meta' : 'Orçamento'}</p>
          <p className="font-semibold">{formatCurrency(meta.valor)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Progresso</p>
          <p className="font-semibold">{(meta.valor > 0 ? (meta.realizado / meta.valor) * 100 : 0).toFixed(0)}%</p>
        </div>
      </div>

      <Progress value={meta.percent} className={`mt-4 h-2.5 ${meta.progressClassName}`} />
    </div>
  );

  const Section = ({ title, icon, metas }: { title: string; icon: React.ReactNode; metas: MetaView[] }) => (
    metas.length > 0 ? (
      <Card className="rounded-2xl border-slate-200/80 shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2">{icon} {title}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {metas.map(meta => <MetaCard key={meta.id} meta={meta} />)}
          </div>
        </CardContent>
      </Card>
    ) : null
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Acompanhar Metas</h1>
        <p className="text-muted-foreground">Veja o progresso das metas de receita e dos orçamentos de despesa.</p>
      </div>

      <Card className="rounded-2xl border-slate-200/80 shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Mês</label>
              <Select value={mes} onValueChange={(value) => setComp(`${ano}-${value}`)}>
                <SelectTrigger className="w-[150px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1).padStart(2, '0')}>{getMonthName(i)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Select value={ano} onValueChange={(value) => setComp(`${value}-${mes}`)}>
                <SelectTrigger className="w-[110px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Metas de receita', value: metasReceita.length, icon: TrendingUp, className: 'text-emerald-700 bg-emerald-50' },
          { label: 'Receitas atingidas', value: summary.receitasAtingidas, icon: CheckCircle2, className: 'text-emerald-700 bg-emerald-50' },
          { label: 'Orçamentos', value: orcamentos.length, icon: Target, className: 'text-amber-700 bg-amber-50' },
          { label: 'Dentro do limite', value: summary.orcamentosDentro, icon: CheckCircle2, className: 'text-emerald-700 bg-emerald-50' },
          { label: 'Estourados', value: summary.orcamentosEstourados, icon: AlertTriangle, className: 'text-rose-700 bg-rose-50' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="rounded-2xl border-slate-200/80 shadow-sm">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold">{item.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.className}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Section title="Metas de Receita" icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} metas={metasReceita} />
      <Section title="Orçamentos de Despesa" icon={<TrendingDown className="h-5 w-5 text-amber-600" />} metas={orcamentos} />

      {metasReceita.length === 0 && orcamentos.length === 0 && (
        <Card className="rounded-2xl"><CardContent className="py-6"><p className="text-muted-foreground text-sm text-center">Nenhuma meta ou orçamento cadastrado para este mês.</p></CardContent></Card>
      )}
    </div>
  );
}
