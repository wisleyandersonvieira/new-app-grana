import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { formatCurrency } from '@/lib/financial';
import { formatCompactCompetencia, formatDisplayDate, formatInstallmentDisplay } from '@/lib/listing-format';
import { PayModal } from '@/components/PayModal';
import { ImportTransactionsDialog } from '@/components/ImportTransactionsDialog';
import type { Classificacao } from '@/lib/classificacao';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarIcon,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  FilterX,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  XCircle,
} from 'lucide-react';

interface DespesaRow {
  id: string;
  data: string;
  categoria_nome: string;
  subcategoria_nome: string;
  descricao: string | null;
  parcela: number | null;
  total_parcelas: number | null;
  conta_nome: string;
  competencia: string | null;
  valor: number;
  data_pagamento: string | null;
  created_at: string | null;
  paga: boolean | null;
  conta_id: string | null;
  categoria_id: string | null;
  subcategoria_id: string | null;
  lote_id: string | null;
  is_cartao: boolean;
}

type SortField = 'data' | 'categoria_nome' | 'subcategoria_nome' | 'descricao' | 'parcela' | 'competencia' | 'valor' | 'data_pagamento';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 15;

type FilterState = {
  categoria: string;
  subcategoria: string;
  situacao: string;
  descricao: string;
  compInicioMes: string;
  compInicioAno: string;
  compFimMes: string;
  compFimAno: string;
  vencimentoInicio?: Date;
  vencimentoFim?: Date;
  pagamentoInicio?: Date;
  pagamentoFim?: Date;
};

const defaultFilters: FilterState = {
  categoria: 'all',
  subcategoria: 'all',
  situacao: 'all',
  descricao: '',
  compInicioMes: '',
  compInicioAno: '',
  compFimMes: '',
  compFimAno: '',
  vencimentoInicio: undefined,
  vencimentoFim: undefined,
  pagamentoInicio: undefined,
  pagamentoFim: undefined,
};

function DateFilter({
  value,
  onChange,
  placeholder,
}: {
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
  placeholder: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-10 w-full justify-start text-left font-normal', !value && 'text-muted-foreground')}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, 'dd/MM/yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );
}

export default function Despesas() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [despesas, setDespesas] = useState<DespesaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draftFilters, setDraftFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [sortField, setSortField] = useState<SortField>('data');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [categorias, setCategorias] = useState<{ id: string; nome: string; classificacao: Classificacao }[]>([]);
  const [subcategorias, setSubcategorias] = useState<{ id: string; nome: string; categoria_id: string; classificacao: Classificacao }[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [bloqueios, setBloqueios] = useState<{ tipo: string; mes_ano: string }[]>([]);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payIds, setPayIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  useEffect(() => {
    if (!user || !hasSearched) return;
    fetchDespesas(appliedFilters, currentPage);
  }, [currentPage, sortField, sortDir]);

  async function loadData() {
    setLoading(true);
    const [catRes, subRes, contRes, bloqRes] = await Promise.all([
      supabase.from('categorias').select('id, nome, classificacao').eq('usuario_id', user.id).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id, classificacao').eq('usuario_id', user.id).eq('bloqueada', false).order('nome'),
      supabase.from('contas').select('id, nome, tipo').eq('usuario_id', user.id).eq('bloqueada', false).order('nome'),
      supabase.from('bloqueios').select('tipo, mes_ano').eq('usuario_id', user.id),
    ]);

    setCategorias(catRes.data || []);
    setSubcategorias(subRes.data || []);
    setContas((contRes.data || []).map((conta: any) => ({ id: conta.id, nome: conta.nome })));
    setBloqueios(bloqRes.data || []);

    setLoading(false);
  }

  function buildDespesaQuery(filters: FilterState) {
    let query = supabase
      .from('despesas')
      .select('*, categorias(nome), subcategorias(nome), contas(nome, tipo)', { count: 'exact' })
      .eq('usuario_id', user.id);

    if (filters.categoria !== 'all') query = query.eq('categoria_id', filters.categoria);
    if (filters.subcategoria !== 'all') query = query.eq('subcategoria_id', filters.subcategoria);
    if (filters.situacao === 'pagas') query = query.eq('paga', true);
    if (filters.situacao === 'nao_pagas') query = query.or('paga.is.false,paga.is.null');
    if (filters.descricao.trim()) query = query.ilike('descricao', `%${filters.descricao.trim()}%`);

    const compInicio = filters.compInicioAno && filters.compInicioMes ? `${filters.compInicioAno}-${filters.compInicioMes.padStart(2, '0')}` : null;
    const compFim = filters.compFimAno && filters.compFimMes ? `${filters.compFimAno}-${filters.compFimMes.padStart(2, '0')}` : null;
    if (compInicio) query = query.gte('competencia', compInicio);
    if (compFim) query = query.lte('competencia', compFim);

    if (filters.vencimentoInicio) query = query.gte('data', format(filters.vencimentoInicio, 'yyyy-MM-dd'));
    if (filters.vencimentoFim) query = query.lte('data', format(filters.vencimentoFim, 'yyyy-MM-dd'));
    if (filters.pagamentoInicio) query = query.not('data_pagamento', 'is', null).gte('data_pagamento', format(filters.pagamentoInicio, 'yyyy-MM-dd'));
    if (filters.pagamentoFim) query = query.not('data_pagamento', 'is', null).lte('data_pagamento', format(filters.pagamentoFim, 'yyyy-MM-dd'));

    const ascending = sortDir === 'asc';
    if (sortField === 'categoria_nome') query = query.order('nome', { ascending, foreignTable: 'categorias' } as any);
    else if (sortField === 'subcategoria_nome') query = query.order('nome', { ascending, foreignTable: 'subcategorias' } as any);
    else query = query.order(sortField, { ascending, nullsFirst: false } as any);

    return query.order('id', { ascending: true });
  }

  async function fetchDespesas(filters: FilterState, page = currentPage) {
    if (!user) return;
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count, error } = await buildDespesaQuery(filters).range(from, to);

    if (error) {
      toast.error('Erro ao consultar despesas.');
      setLoading(false);
      return;
    }

    const loteCount: Record<string, number> = {};
    (data || []).forEach((despesa: any) => {
      if (despesa.lote_id) loteCount[despesa.lote_id] = (loteCount[despesa.lote_id] || 0) + 1;
    });

    setDespesas((data || []).map((despesa: any) => ({
      id: despesa.id,
      data: despesa.data,
      categoria_nome: despesa.categorias?.nome || '—',
      subcategoria_nome: despesa.subcategorias?.nome || '—',
      descricao: despesa.descricao,
      parcela: despesa.parcela,
      total_parcelas: despesa.total_parcelas ?? (despesa.lote_id ? loteCount[despesa.lote_id] : despesa.parcela ? 1 : null),
      conta_nome: despesa.contas?.nome || '—',
      competencia: despesa.competencia,
      valor: despesa.valor,
      data_pagamento: despesa.data_pagamento,
      created_at: despesa.created_at,
      paga: despesa.paga,
      conta_id: despesa.conta_id,
      categoria_id: despesa.categoria_id,
      subcategoria_id: despesa.subcategoria_id,
      lote_id: despesa.lote_id,
      is_cartao: despesa.contas?.tipo === 'cartao',
    })));
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  function isBlocked(competencia: string | null, dataPagamento: string | null) {
    return bloqueios.some((bloqueio) => {
      if (bloqueio.tipo === 'competencia' && competencia === bloqueio.mes_ano) return true;
      if (bloqueio.tipo === 'pagamento' && dataPagamento?.slice(0, 7) === bloqueio.mes_ano) return true;
      return false;
    });
  }

  function updateDraft<K extends keyof FilterState>(field: K, value: FilterState[K]) {
    setDraftFilters((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'categoria') next.subcategoria = 'all';
      return next;
    });
  }

  const filteredSubcategorias = useMemo(() => {
    if (draftFilters.categoria === 'all') return subcategorias;
    return subcategorias.filter((subcategoria) => subcategoria.categoria_id === draftFilters.categoria);
  }, [draftFilters.categoria, subcategorias]);

  const filtered = despesas;

  const total = filtered.reduce((sum, item) => sum + item.valor, 0);
  const totalPagas = filtered.filter((item) => item.paga).reduce((sum, item) => sum + item.valor, 0);
  const totalAbertas = total - totalPagas;
  const allSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((item) => item.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="ml-1 h-3.5 w-3.5" /> : <ArrowDown className="ml-1 h-3.5 w-3.5" />;
  }

  async function handlePay(ids: string[], dataPagamento: string, contaId: string) {
    const paymentMonth = dataPagamento.slice(0, 7);
    const paymentBlocked = bloqueios.some((bloqueio) => bloqueio.tipo === 'pagamento' && bloqueio.mes_ano === paymentMonth);
    if (paymentBlocked) {
      toast.error(`O mês ${paymentMonth} está bloqueado para pagamentos.`);
      setPayModalOpen(false);
      return;
    }

    for (const id of ids) {
      const despesa = despesas.find((item) => item.id === id);
      if (despesa && isBlocked(despesa.competencia, despesa.data_pagamento)) {
        toast.error(`Despesa bloqueada: ${despesa.descricao || despesa.id}`);
        continue;
      }
      await supabase.from('despesas').update({ paga: true, data_pagamento: dataPagamento, conta_id: contaId }).eq('id', id);
      if (despesa?.lote_id) {
        await supabase.from('faturas_cartao').update({ status: 'quitada' }).eq('id', despesa.lote_id);
      }
    }

    toast.success('Pagamento(s) registrado(s)!');
    setPayModalOpen(false);
    setSelected(new Set());
    if (hasSearched) fetchDespesas(appliedFilters, currentPage);
  }

  async function handleCancelPayment(id: string) {
    const despesa = despesas.find((item) => item.id === id);
    if (despesa && isBlocked(despesa.competencia, despesa.data_pagamento)) {
      toast.error('Não é possível cancelar pagamento de despesa em mês bloqueado.');
      return;
    }
    await supabase.from('despesas').update({ paga: false, data_pagamento: null }).eq('id', id);
    if (despesa?.lote_id) {
      await supabase.from('faturas_cartao').update({ status: 'aberta' }).eq('id', despesa.lote_id);
    }
    toast.success('Pagamento cancelado.');
    if (hasSearched) fetchDespesas(appliedFilters, currentPage);
  }

  async function handleDelete(ids: string[]) {
    for (const id of ids) {
      const despesa = despesas.find((item) => item.id === id);
      if (!despesa) continue;
      if (despesa.is_cartao) {
        toast.error('Despesas de Cartão de Crédito devem ser gerenciadas pelo menu Faturas.');
        continue;
      }
      if (isBlocked(despesa.competencia, despesa.data_pagamento)) {
        toast.error(`Despesa bloqueada: ${despesa.descricao || despesa.id}`);
        continue;
      }
      await supabase.from('despesas').delete().eq('id', id);
    }

    toast.success('Despesa(s) excluída(s).');
    setDeleteConfirmOpen(false);
    setSelected(new Set());
    if (hasSearched) fetchDespesas(appliedFilters, currentPage);
  }

  function handleEdit(item: DespesaRow) {
    if (item.is_cartao) {
      toast.error('Despesas de Cartão de Crédito devem ser editadas pelo menu Faturas.');
      return;
    }
    navigate(`/editar/${item.id}`);
  }

  function clearFilters() {
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setDespesas([]);
    setSelected(new Set());
    setHasSearched(false);
    setFiltersExpanded(true);
    setCurrentPage(1);
    setTotalCount(0);
  }

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setSelected(new Set());
    setHasSearched(true);
    setFiltersExpanded(false);
    if (currentPage === 1) {
      fetchDespesas(draftFilters, 1);
    } else {
      setCurrentPage(1);
    }
  }

  const exportColumns = [
    { header: 'Vencimento', key: 'data_display' },
    { header: 'Categoria', key: 'categoria_nome' },
    { header: 'Subcategoria', key: 'subcategoria_nome' },
    { header: 'Descrição', key: 'descricao' },
    { header: 'Parcela', key: 'parcela_display' },
    { header: 'Competência', key: 'competencia_display' },
    { header: 'Valor', key: 'valor_display' },
    { header: 'Pagamento', key: 'pagamento_display' },
  ];

  function getExportData() {
    return filtered.map((item) => ({
      ...item,
      data_display: formatDisplayDate(item.data),
      parcela_display: formatInstallmentDisplay(item.parcela, item.total_parcelas),
      competencia_display: formatCompactCompetencia(item.competencia),
      valor_display: formatCurrency(item.valor),
      pagamento_display: formatDisplayDate(item.data_pagamento),
    }));
  }

  const years = Array.from({ length: 10 }, (_, index) => String(new Date().getFullYear() - 3 + index));
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showingFrom = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Despesas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visual mais limpo, filtros objetivos e leitura rápida do que já foi quitado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Importar
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(getExportData(), exportColumns, 'despesas')}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportToPDF(getExportData(), exportColumns, 'Relatório de Despesas', 'despesas')}>
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button size="sm" onClick={() => navigate('/nova-despesa')}>
            <Plus className="mr-2 h-4 w-4" /> Nova Despesa
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="stat-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total filtrado</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(total)}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <TrendingDown className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Quitadas</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(totalPagas)}</p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Em aberto</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(totalAbertas)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="listing-filter-card">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Filtros</CardTitle>
              {hasSearched && !filtersExpanded && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {totalCount} despesa(s) encontrada(s). Página {currentPage} de {pageCount}.
                </p>
              )}
            </div>
            {hasSearched && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setFiltersExpanded((current) => !current)}>
                  {filtersExpanded ? 'Ocultar filtros' : 'Alterar filtros'}
                </Button>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <FilterX className="mr-2 h-4 w-4" /> Limpar filtros
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        {filtersExpanded && <CardContent className="space-y-4 px-0 pb-0">
          <div className="listing-filter-grid">
            <div className="listing-filter-field col-span-12 md:col-span-3">
              <label className="listing-filter-label">Categoria</label>
              <Select value={draftFilters.categoria} onValueChange={(value) => updateDraft('categoria', value)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categorias.map((categoria) => <SelectItem key={categoria.id} value={categoria.id}>{categoria.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="listing-filter-field col-span-12 md:col-span-3">
              <label className="listing-filter-label">Subcategoria</label>
              <Select value={draftFilters.subcategoria} onValueChange={(value) => updateDraft('subcategoria', value)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filteredSubcategorias.map((subcategoria) => <SelectItem key={subcategoria.id} value={subcategoria.id}>{subcategoria.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="listing-filter-field col-span-12 md:col-span-2">
              <label className="listing-filter-label">Status</label>
              <Select value={draftFilters.situacao} onValueChange={(value) => updateDraft('situacao', value)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pagas">Quitadas</SelectItem>
                  <SelectItem value="nao_pagas">Em aberto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="listing-filter-field col-span-12 md:col-span-4">
              <label className="listing-filter-label">Busca por descrição</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-10 pl-9" placeholder="Ex.: aluguel, mercado, internet..." value={draftFilters.descricao} onChange={(e) => updateDraft('descricao', e.target.value)} />
              </div>
            </div>

            <div className="listing-filter-field col-span-12 md:col-span-3">
              <label className="listing-filter-label">Competência inicial</label>
              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <Select value={draftFilters.compInicioMes} onValueChange={(value) => updateDraft('compInicioMes', value)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1).padStart(2, '0')}>{String(index + 1).padStart(2, '0')}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={draftFilters.compInicioAno} onValueChange={(value) => updateDraft('compInicioAno', value)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Ano" /></SelectTrigger>
                  <SelectContent>
                    {years.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="listing-filter-field col-span-12 md:col-span-3">
              <label className="listing-filter-label">Competência final</label>
              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <Select value={draftFilters.compFimMes} onValueChange={(value) => updateDraft('compFimMes', value)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1).padStart(2, '0')}>{String(index + 1).padStart(2, '0')}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={draftFilters.compFimAno} onValueChange={(value) => updateDraft('compFimAno', value)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Ano" /></SelectTrigger>
                  <SelectContent>
                    {years.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="listing-filter-field col-span-12 md:col-span-3">
              <label className="listing-filter-label">Data de vencimento de</label>
              <DateFilter value={draftFilters.vencimentoInicio} onChange={(value) => updateDraft('vencimentoInicio', value)} placeholder="Selecione a data" />
            </div>
            <div className="listing-filter-field col-span-12 md:col-span-3">
              <label className="listing-filter-label">Data de vencimento até</label>
              <DateFilter value={draftFilters.vencimentoFim} onChange={(value) => updateDraft('vencimentoFim', value)} placeholder="Selecione a data" />
            </div>

            <div className="listing-filter-field col-span-12 md:col-span-3">
              <label className="listing-filter-label">Data de pagamento de</label>
              <DateFilter value={draftFilters.pagamentoInicio} onChange={(value) => updateDraft('pagamentoInicio', value)} placeholder="Selecione a data" />
            </div>
            <div className="listing-filter-field col-span-12 md:col-span-3">
              <label className="listing-filter-label">Data de pagamento até</label>
              <DateFilter value={draftFilters.pagamentoFim} onChange={(value) => updateDraft('pagamentoFim', value)} placeholder="Selecione a data" />
            </div>
            <div className="col-span-12 md:col-span-3 flex items-end">
              <Button className="h-10 w-full" onClick={applyFilters}>Filtrar</Button>
            </div>
            <div className="col-span-12 md:col-span-3 flex items-end">
              <Button variant="outline" className="h-10 w-full" onClick={clearFilters}>
                <FilterX className="mr-2 h-4 w-4" /> Limpar filtros
              </Button>
            </div>
          </div>
        </CardContent>}
      </Card>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm">
          <span className="font-medium text-foreground">{selected.size} selecionada(s)</span>
          <span className="text-muted-foreground">Ações em massa</span>
          <Button size="sm" variant="outline" onClick={() => { setPayIds(Array.from(selected)); setPayModalOpen(true); }}>
            <CheckCircle className="mr-2 h-3.5 w-3.5" /> Pagar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => { setDeleteIds(Array.from(selected)); setDeleteConfirmOpen(true); }}>
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <table className="listing-table">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[96px]" />
              <col className="w-[130px]" />
              <col className="w-[138px]" />
              <col className="w-auto" />
              <col className="w-[78px]" />
              <col className="w-[82px]" />
              <col className="w-[120px]" />
              <col className="w-[108px]" />
              <col className="w-[70px]" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-3 py-3"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                {[
                  { label: 'Vencimento', field: 'data' as SortField, align: 'text-left' },
                  { label: 'Categoria', field: 'categoria_nome' as SortField, align: 'text-left' },
                  { label: 'Subcategoria', field: 'subcategoria_nome' as SortField, align: 'text-left' },
                  { label: 'Descrição', field: 'descricao' as SortField, align: 'text-left' },
                  { label: 'Parcela', field: 'parcela' as SortField, align: 'text-left' },
                  { label: 'Competência', field: 'competencia' as SortField, align: 'text-left' },
                  { label: 'Valor', field: 'valor' as SortField, align: 'text-right' },
                  { label: 'Pagamento', field: 'data_pagamento' as SortField, align: 'text-left' },
                ].map(({ label, field, align }) => (
                  <th key={field} className={`px-3 py-3 text-xs font-semibold ${align}`}>
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort(field)}>
                      {label}
                      <SortIcon field={field} />
                    </button>
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-xs font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!hasSearched ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum lançamento exibido. Aplique os filtros para visualizar os resultados.
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Carregando...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Nenhuma despesa encontrada.</td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const blocked = isBlocked(item.competencia, item.data_pagamento);
                  return (
                    <tr key={item.id} className={cn('border-b border-border/60 align-top transition-colors hover:bg-muted/30', item.paga ? 'listing-row-paid' : 'listing-row-open')}>
                      <td className="px-3 py-3">
                        <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleOne(item.id)} />
                      </td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">{formatDisplayDate(item.data)}</td>
                      <td className="px-3 py-3 text-sm">
                        <div className="truncate font-medium">{item.categoria_nome}</div>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <div className="truncate text-muted-foreground">{item.subcategoria_nome}</div>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <div className="listing-description font-medium text-foreground">{item.descricao || '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">{formatInstallmentDisplay(item.parcela, item.total_parcelas)}</td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">{formatCompactCompetencia(item.competencia)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap font-semibold text-destructive">{formatCurrency(item.valor)}</td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">{formatDisplayDate(item.data_pagamento)}</td>
                      <td className="px-3 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(item)} disabled={blocked}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                            </DropdownMenuItem>
                            {!item.paga && (
                              <DropdownMenuItem onClick={() => { setPayIds([item.id]); setPayModalOpen(true); }} disabled={blocked}>
                                <CheckCircle className="mr-2 h-3.5 w-3.5" /> Confirmar pagamento
                              </DropdownMenuItem>
                            )}
                            {item.paga && (
                              <DropdownMenuItem onClick={() => handleCancelPayment(item.id)} disabled={blocked}>
                                <XCircle className="mr-2 h-3.5 w-3.5" /> Cancelar pagamento
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => { setDeleteIds([item.id]); setDeleteConfirmOpen(true); }} disabled={blocked}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40">
                  <td colSpan={7} className="px-3 py-3 text-right text-sm font-semibold">Total da página</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-destructive">{formatCurrency(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          {hasSearched && totalCount > 0 && (
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
          )}
        </CardContent>
      </Card>

      <PayModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        onConfirm={(dataPagamento, contaId) => handlePay(payIds, dataPagamento, contaId)}
        contas={contas}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir {deleteIds.length} despesa(s)?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(deleteIds)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {user && (
        <ImportTransactionsDialog
          kind="despesas"
          userId={user.id}
          open={importOpen}
          onOpenChange={setImportOpen}
          categories={categorias}
          subcategories={subcategorias}
          accounts={contas}
          onImported={() => {
            loadData();
            if (hasSearched) fetchDespesas(appliedFilters, currentPage);
          }}
        />
      )}
    </div>
  );
}
