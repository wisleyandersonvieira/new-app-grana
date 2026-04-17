import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpDown,
  BarChart3,
  Check,
  ChevronsUpDown,
  FilterX,
  Search,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/financial';
import { formatCompactCompetencia, formatDisplayDate } from '@/lib/listing-format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

type Option = {
  id: string;
  nome: string;
};

type SubcategoriaOption = Option & {
  categoria_id: string;
};

type SituacaoFiltro = 'pagas' | 'abertas' | 'ambos' | '';
type TipoDataFiltro = 'pagamento' | 'competencia' | '';

type ReportRow = {
  id: string;
  dataPagamento: string | null;
  descricao: string;
  categoria: string;
  subcategoria: string;
  conta: string;
  competencia: string | null;
  valor: number;
  paga: boolean;
};

type DespesaReportQueryRow = Pick<
  Database['public']['Tables']['despesas']['Row'],
  'id' | 'descricao' | 'competencia' | 'valor' | 'data_pagamento' | 'paga' | 'categoria_id' | 'subcategoria_id' | 'conta_id'
> & {
  categorias: { nome: string } | { nome: string }[] | null;
  subcategorias: { nome: string } | { nome: string }[] | null;
  contas: { nome: string } | { nome: string }[] | null;
};

type SortKey =
  | 'dataPagamento'
  | 'descricao'
  | 'categoria'
  | 'subcategoria'
  | 'conta'
  | 'competencia'
  | 'valor'
  | 'situacao';

type FilterState = {
  situacao: SituacaoFiltro;
  tipoData: TipoDataFiltro;
  periodoInicial: string;
  periodoFinal: string;
  contas: string[];
  categorias: string[];
  subcategorias: string[];
};

const DEFAULT_FILTERS: FilterState = {
  situacao: '',
  tipoData: '',
  periodoInicial: '',
  periodoFinal: '',
  contas: [],
  categorias: [],
  subcategorias: [],
};

const ROWS_PER_PAGE = 15;

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();

  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getCurrentCompetenciaRange() {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { start: current, end: current };
}

function getDefaultFilters(): FilterState {
  const monthRange = getCurrentMonthRange();
  return {
    ...DEFAULT_FILTERS,
    situacao: 'ambos',
    tipoData: 'competencia',
    periodoInicial: monthRange.start.slice(0, 7),
    periodoFinal: monthRange.end.slice(0, 7),
  };
}

function getSituacaoLabel(value: SituacaoFiltro) {
  if (value === 'pagas') return 'Pago';
  if (value === 'abertas') return 'Em aberto';
  return 'Todos';
}

function getTipoDataLabel(value: TipoDataFiltro) {
  if (value === 'pagamento') return 'Pagamento';
  if (value === 'competencia') return 'Competência';
  return 'Tipo de data';
}

function normalizePeriodValue(tipoData: TipoDataFiltro, value: string) {
  if (!value) return '';
  return tipoData === 'competencia' ? value.slice(0, 7) : value.slice(0, 10);
}

function compareNullableText(left?: string | null, right?: string | null) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR');
}

function getRelationName(
  relation: { nome: string } | { nome: string }[] | null | undefined,
  fallback: string,
) {
  if (!relation) return fallback;
  return Array.isArray(relation) ? relation[0]?.nome ?? fallback : relation.nome ?? fallback;
}

function MultiSelectFilter({
  label,
  placeholder,
  options,
  selectedValues,
  onChange,
  disabled = false,
  emptyMessage = 'Nenhum item encontrado.',
}: {
  label: string;
  placeholder: string;
  options: Option[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.id))
    .map((option) => option.nome);

  const summary =
    selectedValues.length === 0
      ? 'Todas'
      : selectedValues.length === 1
        ? selectedLabels[0] ?? placeholder
        : `${selectedValues.length} selecionadas`;

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }

    onChange([...selectedValues, value]);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className="w-full justify-between text-left font-normal"
          >
            <span className={cn('truncate', disabled && 'text-muted-foreground')}>
              {disabled ? 'Selecione uma categoria primeiro' : summary || placeholder}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <div className="border-b px-3 py-2">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <CommandInput
                  placeholder={`Buscar ${label.toLowerCase()}`}
                  className="h-9 border-0 px-0"
                />
              </div>
            </div>
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => onChange([])} className="gap-2">
                  <Checkbox checked={selectedValues.length === 0} />
                  <span>Todas</span>
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={`${option.nome} ${option.id}`}
                    onSelect={() => toggleValue(option.id)}
                    className="gap-2"
                  >
                    <Checkbox checked={selectedValues.includes(option.id)} />
                    <span className="truncate">{option.nome}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function RelatorioContas() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<FilterState>(getDefaultFilters());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [contas, setContas] = useState<Option[]>([]);
  const [categorias, setCategorias] = useState<Option[]>([]);
  const [subcategorias, setSubcategorias] = useState<SubcategoriaOption[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('competencia');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!user) return;

    Promise.all([
      supabase.from('contas').select('id, nome').eq('usuario_id', user.id).order('nome'),
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id').eq('usuario_id', user.id).order('nome'),
    ]).then(([contasResponse, categoriasResponse, subcategoriasResponse]) => {
      setContas(contasResponse.data ?? []);
      setCategorias(categoriasResponse.data ?? []);
      setSubcategorias((subcategoriasResponse.data ?? []) as SubcategoriaOption[]);
    });
  }, [user]);

  const availableSubcategorias = useMemo(() => {
    if (filters.categorias.length === 0) return subcategorias;
    return subcategorias.filter((item) => filters.categorias.includes(item.categoria_id));
  }, [filters.categorias, subcategorias]);

  useEffect(() => {
    setFilters((current) => {
      const nextSubcategorias = current.subcategorias.filter((id) =>
        availableSubcategorias.some((item) => item.id === id),
      );

      if (nextSubcategorias.length === current.subcategorias.length) return current;
      return { ...current, subcategorias: nextSubcategorias };
    });
  }, [availableSubcategorias]);

  const sortedRows = useMemo(() => {
    const data = [...rows];

    data.sort((left, right) => {
      let comparison = 0;

      switch (sortKey) {
        case 'valor':
          comparison = left.valor - right.valor;
          break;
        case 'situacao':
          comparison = compareNullableText(left.paga ? 'Pago' : 'Em aberto', right.paga ? 'Pago' : 'Em aberto');
          break;
        case 'dataPagamento':
          comparison = compareNullableText(left.dataPagamento, right.dataPagamento);
          break;
        case 'descricao':
          comparison = compareNullableText(left.descricao, right.descricao);
          break;
        case 'categoria':
          comparison = compareNullableText(left.categoria, right.categoria);
          break;
        case 'subcategoria':
          comparison = compareNullableText(left.subcategoria, right.subcategoria);
          break;
        case 'conta':
          comparison = compareNullableText(left.conta, right.conta);
          break;
        case 'competencia':
          comparison = compareNullableText(left.competencia, right.competencia);
          break;
      }

      if (comparison === 0) {
        comparison = compareNullableText(left.descricao, right.descricao);
      }

      return sortDir === 'asc' ? comparison : -comparison;
    });

    return data;
  }, [rows, sortDir, sortKey]);

  const totalValue = useMemo(
    () => rows.reduce((sum, row) => sum + row.valor, 0),
    [rows],
  );

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE));
  const paginatedRows = sortedRows.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const appliedFilterSummary = useMemo(() => {
    const selectedContas = contas.filter((item) => filters.contas.includes(item.id));
    const selectedCategorias = categorias.filter((item) => filters.categorias.includes(item.id));
    const selectedSubcategorias = subcategorias.filter((item) => filters.subcategorias.includes(item.id));

    return [
      `${getSituacaoLabel(filters.situacao)}`,
      `${getTipoDataLabel(filters.tipoData)}`,
      filters.contas.length === 0 ? 'Todas as contas' : `${selectedContas.length} conta(s)`,
      filters.categorias.length === 0 ? 'Todas as categorias' : `${selectedCategorias.length} categoria(s)`,
      filters.subcategorias.length === 0 ? 'Todas as subcategorias' : `${selectedSubcategorias.length} subcategoria(s)`,
    ];
  }, [categorias, contas, filters, subcategorias]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDir(key === 'valor' ? 'desc' : 'asc');
  };

  const validateFilters = () => {
    if (!filters.situacao) {
      toast.error('Selecione a situação do lançamento.');
      return false;
    }

    if (!filters.tipoData) {
      toast.error('Selecione o tipo de data.');
      return false;
    }

    if (!filters.periodoInicial || !filters.periodoFinal) {
      toast.error('Informe o período inicial e final.');
      return false;
    }

    const normalizedStart = normalizePeriodValue(filters.tipoData, filters.periodoInicial);
    const normalizedEnd = normalizePeriodValue(filters.tipoData, filters.periodoFinal);

    if (normalizedStart > normalizedEnd) {
      toast.error('A data inicial não pode ser maior que a data final.');
      return false;
    }

    return true;
  };

  const handleGenerate = async () => {
    if (!user || !validateFilters()) return;

    const normalizedStart = normalizePeriodValue(filters.tipoData, filters.periodoInicial);
    const normalizedEnd = normalizePeriodValue(filters.tipoData, filters.periodoFinal);

    setLoading(true);
    setCurrentPage(1);

    try {
      let query = supabase
        .from('despesas')
        .select('id, descricao, competencia, valor, data_pagamento, paga, categoria_id, subcategoria_id, conta_id, categorias(nome), subcategorias(nome), contas(nome)')
        .eq('usuario_id', user.id);

      if (filters.situacao === 'pagas') {
        query = query.eq('paga', true);
      } else if (filters.situacao === 'abertas') {
        query = query.or('paga.is.false,paga.is.null');
      }

      if (filters.tipoData === 'pagamento') {
        query = query
          .not('data_pagamento', 'is', null)
          .gte('data_pagamento', normalizedStart)
          .lte('data_pagamento', normalizedEnd);
      } else {
        query = query
          .not('competencia', 'is', null)
          .gte('competencia', normalizedStart)
          .lte('competencia', normalizedEnd);
      }

      if (filters.contas.length > 0) query = query.in('conta_id', filters.contas);
      if (filters.categorias.length > 0) query = query.in('categoria_id', filters.categorias);
      if (filters.subcategorias.length > 0) query = query.in('subcategoria_id', filters.subcategorias);

      const { data, error } = await query.order(
        filters.tipoData === 'pagamento' ? 'data_pagamento' : 'competencia',
        { ascending: false },
      );

      if (error) throw error;

      const mappedRows: ReportRow[] = ((data ?? []) as DespesaReportQueryRow[]).map((item) => ({
        id: item.id,
        dataPagamento: item.paga ? item.data_pagamento : null,
        descricao: item.descricao ?? 'Sem descrição',
        categoria: getRelationName(item.categorias, 'Sem categoria'),
        subcategoria: getRelationName(item.subcategorias, 'Sem subcategoria'),
        conta: getRelationName(item.contas, 'Sem conta'),
        competencia: item.competencia,
        valor: item.valor ?? 0,
        paga: Boolean(item.paga),
      }));

      setRows(mappedRows);
      setGenerated(true);

      if (
        filters.tipoData === 'pagamento' &&
        (filters.situacao === 'abertas' || filters.situacao === 'ambos')
      ) {
        toast.info('Lançamentos em aberto sem data de pagamento ficam fora do período por pagamento.');
      }
    } catch (error) {
      console.error('Erro ao gerar relatório de contas:', error);
      toast.error('Não foi possível gerar o relatório de contas.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilters(getDefaultFilters());
    setRows([]);
    setGenerated(false);
    setCurrentPage(1);
    setSortKey('competencia');
    setSortDir('desc');
  };

  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1).slice(
    Math.max(0, currentPage - 3),
    Math.max(5, currentPage + 2),
  );

  const SortableHead = ({
    label,
    sortBy,
    alignRight = false,
  }: {
    label: string;
    sortBy: SortKey;
    alignRight?: boolean;
  }) => (
    <TableHead className={alignRight ? 'text-right' : ''}>
      <button
        type="button"
        onClick={() => handleSort(sortBy)}
        className={cn(
          'flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground',
          alignRight && 'ml-auto',
        )}
      >
        {label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Relatório de Contas</h1>
          <p className="text-sm text-muted-foreground">
            Visão analítica dos lançamentos por situação, conta, categoria e subcategoria.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5 text-primary">
          Estrutura pronta para futuras exportações em Excel e PDF
        </Badge>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Filtros do relatório
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="situacao">Situação</Label>
              <select
                id="situacao"
                value={filters.situacao}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, situacao: event.target.value as SituacaoFiltro }))
                }
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="">Selecione</option>
                <option value="pagas">Contas pagas</option>
                <option value="abertas">Contas a pagar</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo-data">Tipo de data</Label>
              <select
                id="tipo-data"
                value={filters.tipoData}
                onChange={(event) => {
                  const tipoData = event.target.value as TipoDataFiltro;
                  const defaultRange =
                    tipoData === 'pagamento' ? getCurrentMonthRange() : getCurrentCompetenciaRange();

                  setFilters((current) => ({
                    ...current,
                    tipoData,
                    periodoInicial: tipoData ? defaultRange.start : '',
                    periodoFinal: tipoData ? defaultRange.end : '',
                  }));
                }}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="">Selecione</option>
                <option value="pagamento">Pagamento</option>
                <option value="competencia">Competência</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="periodo-inicial">
                {filters.tipoData === 'competencia' ? 'Competência inicial' : 'Data inicial'}
              </Label>
              <Input
                id="periodo-inicial"
                type={filters.tipoData === 'competencia' ? 'month' : 'date'}
                value={filters.periodoInicial}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, periodoInicial: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="periodo-final">
                {filters.tipoData === 'competencia' ? 'Competência final' : 'Data final'}
              </Label>
              <Input
                id="periodo-final"
                type={filters.tipoData === 'competencia' ? 'month' : 'date'}
                value={filters.periodoFinal}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, periodoFinal: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <MultiSelectFilter
              label="Conta(s)"
              placeholder="Selecione contas"
              options={contas}
              selectedValues={filters.contas}
              onChange={(values) => setFilters((current) => ({ ...current, contas: values }))}
            />

            <MultiSelectFilter
              label="Categoria(s)"
              placeholder="Selecione categorias"
              options={categorias}
              selectedValues={filters.categorias}
              onChange={(values) =>
                setFilters((current) => ({
                  ...current,
                  categorias: values,
                  subcategorias: current.subcategorias.filter((id) =>
                    subcategorias.some(
                      (subcategoria) =>
                        subcategoria.id === id &&
                        (values.length === 0 || values.includes(subcategoria.categoria_id)),
                    ),
                  ),
                }))
              }
            />

            <MultiSelectFilter
              label="Subcategoria(s)"
              placeholder="Selecione subcategorias"
              options={availableSubcategorias}
              selectedValues={filters.subcategorias}
              onChange={(values) => setFilters((current) => ({ ...current, subcategorias: values }))}
              disabled={subcategorias.length === 0}
              emptyMessage="Nenhuma subcategoria disponível para as categorias selecionadas."
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleGenerate} disabled={loading} className="sm:min-w-[160px]">
              {loading ? 'Gerando...' : 'Gerar'}
            </Button>
            <Button variant="outline" onClick={handleClear} className="sm:min-w-[160px]">
              <FilterX className="h-4 w-4" />
              Limpar filtros
            </Button>
          </div>

          {filters.tipoData === 'pagamento' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Ao filtrar por pagamento, lançamentos em aberto sem `data_pagamento` não entram no período.
            </div>
          )}
        </CardContent>
      </Card>

      {generated && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card className="border-border/70">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Registros encontrados</p>
                <p className="mt-2 text-3xl font-semibold">{rows.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total financeiro</p>
                <p className="mt-2 text-3xl font-semibold">{formatCurrency(totalValue)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="flex h-full flex-wrap gap-2 pt-6">
                {appliedFilterSummary.map((item) => (
                  <Badge key={item} variant="secondary" className="h-fit rounded-full">
                    {item}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg">Resultado na tela</CardTitle>
              <p className="text-sm text-muted-foreground">
                Página {currentPage} de {pageCount}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                  Nenhum lançamento encontrado para os filtros selecionados.
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-2xl border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <SortableHead label="Data Pagamento" sortBy="dataPagamento" />
                          <SortableHead label="Descrição" sortBy="descricao" />
                          <SortableHead label="Categoria" sortBy="categoria" />
                          <SortableHead label="Subcategoria" sortBy="subcategoria" />
                          <SortableHead label="Conta" sortBy="conta" />
                          <SortableHead label="Competência" sortBy="competencia" />
                          <SortableHead label="Valor" sortBy="valor" alignRight />
                          <SortableHead label="Situação" sortBy="situacao" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedRows.map((row) => (
                          <TableRow
                            key={row.id}
                            className={cn(
                              'border-b',
                              row.paga
                                ? 'bg-emerald-50/70 hover:bg-emerald-50'
                                : 'bg-background hover:bg-muted/40',
                            )}
                          >
                            <TableCell>{row.dataPagamento ? formatDisplayDate(row.dataPagamento) : ''}</TableCell>
                            <TableCell className="font-medium">{row.descricao}</TableCell>
                            <TableCell>{row.categoria}</TableCell>
                            <TableCell>{row.subcategoria}</TableCell>
                            <TableCell>{row.conta}</TableCell>
                            <TableCell>{formatCompactCompetencia(row.competencia)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(row.valor)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={row.paga ? 'secondary' : 'outline'}
                                className={cn(
                                  row.paga
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                                    : 'border-slate-300 text-slate-700',
                                )}
                              >
                                {row.paga ? (
                                  <>
                                    <Check className="h-3.5 w-3.5" />
                                    Pago
                                  </>
                                ) : (
                                  'Em aberto'
                                )}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {pageCount > 1 && (
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              setCurrentPage((page) => Math.max(1, page - 1));
                            }}
                            className={cn(currentPage === 1 && 'pointer-events-none opacity-50')}
                          />
                        </PaginationItem>

                        {currentPage > 3 && (
                          <PaginationItem>
                            <PaginationLink href="#" onClick={(event) => { event.preventDefault(); setCurrentPage(1); }}>
                              1
                            </PaginationLink>
                          </PaginationItem>
                        )}

                        {pageNumbers.map((page) => (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              isActive={page === currentPage}
                              onClick={(event) => {
                                event.preventDefault();
                                setCurrentPage(page);
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ))}

                        {currentPage < pageCount - 2 && (
                          <PaginationItem>
                            <PaginationLink
                              href="#"
                              onClick={(event) => {
                                event.preventDefault();
                                setCurrentPage(pageCount);
                              }}
                            >
                              {pageCount}
                            </PaginationLink>
                          </PaginationItem>
                        )}

                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              setCurrentPage((page) => Math.min(pageCount, page + 1));
                            }}
                            className={cn(currentPage === pageCount && 'pointer-events-none opacity-50')}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
