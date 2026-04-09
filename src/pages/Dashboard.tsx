import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, ChevronRight, Wallet, TrendingUp, TrendingDown, Target,
} from 'lucide-react';
import {
  formatCurrency, getCurrentCompetencia, offsetCompetencia,
  getMonthName, getCompetenciaRange,
} from '@/lib/financial';

interface TopCategory { nome: string; total: number; }
interface MetaProgress { tipo: string; categoria_nome: string | null; valor_meta: number; valor_realizado: number; }

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [competencia, setCompetencia] = useState(getCurrentCompetencia());
  const [saldoTotal, setSaldoTotal] = useState(0);
  const [receitasMes, setReceitasMes] = useState(0);
  const [despesasMes, setDespesasMes] = useState(0);
  const [topDespesas, setTopDespesas] = useState<TopCategory[]>([]);
  const [topReceitas, setTopReceitas] = useState<TopCategory[]>([]);
  const [metas, setMetas] = useState<MetaProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const [year, month] = competencia.split('-').map(Number);
  const monthName = getMonthName(month - 1);
  const { end: lastDay } = getCompetenciaRange(competencia);

  useEffect(() => { if (user) loadDashboardData(); }, [user, competencia]);

  async function loadDashboardData() {
    setLoading(true);
    const { start, end } = getCompetenciaRange(competencia);
    await Promise.all([loadSaldo(end), loadReceitasDespesas(start, end), loadTopCategories(competencia), loadMetas(competencia)]);
    setLoading(false);
  }

  async function loadSaldo(untilDate: string) {
    const { data: contas } = await supabase.from('contas').select('*').eq('tipo', 'conta').eq('bloqueada', false);
    if (!contas || contas.length === 0) { setSaldoTotal(0); return; }
    let total = 0;
    for (const conta of contas) {
      let saldo = conta.saldo_inicial || 0;
      const { data: receitas } = await supabase.from('receitas').select('valor').eq('conta_id', conta.id).eq('paga', true).lte('data_pagamento', untilDate);
      if (receitas) saldo += receitas.reduce((sum, r) => sum + r.valor, 0);
      const { data: despesas } = await supabase.from('despesas').select('valor').eq('conta_id', conta.id).eq('paga', true).lte('data_pagamento', untilDate);
      if (despesas) saldo -= despesas.reduce((sum, d) => sum + d.valor, 0);
      const { data: recebidas } = await supabase.from('transferencias').select('valor').eq('conta_destino_id', conta.id).lte('data', untilDate);
      if (recebidas) saldo += recebidas.reduce((sum, t) => sum + t.valor, 0);
      const { data: enviadas } = await supabase.from('transferencias').select('valor').eq('conta_origem_id', conta.id).lte('data', untilDate);
      if (enviadas) saldo -= enviadas.reduce((sum, t) => sum + t.valor, 0);
      total += saldo;
    }
    setSaldoTotal(total);
  }

  async function loadReceitasDespesas(start: string, end: string) {
    const { data: receitas } = await supabase.from('receitas').select('valor').eq('competencia', competencia).eq('paga', true);
    setReceitasMes(receitas?.reduce((sum, r) => sum + r.valor, 0) || 0);
    const { data: despesas } = await supabase.from('despesas').select('valor').eq('competencia', competencia).eq('paga', true);
    setDespesasMes(despesas?.reduce((sum, d) => sum + d.valor, 0) || 0);
  }

  async function loadTopCategories(comp: string) {
    const { data: despesas } = await supabase.from('despesas').select('valor, categoria_id, categorias(nome)').eq('competencia', comp);
    if (despesas) {
      const map: Record<string, { nome: string; total: number }> = {};
      despesas.forEach((d: any) => { const nome = d.categorias?.nome || 'Sem categoria'; if (!map[nome]) map[nome] = { nome, total: 0 }; map[nome].total += d.valor; });
      setTopDespesas(Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5));
    }
    const { data: receitas } = await supabase.from('receitas').select('valor, categoria_id, categorias(nome)').eq('competencia', comp);
    if (receitas) {
      const map: Record<string, { nome: string; total: number }> = {};
      receitas.forEach((r: any) => { const nome = r.categorias?.nome || 'Sem categoria'; if (!map[nome]) map[nome] = { nome, total: 0 }; map[nome].total += r.valor; });
      setTopReceitas(Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5));
    }
  }

  async function loadMetas(comp: string) {
    const { data: metasData } = await supabase.from('metas').select('*, categorias(nome)').eq('mes_ano', comp);
    if (!metasData || metasData.length === 0) { setMetas([]); return; }
    const result: MetaProgress[] = [];
    for (const meta of metasData) {
      let realizado = 0;
      if ((meta as any).tipo === 'receita') { const { data } = await supabase.from('receitas').select('valor').eq('competencia', comp).eq('paga', true); realizado = data?.reduce((s, r) => s + r.valor, 0) || 0; }
      else if ((meta as any).tipo === 'despesa') { const { data } = await supabase.from('despesas').select('valor').eq('competencia', comp).eq('paga', true); realizado = data?.reduce((s, d) => s + d.valor, 0) || 0; }
      else if ((meta as any).tipo === 'categoria' && meta.categoria_id) { const { data } = await supabase.from('despesas').select('valor').eq('competencia', comp).eq('categoria_id', meta.categoria_id).eq('paga', true); realizado = data?.reduce((s, d) => s + d.valor, 0) || 0; }
      result.push({ tipo: (meta as any).tipo, categoria_nome: (meta as any).categorias?.nome || null, valor_meta: meta.valor, valor_realizado: realizado });
    }
    setMetas(result);
  }

  const saldoColor = saldoTotal >= 0 ? 'text-success' : 'text-destructive';

  const statCards = [
    { label: 'Saldo Total', value: saldoTotal, icon: Wallet, color: saldoColor, sub: `Contas ativas até ${lastDay}` },
    { label: 'Receitas do Mês', value: receitasMes, icon: TrendingUp, color: 'text-success', sub: `Pagas em ${monthName}` },
    { label: 'Despesas do Mês', value: despesasMes, icon: TrendingDown, color: 'text-destructive', sub: `Pagas em ${monthName}` },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-0.5">
            Olá, {profile?.nome || 'Usuário'}! 👋
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border bg-card px-1.5 py-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCompetencia(offsetCompetencia(competencia, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">
            {monthName} {year}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCompetencia(offsetCompetencia(competencia, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 ${card.color}`}>
                <card.icon className="h-[18px] w-[18px]" />
              </div>
            </div>
            <div className={`text-2xl font-bold ${card.color}`}>
              {loading ? '...' : formatCurrency(card.value)}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Top categories */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { title: 'Top 5 Despesas por Categoria', data: topDespesas, icon: TrendingDown, color: 'text-destructive', iconBg: 'bg-destructive/10', empty: 'Nenhuma despesa no mês.' },
          { title: 'Top 5 Receitas por Categoria', data: topReceitas, icon: TrendingUp, color: 'text-success', iconBg: 'bg-success/10', empty: 'Nenhuma receita no mês.' },
        ].map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2.5">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${section.iconBg}`}>
                  <section.icon className={`h-4 w-4 ${section.color}`} />
                </div>
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {section.data.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{section.empty}</p>
              ) : (
                <div className="space-y-3">
                  {section.data.map((cat, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ background: `hsl(var(--${section.color === 'text-destructive' ? 'destructive' : 'success'}))`, opacity: 1 - i * 0.15 }} />
                        <span className="text-sm">{cat.nome}</span>
                      </div>
                      <span className={`text-sm font-semibold ${section.color}`}>
                        {formatCurrency(cat.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Metas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10">
              <Target className="h-4 w-4 text-warning" />
            </div>
            Metas do Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nenhuma meta definida para {monthName}/{year}.
            </p>
          ) : (
            <div className="space-y-4">
              {metas.map((meta, i) => {
                const pct = meta.valor_meta > 0 ? Math.min(100, Math.round((meta.valor_realizado / meta.valor_meta) * 100)) : 0;
                const label = meta.tipo === 'categoria' ? `Categoria: ${meta.categoria_nome}` : meta.tipo === 'receita' ? 'Meta de Receita' : 'Meta de Despesa';
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(meta.valor_realizado)} / {formatCurrency(meta.valor_meta)}
                        <span className="ml-1.5 text-xs font-semibold text-foreground">({pct}%)</span>
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
