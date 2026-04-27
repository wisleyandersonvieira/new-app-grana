import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowLeftRight, Trash2, Filter, ArrowUp, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/financial';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

type Transferencia = {
  id: string; data: string; valor: number; observacao: string | null;
  conta_origem_id: string; conta_destino_id: string;
};

type TransferFilterState = {
  dataInicio: string;
  dataFim: string;
  origem: string;
  destino: string;
};

type SortKey = 'data' | 'origem' | 'destino' | 'valor' | 'observacao';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [15, 25, 50];

const formatDisplayDate = (date: string | null) => {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}-${month}-${year}`;
};

export default function Transferencias() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [contasMap, setContasMap] = useState<Record<string, string>>({});
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [bloqueios, setBloqueios] = useState<string[]>([]);

  // Filters
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');
  const [filterOrigem, setFilterOrigem] = useState('all');
  const [filterDestino, setFilterDestino] = useState('all');
  const [appliedFilters, setAppliedFilters] = useState<TransferFilterState | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('data');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchInitialData = async () => {
    if (!user) return;
    const [{ data: contasData }, { data: bloq }] = await Promise.all([
      supabase.from('contas').select('id, nome').eq('usuario_id', user.id),
      supabase.from('bloqueios').select('mes_ano').eq('usuario_id', user.id),
    ]);
    if (contasData) {
      setContas(contasData);
      const map: Record<string, string> = {};
      contasData.forEach(c => { map[c.id] = c.nome; });
      setContasMap(map);
    }
    if (bloq) setBloqueios(bloq.map(b => b.mes_ano));
  };

  useEffect(() => { fetchInitialData(); }, [user]);

  const buildTransferQuery = (filters: TransferFilterState) => {
    let query = supabase
      .from('transferencias')
      .select('*, origem:contas!transferencias_conta_origem_id_fkey(nome), destino:contas!transferencias_conta_destino_id_fkey(nome)', { count: 'exact' })
      .eq('usuario_id', user!.id);

    if (filters.dataInicio) query = query.gte('data', filters.dataInicio);
    if (filters.dataFim) query = query.lte('data', filters.dataFim);
    if (filters.origem !== 'all') query = query.eq('conta_origem_id', filters.origem);
    if (filters.destino !== 'all') query = query.eq('conta_destino_id', filters.destino);

    const ascending = sortDirection === 'asc';
    if (sortKey === 'origem') query = query.order('nome', { ascending, foreignTable: 'origem' } as any);
    else if (sortKey === 'destino') query = query.order('nome', { ascending, foreignTable: 'destino' } as any);
    else query = query.order(sortKey, { ascending, nullsFirst: false });

    return query.order('id', { ascending: true });
  };

  const fetchTransferencias = async (filters: TransferFilterState, page = currentPage) => {
    if (!user) return;
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count, error } = await buildTransferQuery(filters).range(from, to);

    if (error) {
      toast.error('Erro ao consultar transferências.');
      setLoading(false);
      return;
    }

    setTransferencias((data ?? []) as Transferencia[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  };

  const handleApplyFilters = () => {
    const nextFilters = {
      dataInicio: filterDataInicio,
      dataFim: filterDataFim,
      origem: filterOrigem,
      destino: filterDestino,
    };
    setAppliedFilters(nextFilters);
    setCurrentPage(1);
    fetchTransferencias(nextFilters, 1);
  };

  const handleClearFilters = () => {
    setFilterDataInicio('');
    setFilterDataFim('');
    setFilterOrigem('all');
    setFilterDestino('all');
    setAppliedFilters(null);
    setTransferencias([]);
    setTotalCount(0);
    setCurrentPage(1);
  };

  const handleDelete = async (t: Transferencia) => {
    const mesAno = t.data.substring(0, 7);
    if (bloqueios.includes(mesAno)) { toast.error('Mês bloqueado — não é possível excluir.'); return; }
    const { error } = await supabase.from('transferencias').delete().eq('id', t.id);
    if (error) toast.error('Erro ao excluir.');
    else {
      toast.success('Transferência excluída!');
      if (appliedFilters) fetchTransferencias(appliedFilters, currentPage);
    }
  };

  useEffect(() => {
    if (appliedFilters) fetchTransferencias(appliedFilters, currentPage);
  }, [sortKey, sortDirection, currentPage, pageSize]);

  const total = transferencias.reduce((s, t) => s + t.valor, 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters = Boolean(appliedFilters);
  const showingFrom = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(currentPage * pageSize, totalCount);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'data' ? 'desc' : 'asc');
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUp className="h-3.5 w-3.5 opacity-25" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transferências</h1>
          <p className="text-muted-foreground">Transferências entre contas</p>
        </div>
        <Button onClick={() => navigate('/nova-transferencia')} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
          <Plus className="mr-2 h-4 w-4" /> Nova Transferência
        </Button>
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
                <p className="mt-1 text-sm text-muted-foreground">Defina os critérios e consulte apenas os registros necessários.</p>
              </div>
            </div>
            {hasActiveFilters && (
              <Badge variant="outline" className="w-fit rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
                {totalCount} encontradas
              </Badge>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(200px,1fr)_minmax(200px,1fr)_auto_auto] xl:items-end">
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Data inicial</Label>
              <Input type="date" value={filterDataInicio} onChange={(e) => setFilterDataInicio(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Data final</Label>
              <Input type="date" value={filterDataFim} onChange={(e) => setFilterDataFim(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Conta origem</Label>
              <Select value={filterOrigem} onValueChange={setFilterOrigem}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Conta destino</Label>
              <Select value={filterDestino} onValueChange={setFilterDestino}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleApplyFilters} disabled={loading} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
              Filtrar
            </Button>
            <Button variant="outline" onClick={handleClearFilters} disabled={loading && !hasActiveFilters} className="h-11 rounded-xl border-slate-200 bg-white px-4 shadow-sm">
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ArrowLeftRight className="h-5 w-5" />
            </span>
            Transferências
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters && (
              <Badge variant="outline" className="rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
                Filtros aplicados
              </Badge>
            )}
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters ? `${showingFrom}-${showingTo} de ${totalCount}` : 'Aguardando consulta'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!hasActiveFilters ? (
            <div className="m-5 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Use os filtros acima e clique em Filtrar para visualizar as transferências.
            </div>
          ) : loading ? (
            <div className="m-5 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Consultando transferências...
            </div>
          ) : transferencias.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Nenhuma transferência encontrada para os filtros selecionados.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="px-4 py-2.5">
                        <button type="button" onClick={() => toggleSort('data')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                          Data
                          <SortIcon column="data" />
                        </button>
                      </th>
                      <th className="px-4 py-2.5">
                        <button type="button" onClick={() => toggleSort('origem')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                          Origem
                          <SortIcon column="origem" />
                        </button>
                      </th>
                      <th className="px-4 py-2.5">
                        <button type="button" onClick={() => toggleSort('destino')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                          Destino
                          <SortIcon column="destino" />
                        </button>
                      </th>
                      <th className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => toggleSort('valor')} className="ml-auto inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                          Valor
                          <SortIcon column="valor" />
                        </button>
                      </th>
                      <th className="px-4 py-2.5">
                        <button type="button" onClick={() => toggleSort('observacao')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                          Observação
                          <SortIcon column="observacao" />
                        </button>
                      </th>
                      <th className="px-4 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferencias.map(t => (
                      <tr key={t.id} className="border-b transition hover:bg-primary/5">
                        <td className="px-4 py-2">{formatDisplayDate(t.data)}</td>
                        <td className="px-4 py-2 font-medium">{contasMap[t.conta_origem_id] ?? '-'}</td>
                        <td className="px-4 py-2">{contasMap[t.conta_destino_id] ?? '-'}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(t.valor)}</td>
                        <td className="max-w-[280px] truncate px-4 py-2 text-muted-foreground">{t.observacao ?? '-'}</td>
                        <td className="px-4 py-2 text-right">
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-700" onClick={() => handleDelete(t)}><Trash2 className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-slate-50/60 font-semibold">
                      <td colSpan={3} className="px-4 py-2 text-right">Total da página:</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(total)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Página {currentPage} de {pageCount}</span>
                  <span>•</span>
                  <span>{showingFrom}-{showingTo} de {totalCount}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(1); }}>
                    <SelectTrigger className="h-9 w-[120px] rounded-lg border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={String(option)}>{option} / página</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
