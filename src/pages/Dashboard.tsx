import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  formatCurrency,
  getCompetenciaRange,
  getCurrentCompetencia,
  getMonthName,
  offsetCompetencia,
} from '@/lib/financial';

type EntryRow = {
  valor: number;
  conta_id?: string | null;
  data_pagamento?: string | null;
  categoria_id?: string | null;
  categorias?: { nome?: string | null } | null;
};

type TransferRow = {
  conta_origem_id: string;
  conta_destino_id: string;
  data: string;
  valor: number;
};

type ContaRow = {
  id: string;
  nome: string;
  saldo_inicial: number | null;
};

type CategoryInsight = {
  nome: string;
  total: number;
  percent: number;
  diff: number;
  diffPct: number;
};

type MetaProgress = {
  label: string;
  valorMeta: number;
  valorRealizado: number;
  pct: number;
  tone: 'success' | 'warning' | 'destructive';
};

type AlertItem = {
  tone: 'success' | 'warning' | 'info';
  title: string;
  description: string;
};

type DailyPoint = {
  day: string;
  fullDate: string;
  receitas: number;
  despesas: number;
};

type MonthlyPoint = {
  month: string;
  label: string;
  fullLabel: string;
  receitas: number;
  despesas: number;
};

type DashboardSnapshot = {
  saldoTotal: number;
  saldoAnteriorMes: number;
  receitasMes: number;
  despesasMes: number;
  receitasMesAnterior: number;
  despesasMesAnterior: number;
  resultadoMes: number;
  margemPct: number;
  topReceitas: CategoryInsight[];
  topDespesas: CategoryInsight[];
  metas: MetaProgress[];
  alerts: AlertItem[];
  dailySeries: DailyPoint[];
  monthlySeries: MonthlyPoint[];
};



const chartConfig = {
  receitas: { label: 'Receitas', color: 'hsl(var(--success))' },
  despesas: { label: 'Despesas', color: 'hsl(var(--destructive))' },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const inDateRange = (value: string | null | undefined, start: string, end: string) =>
  Boolean(value && value >= start && value <= end);

const sumValues = (rows: Array<{ valor: number }>) => rows.reduce((sum, row) => sum + row.valor, 0);

const getVariation = (current: number, previous: number) => {
  const diff = current - previous;
  if (previous === 0) {
    return { diff, pct: current === 0 ? 0 : 100 };
  }
  return { diff, pct: (diff / previous) * 100 };
};

const formatPercent = (value: number) =>
  `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

const getCategoryName = (row: EntryRow) => row.categorias?.nome?.trim() || 'Sem categoria';

const aggregateByCategory = (currentRows: EntryRow[], previousRows: EntryRow[]) => {
  const previousMap = new Map<string, number>();
  previousRows.forEach((row) => {
    const name = getCategoryName(row);
    previousMap.set(name, (previousMap.get(name) ?? 0) + row.valor);
  });

  const currentMap = new Map<string, number>();
  currentRows.forEach((row) => {
    const name = getCategoryName(row);
    currentMap.set(name, (currentMap.get(name) ?? 0) + row.valor);
  });

  const total = Array.from(currentMap.values()).reduce((sum, value) => sum + value, 0);

  return Array.from(currentMap.entries())
    .map(([nome, value]) => {
      const previous = previousMap.get(nome) ?? 0;
      const variation = getVariation(value, previous);
      return {
        nome,
        total: value,
        percent: total > 0 ? (value / total) * 100 : 0,
        diff: variation.diff,
        diffPct: variation.pct,
      };
    })
    .sort((left, right) => right.total - left.total)
    .slice(0, 5);
};

const buildDailySeries = (start: string, end: string, receitas: EntryRow[], despesas: EntryRow[]) => {
  const [year, month] = start.split('-').map(Number);
  const lastDay = Number(end.split('-')[2]);

  return Array.from({ length: lastDay }, (_, index) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
    const receitasDia = receitas
      .filter((row) => row.data_pagamento === date)
      .reduce((sum, row) => sum + row.valor, 0);
    const despesasDia = despesas
      .filter((row) => row.data_pagamento === date)
      .reduce((sum, row) => sum + row.valor, 0);

    return {
      day: String(index + 1).padStart(2, '0'),
      fullDate: date,
      receitas: receitasDia,
      despesas: despesasDia,
    };
  });
};

const buildMonthlySeries = (competencia: string, receitas: EntryRow[], despesas: EntryRow[]) => {
  return Array.from({ length: 12 }, (_, index) => {
    const month = offsetCompetencia(competencia, index - 11);
    const [year, monthNumber] = month.split('-').map(Number);
    const label = `${getMonthName(monthNumber - 1).slice(0, 3)}/${String(year).slice(-2)}`;
    const receitasMes = receitas
      .filter((row) => row.data_pagamento?.startsWith(month))
      .reduce((sum, row) => sum + row.valor, 0);
    const despesasMes = despesas
      .filter((row) => row.data_pagamento?.startsWith(month))
      .reduce((sum, row) => sum + row.valor, 0);

    return {
      month,
      label,
      fullLabel: `${getMonthName(monthNumber - 1)} ${year}`,
      receitas: receitasMes,
      despesas: despesasMes,
    };
  });
};

const buildMetas = (
  metasData: any[],
  receitasMes: number,
  despesasMes: number,
  despesasPorCategoria: CategoryInsight[],
) => {
  const categoriasMap = new Map(despesasPorCategoria.map((item) => [item.nome, item.total]));

  return metasData.map((meta) => {
    let valorRealizado = 0;
    let label = 'Meta';

    if (meta.tipo === 'receita') {
      valorRealizado = receitasMes;
      label = 'Meta de receita';
    } else if (meta.tipo === 'despesa') {
      valorRealizado = despesasMes;
      label = 'Meta de despesa';
    } else if (meta.tipo === 'categoria') {
      valorRealizado = categoriasMap.get(meta.categorias?.nome || '') ?? 0;
      label = `Categoria: ${meta.categorias?.nome || 'Sem categoria'}`;
    }

    const pct = meta.valor > 0 ? (valorRealizado / meta.valor) * 100 : 0;
    const tone = pct <= 80 ? 'success' : pct <= 100 ? 'warning' : 'destructive';

    return {
      label,
      valorMeta: meta.valor,
      valorRealizado,
      pct,
      tone,
    } as MetaProgress;
  });
};

const buildAlerts = (
  receitasMes: number,
  despesasMes: number,
  receitasMesAnterior: number,
  despesasMesAnterior: number,
  resultadoMes: number,
  margemPct: number,
  topDespesas: CategoryInsight[],
) => {
  const alerts: AlertItem[] = [];

  const receitasVariation = getVariation(receitasMes, receitasMesAnterior);
  const despesasVariation = getVariation(despesasMes, despesasMesAnterior);

  if (despesasVariation.pct >= 15) {
    alerts.push({
      tone: 'warning',
      title: 'Despesas aceleraram neste mês',
      description: `Seus gastos subiram ${formatPercent(despesasVariation.pct)} em relação ao mês anterior.`,
    });
  }

  if (receitasVariation.pct <= -10) {
    alerts.push({
      tone: 'info',
      title: 'Receitas abaixo do ritmo anterior',
      description: `Suas entradas recuaram ${formatPercent(receitasVariation.pct)} frente ao mês anterior.`,
    });
  }

  const categoriaPressao = topDespesas.find((item) => item.diffPct >= 20);
  if (categoriaPressao) {
    alerts.push({
      tone: 'warning',
      title: `${categoriaPressao.nome} puxou seus gastos para cima`,
      description: `A categoria cresceu ${formatPercent(categoriaPressao.diffPct)} e já representa ${categoriaPressao.percent.toFixed(0)}% das despesas do mês.`,
    });
  }

  const categoriaReducao = topDespesas.find((item) => item.diffPct <= -15);
  if (categoriaReducao) {
    alerts.push({
      tone: 'success',
      title: `Boa disciplina em ${categoriaReducao.nome}`,
      description: `Você reduziu ${formatPercent(Math.abs(categoriaReducao.diffPct))} nessa categoria em relação ao mês anterior.`,
    });
  }

  if (resultadoMes > 0 && margemPct >= 15) {
    alerts.push({
      tone: 'success',
      title: 'Mês com folga financeira',
      description: `Sua margem está em ${margemPct.toFixed(1)}% da renda do mês, o que dá espaço para investir ou reforçar reservas.`,
    });
  }

  if (resultadoMes < 0) {
    alerts.push({
      tone: 'warning',
      title: 'Resultado negativo no período',
      description: 'As despesas superaram as receitas. Vale revisar as categorias de maior peso para reequilibrar o mês.',
    });
  }

  return alerts.slice(0, 3);
};

function TrendBadge({
  diff,
  pct,
  positiveIsGood = true,
  label,
}: {
  diff: number;
  pct: number;
  positiveIsGood?: boolean;
  label: string;
}) {
  const isPositive = diff >= 0;
  const isGood = positiveIsGood ? isPositive : !isPositive;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
        isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {formatPercent(pct)} {label}
    </div>
  );
}

function TinySparkline({
  data,
  dataKey,
  color,
}: {
  data: DailyPoint[];
  dataKey: 'receitas' | 'despesas';
  color: string;
}) {
  return (
    <div className="h-14 w-full">
      <ChartContainer className="h-full w-full [&_.recharts-cartesian-grid_line]:stroke-transparent" config={chartConfig}>
        <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => `Dia ${payload?.[0]?.payload?.day ?? ''}`}
                formatter={(value) => (
                  <span className="font-medium">{formatCurrency(Number(value) || 0)}</span>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#spark-${dataKey})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
  accentClassName,
  trend,
  chart,
  footer,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof Wallet;
  iconClassName: string;
  accentClassName: string;
  trend?: React.ReactNode;
  chart?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`stat-card rounded-2xl p-6 ${accentClassName}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="whitespace-nowrap text-2xl font-bold tracking-tight tabular-nums">{value}</div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconClassName}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">{trend}{footer}</div>
      {chart && <div className="mt-4">{chart}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [competencia, setCompetencia] = useState(getCurrentCompetencia());
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const [year, month] = competencia.split('-').map(Number);
  const monthName = getMonthName(month - 1);
  const previousCompetencia = offsetCompetencia(competencia, -1);
  const currentRange = getCompetenciaRange(competencia);
  const previousRange = getCompetenciaRange(previousCompetencia);

  useEffect(() => {
    if (!user) return;

    let active = true;

    const loadDashboardData = async () => {
      setLoading(true);

      if (competencia === getCurrentCompetencia() && dashboardCache.has(competencia)) {
        setDashboard(dashboardCache.get(competencia) ?? null);
        setLoading(false);
        return;
      }

      const [{ data: contas }, { data: receitasPagas }, { data: despesasPagas }, { data: transferencias }, { data: metasData }] =
        await Promise.all([
          supabase
            .from('contas')
            .select('id, nome, saldo_inicial')
            .eq('usuario_id', user.id)
            .eq('tipo', 'conta')
            .eq('bloqueada', false),
          supabase
            .from('receitas')
            .select('valor, conta_id, data_pagamento, categoria_id, categorias(nome)')
            .eq('usuario_id', user.id)
            .eq('paga', true)
            .not('data_pagamento', 'is', null)
            .lte('data_pagamento', currentRange.end),
          supabase
            .from('despesas')
            .select('valor, conta_id, data_pagamento, categoria_id, categorias(nome)')
            .eq('usuario_id', user.id)
            .eq('paga', true)
            .not('data_pagamento', 'is', null)
            .lte('data_pagamento', currentRange.end),
          supabase
            .from('transferencias')
            .select('conta_origem_id, conta_destino_id, valor, data')
            .eq('usuario_id', user.id)
            .lte('data', currentRange.end),
          supabase
            .from('metas')
            .select('*, categorias(nome)')
            .eq('usuario_id', user.id)
            .eq('mes_ano', competencia),
        ]);

      if (!active) return;

      const contasAtivas = (contas ?? []) as ContaRow[];
      const receitasRows = (receitasPagas ?? []) as EntryRow[];
      const despesasRows = (despesasPagas ?? []) as EntryRow[];
      const transferRows = (transferencias ?? []) as TransferRow[];

      const receitasMesRows = receitasRows.filter((row) =>
        inDateRange(row.data_pagamento, currentRange.start, currentRange.end),
      );
      const despesasMesRows = despesasRows.filter((row) =>
        inDateRange(row.data_pagamento, currentRange.start, currentRange.end),
      );
      const receitasMesAnteriorRows = receitasRows.filter((row) =>
        inDateRange(row.data_pagamento, previousRange.start, previousRange.end),
      );
      const despesasMesAnteriorRows = despesasRows.filter((row) =>
        inDateRange(row.data_pagamento, previousRange.start, previousRange.end),
      );

      const receitasMes = sumValues(receitasMesRows);
      const despesasMes = sumValues(despesasMesRows);
      const receitasMesAnterior = sumValues(receitasMesAnteriorRows);
      const despesasMesAnterior = sumValues(despesasMesAnteriorRows);
      const resultadoMes = receitasMes - despesasMes;
      const margemPct = receitasMes > 0 ? (resultadoMes / receitasMes) * 100 : 0;

      let saldoTotal = 0;
      let saldoAnteriorMes = 0;

      contasAtivas.forEach((conta) => {
        let saldoAtualConta = conta.saldo_inicial ?? 0;
        let saldoAnteriorConta = conta.saldo_inicial ?? 0;

        receitasRows
          .filter((row) => row.conta_id === conta.id)
          .forEach((row) => {
            saldoAtualConta += row.valor;
            if (inDateRange(row.data_pagamento, '0001-01-01', previousRange.end)) {
              saldoAnteriorConta += row.valor;
            }
          });

        despesasRows
          .filter((row) => row.conta_id === conta.id)
          .forEach((row) => {
            saldoAtualConta -= row.valor;
            if (inDateRange(row.data_pagamento, '0001-01-01', previousRange.end)) {
              saldoAnteriorConta -= row.valor;
            }
          });

        transferRows.forEach((row) => {
          if (row.conta_destino_id === conta.id) {
            saldoAtualConta += row.valor;
            if (row.data <= previousRange.end) saldoAnteriorConta += row.valor;
          }
          if (row.conta_origem_id === conta.id) {
            saldoAtualConta -= row.valor;
            if (row.data <= previousRange.end) saldoAnteriorConta -= row.valor;
          }
        });

        saldoTotal += saldoAtualConta;
        saldoAnteriorMes += saldoAnteriorConta;
      });

      const topReceitas = aggregateByCategory(receitasMesRows, receitasMesAnteriorRows);
      const topDespesas = aggregateByCategory(despesasMesRows, despesasMesAnteriorRows);
      const dailySeries = buildDailySeries(currentRange.start, currentRange.end, receitasMesRows, despesasMesRows);
      const monthlySeries = buildMonthlySeries(competencia, receitasRows, despesasRows);
      const metas = buildMetas(metasData ?? [], receitasMes, despesasMes, topDespesas);
      const alerts = buildAlerts(
        receitasMes,
        despesasMes,
        receitasMesAnterior,
        despesasMesAnterior,
        resultadoMes,
        margemPct,
        topDespesas,
      );

      const snapshot: DashboardSnapshot = {
        saldoTotal,
        saldoAnteriorMes,
        receitasMes,
        despesasMes,
        receitasMesAnterior,
        despesasMesAnterior,
        resultadoMes,
        margemPct,
        topReceitas,
        topDespesas,
        metas,
        alerts,
        dailySeries,
        monthlySeries,
      };

      if (competencia === getCurrentCompetencia()) {
        dashboardCache.set(competencia, snapshot);
      }

      setDashboard(snapshot);
      setLoading(false);
    };

    loadDashboardData();

    return () => {
      active = false;
    };
  }, [competencia, user, previousRange.end, previousRange.start, currentRange.end, currentRange.start]);

  const receitasVariation = useMemo(
    () => getVariation(dashboard?.receitasMes ?? 0, dashboard?.receitasMesAnterior ?? 0),
    [dashboard],
  );
  const despesasVariation = useMemo(
    () => getVariation(dashboard?.despesasMes ?? 0, dashboard?.despesasMesAnterior ?? 0),
    [dashboard],
  );
  const saldoVariation = useMemo(
    () => (dashboard?.saldoTotal ?? 0) - (dashboard?.saldoAnteriorMes ?? 0),
    [dashboard],
  );

  const balanceProgress = useMemo(() => {
    const previous = Math.abs(dashboard?.saldoAnteriorMes ?? 0);
    const current = Math.abs(dashboard?.saldoTotal ?? 0);
    if (previous === 0) return current > 0 ? 100 : 0;
    return clamp((current / previous) * 100, 0, 100);
  }, [dashboard]);

  const resultTone =
    (dashboard?.resultadoMes ?? 0) >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50';

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="overflow-hidden rounded-[28px] border bg-[linear-gradient(135deg,hsl(var(--primary))/0.12,white_48%,hsl(var(--accent))/0.08)] p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary/70">Central Financeira</p>
              <div>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{monthName} {year}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Visão consolidada para decidir mais rápido e agir com confiança.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TrendBadge diff={receitasVariation.diff} pct={receitasVariation.pct} label="receitas" />
              <TrendBadge diff={despesasVariation.diff} pct={despesasVariation.pct} positiveIsGood={false} label="despesas" />
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex items-center gap-1 rounded-2xl border bg-white/80 p-1 shadow-sm backdrop-blur">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setCompetencia(offsetCompetencia(competencia, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[180px] px-2 text-center">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Competência</p>
                <p className="text-lg font-semibold">{monthName} {year}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setCompetencia(offsetCompetencia(competencia, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="rounded-xl px-4" onClick={() => navigate('/nova-receita')}>
                <Plus className="mr-2 h-4 w-4" /> Nova Receita
              </Button>
              <Button variant="outline" className="rounded-xl px-4" onClick={() => navigate('/nova-despesa')}>
                <Plus className="mr-2 h-4 w-4" /> Nova Despesa
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Saldo Total"
          value={loading ? '...' : formatCurrency(dashboard?.saldoTotal ?? 0)}
          subtitle={`Variacao no mes: ${loading ? '...' : formatCurrency(saldoVariation)}`}
          icon={Wallet}
          iconClassName="bg-slate-100 text-slate-700"
          accentClassName=""
          footer={
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Evolução vs mês anterior</span>
                <span>{balanceProgress.toFixed(0)}%</span>
              </div>
              <Progress value={balanceProgress} className="h-2.5 bg-slate-100" />
            </div>
          }
        />

        <KpiCard
          title="Receitas do Mês"
          value={loading ? '...' : formatCurrency(dashboard?.receitasMes ?? 0)}
          subtitle="Entradas confirmadas no período"
          icon={TrendingUp}
          iconClassName="bg-emerald-50 text-emerald-700"
          accentClassName="bg-[linear-gradient(180deg,hsl(var(--success))/0.06,white_40%)]"
          trend={<TrendBadge diff={receitasVariation.diff} pct={receitasVariation.pct} label="vs mês anterior" />}
          chart={<TinySparkline data={dashboard?.dailySeries ?? []} dataKey="receitas" color="hsl(var(--success))" />}
        />

        <KpiCard
          title="Despesas do Mês"
          value={loading ? '...' : formatCurrency(dashboard?.despesasMes ?? 0)}
          subtitle="Saídas efetivamente pagas"
          icon={TrendingDown}
          iconClassName="bg-rose-50 text-rose-700"
          accentClassName="bg-[linear-gradient(180deg,hsl(var(--destructive))/0.06,white_40%)]"
          trend={<TrendBadge diff={despesasVariation.diff} pct={despesasVariation.pct} positiveIsGood={false} label="vs mês anterior" />}
          chart={<TinySparkline data={dashboard?.dailySeries ?? []} dataKey="despesas" color="hsl(var(--destructive))" />}
        />

        <KpiCard
          title="Resultado do Mês"
          value={loading ? '...' : formatCurrency(dashboard?.resultadoMes ?? 0)}
          subtitle={
            loading
              ? '...'
              : (dashboard?.resultadoMes ?? 0) >= 0
                ? `Você economizou ${Math.max(0, dashboard?.margemPct ?? 0).toFixed(1)}% da sua renda`
                : `Seu mês consumiu ${Math.abs(dashboard?.margemPct ?? 0).toFixed(1)}% acima da margem`
          }
          icon={dashboard?.resultadoMes && dashboard.resultadoMes >= 0 ? TrendingUp : TrendingDown}
          iconClassName={(dashboard?.resultadoMes ?? 0) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}
          accentClassName=""
          footer={
            <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${resultTone}`}>
              {(dashboard?.resultadoMes ?? 0) >= 0 ? 'Lucro' : 'Prejuizo'} | Margem {(dashboard?.margemPct ?? 0).toFixed(1)}%
            </div>
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Card className="rounded-2xl border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Evolução Mensal</CardTitle>
            <p className="text-sm text-muted-foreground">Receitas e despesas pagas nos últimos 12 meses</p>
          </CardHeader>
          <CardContent>
            <ChartContainer className="h-[320px] w-full" config={chartConfig}>
              <LineChart data={dashboard?.monthlySeries ?? []} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => `R$${Number(value / 1000).toFixed(value >= 1000 ? 0 : 1)}k`} tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        return payload?.[0]?.payload?.fullLabel ?? '';
                      }}
                      formatter={(value, name) => (
                        <div className="flex min-w-[140px] items-center justify-between gap-3">
                          <span>{name}</span>
                          <span className="font-medium">{formatCurrency(Number(value) || 0)}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Line type="monotone" dataKey="receitas" stroke="var(--color-receitas)" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="despesas" stroke="var(--color-despesas)" strokeWidth={3} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Alertas Inteligentes</CardTitle>
            <p className="text-sm text-muted-foreground">Leituras automáticas do comportamento financeiro</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {(dashboard?.alerts ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
                Sem alertas relevantes neste mês. O cenário está estável.
              </div>
            ) : (
              dashboard?.alerts.map((alert, index) => (
                <div
                  key={`${alert.title}-${index}`}
                  className={`rounded-2xl border p-4 transition-transform duration-200 hover:-translate-y-0.5 ${
                    alert.tone === 'success'
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : alert.tone === 'warning'
                        ? 'border-amber-200 bg-amber-50/70'
                        : 'border-sky-200 bg-sky-50/70'
                  }`}
                >
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {[
          {
            title: 'Despesas por categoria',
            items: dashboard?.topDespesas ?? [],
            tone: 'despesa',
            empty: 'Nenhuma despesa paga no mês.',
          },
          {
            title: 'Receitas por categoria',
            items: dashboard?.topReceitas ?? [],
            tone: 'receita',
            empty: 'Nenhuma receita recebida no mês.',
          },
        ].map((section) => (
          <Card key={section.title} className="rounded-2xl border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{section.title}</CardTitle>
              <p className="text-sm text-muted-foreground">Participação e variação frente ao mês anterior</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {section.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{section.empty}</p>
              ) : (
                section.items.map((item) => {
                  const positiveIsGood = section.tone === 'receita';
                  const isGood = positiveIsGood ? item.diff >= 0 : item.diff <= 0;
                  const barColor = section.tone === 'receita' ? 'bg-emerald-500' : 'bg-rose-500';
                  return (
                    <div key={item.nome} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{item.nome}</p>
                          <p className="text-xs text-muted-foreground">{item.percent.toFixed(1)}% do total</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatCurrency(item.total)}</p>
                          <p className={`text-xs font-medium ${isGood ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatPercent(item.diffPct)}
                          </p>
                        </div>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${clamp(item.percent, 4, 100)}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Target className="h-4 w-4" />
            </div>
            Metas do mês
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {profile?.nome || 'Você'} acompanha aqui o realizado contra o planejado em {monthName}.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(dashboard?.metas ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada para {monthName}/{year}.</p>
          ) : (
            dashboard?.metas.map((meta, index) => (
              <div key={`${meta.label}-${index}`} className="rounded-2xl border bg-muted/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(meta.valorRealizado)} de {formatCurrency(meta.valorMeta)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      meta.tone === 'success'
                        ? 'bg-emerald-50 text-emerald-700'
                        : meta.tone === 'warning'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {meta.pct <= 80 ? 'OK' : meta.pct <= 100 ? 'Atencao' : 'Estourado'} | {meta.pct.toFixed(0)}%
                  </span>
                </div>
                <Progress
                  value={clamp(meta.pct, 0, 100)}
                  className={`mt-3 h-2.5 ${
                    meta.tone === 'success'
                      ? '[&>div]:bg-emerald-500'
                      : meta.tone === 'warning'
                        ? '[&>div]:bg-amber-500'
                        : '[&>div]:bg-rose-500'
                  }`}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
