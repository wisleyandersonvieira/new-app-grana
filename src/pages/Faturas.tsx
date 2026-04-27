import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CreditCard, Eye, Trash2, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency, formatCompetencia } from '@/lib/financial';
import { resolveInvoiceStatus } from '@/lib/invoice-status';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FaturaRow = {
  id: string; mes_ano: string; data_vencimento: string | null; valor_total: number | null;
  conta_id: string; status: string | null; data_pagamento?: string | null;
};

type DespesaFaturaRow = {
  lote_id: string | null;
  paga: boolean | null;
  data_pagamento: string | null;
};

type FaturaFilters = {
  cartaoId: string;
  competenciaInicio: string;
  competenciaFim: string;
  status: string;
};

const PAGE_SIZE = 15;

const defaultFilters: FaturaFilters = {
  cartaoId: 'all',
  competenciaInicio: '',
  competenciaFim: '',
  status: 'all',
};

const formatShortDate = (date: string | null | undefined) => {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}-${month}-${year.slice(-2)}`;
};

export default function Faturas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [faturas, setFaturas] = useState<FaturaRow[]>([]);
  const [contasMap, setContasMap] = useState<Record<string, string>>({});
  const [cartoes, setCartoes] = useState<{ id: string; nome: string }[]>([]);
  const [filters, setFilters] = useState<FaturaFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FaturaFilters>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchCartoes = async () => {
    if (!user) return;
    const { data: contas } = await supabase.from('contas').select('id, nome').eq('usuario_id', user.id).eq('tipo', 'cartao').order('nome');
    if (contas) {
      const map: Record<string, string> = {};
      contas.forEach(c => { map[c.id] = c.nome; });
      setContasMap(map);
      setCartoes(contas);
    }
  };

  const fetchFaturas = async (nextFilters = appliedFilters, page = currentPage) => {
    if (!user) return;
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('faturas_cartao')
      .select('id, mes_ano, data_vencimento, valor_total, conta_id, status', { count: 'exact' })
      .eq('usuario_id', user.id);

    if (nextFilters.cartaoId !== 'all') query = query.eq('conta_id', nextFilters.cartaoId);
    if (nextFilters.competenciaInicio) query = query.gte('mes_ano', nextFilters.competenciaInicio);
    if (nextFilters.competenciaFim) query = query.lte('mes_ano', nextFilters.competenciaFim);
    if (nextFilters.status === 'quitada') query = query.eq('status', 'quitada');
    if (nextFilters.status === 'aberta') query = query.or('status.eq.aberta,status.is.null');

    const { data: fats, count, error } = await query
      .order('mes_ano', { ascending: false })
      .order('data_vencimento', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (error) {
      toast.error('Erro ao consultar faturas.');
      setLoading(false);
      return;
    }

    const faturaIds = (fats ?? []).map((fatura) => fatura.id);
    const { data: despesasFatura } = faturaIds.length > 0
      ? await supabase
        .from('despesas')
        .select('lote_id, paga, data_pagamento')
        .eq('usuario_id', user.id)
        .in('lote_id', faturaIds)
      : { data: [] };

    const despesasPorFatura = (despesasFatura ?? []).reduce<Record<string, DespesaFaturaRow[]>>((acc, despesa: DespesaFaturaRow) => {
      if (despesa.lote_id) {
        if (!acc[despesa.lote_id]) acc[despesa.lote_id] = [];
        acc[despesa.lote_id].push(despesa);
      }
      return acc;
    }, {} as Record<string, DespesaFaturaRow[]>);

    setFaturas(
      (fats ?? []).map((fatura) => {
        const linkedExpenses = despesasPorFatura[fatura.id] ?? [];
        const paymentDate = linkedExpenses
          .filter((expense) => expense.paga || expense.data_pagamento)
          .map((expense) => expense.data_pagamento)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;

        return {
          ...fatura,
          status: resolveInvoiceStatus(fatura.status, linkedExpenses),
          data_pagamento: paymentDate,
        };
      }),
    );
    setTotalCount(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { fetchCartoes(); }, [user]);

  useEffect(() => {
    if (user) fetchFaturas(appliedFilters, currentPage);
  }, [user, currentPage]);

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setCurrentPage(1);
    fetchFaturas(filters, 1);
  };

  const handleClearFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setCurrentPage(1);
    fetchFaturas(defaultFilters, 1);
  };

  const handleDelete = async (fat: FaturaRow) => {
    if (fat.status === 'quitada') { toast.error('Fatura quitada não pode ser excluída.'); return; }
    await supabase.from('itens_fatura').delete().eq('fatura_id', fat.id);
    await supabase.from('despesas').delete().eq('lote_id', fat.id);
    const { error } = await supabase.from('faturas_cartao').delete().eq('id', fat.id);
    if (error) toast.error('Erro ao excluir fatura.');
    else { toast.success('Fatura excluída!'); fetchFaturas(appliedFilters, currentPage); }
  };

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showingFrom = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PAGE_SIZE, totalCount);
  const hasActiveFilters =
    appliedFilters.cartaoId !== 'all' ||
    appliedFilters.competenciaInicio !== '' ||
    appliedFilters.competenciaFim !== '' ||
    appliedFilters.status !== 'all';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faturas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gerencie faturas dos cartões de crédito</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/importar-fatura')} className="h-11 rounded-xl border-slate-200 bg-white px-4 shadow-sm">
            Importar PDF
          </Button>
          <Button onClick={() => navigate('/nova-fatura')} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
            <Plus className="h-4 w-4" /> Nova Fatura
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Filtros</h2>
                <p className="mt-1 text-sm text-muted-foreground">Consulte faturas por cartão, competência e situação.</p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
              {totalCount} faturas
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,0.75fr)_minmax(160px,0.75fr)_minmax(160px,0.75fr)_auto_auto] lg:items-end">
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cartão</Label>
              <Select value={filters.cartaoId} onValueChange={(value) => setFilters((current) => ({ ...current, cartaoId: value }))}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {cartoes.map((cartao) => (
                    <SelectItem key={cartao.id} value={cartao.id}>{cartao.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Competência inicial</Label>
              <Input
                type="month"
                value={filters.competenciaInicio}
                onChange={(event) => setFilters((current) => ({ ...current, competenciaInicio: event.target.value }))}
                className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Competência final</Label>
              <Input
                type="month"
                value={filters.competenciaFim}
                onChange={(event) => setFilters((current) => ({ ...current, competenciaFim: event.target.value }))}
                className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Situação</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="quitada">Quitada</SelectItem>
                  <SelectItem value="aberta">Em aberto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleApplyFilters} disabled={loading} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
              Filtrar
            </Button>
            <Button variant="outline" onClick={handleClearFilters} disabled={loading} className="h-11 rounded-xl border-slate-200 bg-white px-4 shadow-sm">
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" />
            </span>
            Faturas
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters && (
              <Badge variant="outline" className="rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
                Filtros ativos
              </Badge>
            )}
            <p className="text-sm text-muted-foreground">{showingFrom}-{showingTo} de {totalCount}</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="m-5 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Consultando faturas...
            </div>
          ) : faturas.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Nenhuma fatura encontrada para os filtros selecionados.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="px-4 py-2.5">Cartão</th>
                      <th className="px-4 py-2.5">Competência</th>
                      <th className="px-4 py-2.5">Vencimento</th>
                      <th className="px-4 py-2.5">Data de Pagamento</th>
                      <th className="px-4 py-2.5 text-right">Valor Total</th>
                      <th className="px-4 py-2.5">Situação</th>
                      <th className="px-4 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faturas.map((fat) => (
                      <tr key={fat.id} className="border-b transition hover:bg-primary/5">
                        <td className="px-4 py-2 font-medium">{contasMap[fat.conta_id] ?? '-'}</td>
                        <td className="px-4 py-2">{formatCompetencia(fat.mes_ano)}</td>
                        <td className="px-4 py-2">{formatShortDate(fat.data_vencimento)}</td>
                        <td className="px-4 py-2">{formatShortDate(fat.data_pagamento)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatCurrency(fat.valor_total ?? 0)}</td>
                        <td className="px-4 py-2">
                          {fat.status === 'quitada' ? (
                            <Badge className="h-5 rounded-full bg-success/15 px-2 text-[11px] text-success border-success/20 hover:bg-success/20">Quitada</Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 rounded-full px-2 text-[11px]">Em aberto</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" onClick={() => navigate(`/fatura/${fat.id}`)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {fat.status !== 'quitada' && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-700" onClick={() => handleDelete(fat)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Página {currentPage} de {pageCount} • {showingFrom}-{showingTo} de {totalCount}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="h-9 rounded-lg" disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 rounded-lg" disabled={currentPage >= pageCount || loading} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}>
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
