import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  TrendingDown,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  FileText,
  CalendarIcon,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/financial';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { PayModal } from '@/components/PayModal';

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
  is_cartao: boolean;
}

type SortField = keyof DespesaRow;
type SortDir = 'asc' | 'desc';

export default function Despesas() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [despesas, setDespesas] = useState<DespesaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filters
  const [fCategoria, setFCategoria] = useState('all');
  const [fConta, setFConta] = useState('all');
  const [fCompMes, setFCompMes] = useState('all');
  const [fCompAno, setFCompAno] = useState('all');
  const [fSituacao, setFSituacao] = useState('all');
  const [fDescricao, setFDescricao] = useState('');
  const [fCadastroInicio, setFCadastroInicio] = useState<Date | undefined>();
  const [fCadastroFim, setFCadastroFim] = useState<Date | undefined>();
  const [fPagtoInicio, setFPagtoInicio] = useState<Date | undefined>();
  const [fPagtoFim, setFPagtoFim] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('data');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Reference data
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [bloqueios, setBloqueios] = useState<{ tipo: string; mes_ano: string }[]>([]);

  // Modals
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payIds, setPayIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    const [catRes, contRes, bloqRes] = await Promise.all([
      supabase.from('categorias').select('id, nome').order('nome'),
      supabase.from('contas').select('id, nome, tipo').eq('bloqueada', false).order('nome'),
      supabase.from('bloqueios').select('tipo, mes_ano'),
    ]);
    setCategorias(catRes.data || []);
    setContas((contRes.data || []).map((c: any) => ({ id: c.id, nome: c.nome })));
    setBloqueios(bloqRes.data || []);

    // Build a map of conta types
    const contaTipoMap: Record<string, string> = {};
    (contRes.data || []).forEach((c: any) => { contaTipoMap[c.id] = c.tipo; });

    const { data } = await supabase
      .from('despesas')
      .select('*, categorias(nome), subcategorias(nome), contas(nome, tipo)')
      .order('data', { ascending: false });

    if (data) {
      // Calculate total_parcelas per lote_id
      const loteCount: Record<string, number> = {};
      data.forEach((d: any) => {
        if (d.lote_id) {
          loteCount[d.lote_id] = (loteCount[d.lote_id] || 0) + 1;
        }
      });

      const rows: DespesaRow[] = data.map((d: any) => ({
        id: d.id,
        data: d.data,
        categoria_nome: d.categorias?.nome || '—',
        subcategoria_nome: d.subcategorias?.nome || '—',
        descricao: d.descricao,
        parcela: d.parcela,
        total_parcelas: d.lote_id ? loteCount[d.lote_id] : d.parcela ? 1 : null,
        conta_nome: d.contas?.nome || '—',
        competencia: d.competencia,
        valor: d.valor,
        data_pagamento: d.data_pagamento,
        created_at: d.created_at,
        paga: d.paga,
        conta_id: d.conta_id,
        categoria_id: d.categoria_id,
        is_cartao: d.contas?.tipo === 'cartao',
      }));
      setDespesas(rows);
    }
    setLoading(false);
  }

  // Check blocking
  function isBlocked(competencia: string | null, dataPagamento: string | null): boolean {
    if (!competencia && !dataPagamento) return false;
    return bloqueios.some((b) => {
      if (b.tipo === 'competencia' && competencia && competencia === b.mes_ano) return true;
      if (b.tipo === 'pagamento' && dataPagamento) {
        const pgtoComp = dataPagamento.substring(0, 7);
        if (pgtoComp === b.mes_ano) return true;
      }
      return false;
    });
  }

  // Filtered + sorted data
  const filtered = useMemo(() => {
    let result = [...despesas];

    if (fCategoria !== 'all') {
      result = result.filter((d) => d.categoria_id === fCategoria);
    }
    if (fConta !== 'all') {
      result = result.filter((d) => d.conta_id === fConta);
    }
    if (fCompMes && fCompMes !== 'all' && fCompAno && fCompAno !== 'all') {
      const comp = `${fCompAno}-${fCompMes.padStart(2, '0')}`;
      result = result.filter((d) => d.competencia === comp);
    }
    if (fSituacao === 'pagas') result = result.filter((d) => d.paga);
    if (fSituacao === 'nao_pagas') result = result.filter((d) => !d.paga);
    if (fDescricao) {
      const term = fDescricao.toLowerCase();
      result = result.filter((d) => d.descricao?.toLowerCase().includes(term));
    }
    if (fCadastroInicio) {
      const s = format(fCadastroInicio, 'yyyy-MM-dd');
      result = result.filter((d) => (d.created_at || '') >= s);
    }
    if (fCadastroFim) {
      const e = format(fCadastroFim, 'yyyy-MM-dd');
      result = result.filter((d) => (d.created_at || '').substring(0, 10) <= e);
    }
    if (fPagtoInicio) {
      const s = format(fPagtoInicio, 'yyyy-MM-dd');
      result = result.filter((d) => d.data_pagamento && d.data_pagamento >= s);
    }
    if (fPagtoFim) {
      const e = format(fPagtoFim, 'yyyy-MM-dd');
      result = result.filter((d) => d.data_pagamento && d.data_pagamento <= e);
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [despesas, fCategoria, fConta, fCompMes, fCompAno, fSituacao, fDescricao, fCadastroInicio, fCadastroFim, fPagtoInicio, fPagtoFim, sortField, sortDir]);

  const total = filtered.reduce((s, d) => s + d.valor, 0);

  // Selection helpers
  const allSelected = filtered.length > 0 && filtered.every((d) => selected.has(d.id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((d) => d.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Column sort
  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }
  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  }

  // Actions
  async function handlePay(ids: string[], dataPagamento: string, contaId: string) {
    // Check if payment month is blocked
    const pgtoMesAno = dataPagamento.substring(0, 7);
    const pgtoBlocked = bloqueios.some(b => b.tipo === 'pagamento' && b.mes_ano === pgtoMesAno);
    if (pgtoBlocked) {
      toast.error(`O mês ${pgtoMesAno} está bloqueado para pagamentos.`);
      setPayModalOpen(false);
      return;
    }
    for (const id of ids) {
      const d = despesas.find((x) => x.id === id);
      if (d && isBlocked(d.competencia, d.data_pagamento)) {
        toast.error(`Despesa bloqueada: ${d.descricao || d.id}`);
        continue;
      }
      await supabase.from('despesas').update({ paga: true, data_pagamento: dataPagamento, conta_id: contaId }).eq('id', id);
    }
    toast.success('Pagamento(s) registrado(s)!');
    setPayModalOpen(false);
    setSelected(new Set());
    loadData();
  }

  async function handleCancelPayment(id: string) {
    const d = despesas.find((x) => x.id === id);
    if (d && isBlocked(d.competencia, d.data_pagamento)) {
      toast.error('Não é possível cancelar pagamento de despesa em mês bloqueado.');
      return;
    }
    await supabase.from('despesas').update({ paga: false, data_pagamento: null }).eq('id', id);
    toast.success('Pagamento cancelado.');
    loadData();
  }

  async function handleDelete(ids: string[]) {
    for (const id of ids) {
      const d = despesas.find((x) => x.id === id);
      if (!d) continue;
      if (d.is_cartao) { toast.error('Despesas de Cartão de Crédito devem ser gerenciadas pelo menu Faturas.'); continue; }
      if (isBlocked(d.competencia, d.data_pagamento)) { toast.error(`Despesa bloqueada: ${d.descricao || d.id}`); continue; }
      await supabase.from('despesas').delete().eq('id', id);
    }
    toast.success('Despesa(s) excluída(s).');
    setDeleteConfirmOpen(false);
    setSelected(new Set());
    loadData();
  }

  function handleEdit(d: DespesaRow) {
    if (d.is_cartao) {
      toast.error('Despesas de Cartão de Crédito devem ser editadas pelo menu Faturas.');
      return;
    }
    navigate(`/editar/${d.id}`);
  }

  // Export
  const exportColumns = [
    { header: 'Vencimento', key: 'data' },
    { header: 'Categoria', key: 'categoria_nome' },
    { header: 'Subcategoria', key: 'subcategoria_nome' },
    { header: 'Descrição', key: 'descricao' },
    { header: 'Parcela', key: 'parcela_display' },
    { header: 'Conta', key: 'conta_nome' },
    { header: 'Competência', key: 'competencia' },
    { header: 'Valor', key: 'valor_display' },
    { header: 'Pagamento', key: 'data_pagamento' },
    { header: 'Cadastro', key: 'created_at_display' },
  ];

  function getExportData() {
    return filtered.map((d) => ({
      ...d,
      parcela_display: d.parcela && d.total_parcelas ? `${d.parcela}/${d.total_parcelas}` : '—',
      valor_display: formatCurrency(d.valor),
      created_at_display: d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '—',
      data_pagamento: d.data_pagamento || '—',
    }));
  }

  // Date filter helper
  function DateFilter({ value, onChange, placeholder }: { value: Date | undefined; onChange: (d: Date | undefined) => void; placeholder: string }) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('h-9 w-full justify-start text-left text-xs', !value && 'text-muted-foreground')}>
            <CalendarIcon className="mr-1 h-3 w-3" />
            {value ? format(value, 'dd/MM/yy') : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Despesas</h1>
          <p className="text-muted-foreground text-sm">Gerencie todas as suas despesas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="mr-1 h-4 w-4" /> Filtros
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(getExportData(), exportColumns, 'despesas')}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportToPDF(getExportData(), exportColumns, 'Relatório de Despesas', 'despesas')}>
            <FileText className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button size="sm" onClick={() => navigate('/nova-despesa')}>
            <Plus className="mr-1 h-4 w-4" /> Nova Despesa
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
              <Select value={fCategoria} onValueChange={setFCategoria}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Categorias</SelectItem>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fConta} onValueChange={setFConta}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Contas</SelectItem>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Select value={fCompMes} onValueChange={setFCompMes}>
                  <SelectTrigger className="h-9 text-xs w-16"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Mês</SelectItem>
                    {Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, '0')}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="h-9 text-xs w-20" placeholder="Ano" value={fCompAno} onChange={(e) => setFCompAno(e.target.value)} />
              </div>
              <Select value={fSituacao} onValueChange={setFSituacao}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Situação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pagas">Pagas</SelectItem>
                  <SelectItem value="nao_pagas">Não Pagas</SelectItem>
                </SelectContent>
              </Select>
              <Input className="h-9 text-xs" placeholder="Buscar descrição..." value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} />
              <div className="flex gap-1">
                <DateFilter value={fCadastroInicio} onChange={setFCadastroInicio} placeholder="Cad. De" />
                <DateFilter value={fCadastroFim} onChange={setFCadastroFim} placeholder="Cad. Até" />
              </div>
              <div className="flex gap-1">
                <DateFilter value={fPagtoInicio} onChange={setFPagtoInicio} placeholder="Pgto De" />
                <DateFilter value={fPagtoFim} onChange={setFPagtoFim} placeholder="Pgto Até" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-card p-2 text-sm">
          <span className="text-muted-foreground">{selected.size} selecionada(s)</span>
          <Button size="sm" variant="outline" onClick={() => { setPayIds(Array.from(selected)); setPayModalOpen(true); }}>
            <CheckCircle className="mr-1 h-3 w-3" /> Pagar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => { setDeleteIds(Array.from(selected)); setDeleteConfirmOpen(true); }}>
            <Trash2 className="mr-1 h-3 w-3" /> Excluir
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-table-header text-table-header-foreground">
                  <th className="px-3 py-2.5 w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  {[
                    { label: 'Vencimento', field: 'data' as SortField },
                    { label: 'Categoria', field: 'categoria_nome' as SortField },
                    { label: 'Subcategoria', field: 'subcategoria_nome' as SortField },
                    { label: 'Descrição', field: 'descricao' as SortField },
                    { label: 'Parcela', field: 'parcela' as SortField },
                    { label: 'Conta', field: 'conta_nome' as SortField },
                    { label: 'Competência', field: 'competencia' as SortField },
                    { label: 'Valor', field: 'valor' as SortField },
                    { label: 'Pagamento', field: 'data_pagamento' as SortField },
                    { label: 'Cadastro', field: 'created_at' as SortField },
                  ].map(({ label, field }) => (
                    <th
                      key={field}
                      className="px-3 py-2.5 text-left text-xs font-semibold cursor-pointer whitespace-nowrap select-none"
                      onClick={() => handleSort(field)}
                    >
                      <span className="flex items-center">
                        {label}
                        <SortIcon field={field} />
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-xs font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Nenhuma despesa encontrada.</td></tr>
                ) : (
                  filtered.map((d) => {
                    const blocked = isBlocked(d.competencia, d.data_pagamento);
                    return (
                      <tr key={d.id} className={cn('border-b hover:bg-muted/30', d.paga && 'opacity-70')}>
                        <td className="px-3 py-2"><Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggleOne(d.id)} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">{d.data}</td>
                        <td className="px-3 py-2">{d.categoria_nome}</td>
                        <td className="px-3 py-2">{d.subcategoria_nome}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{d.descricao || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{d.parcela && d.total_parcelas ? `${d.parcela}/${d.total_parcelas}` : '—'}</td>
                        <td className="px-3 py-2">{d.conta_nome}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{d.competencia || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-destructive">{formatCurrency(d.valor)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{d.data_pagamento || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="px-3 py-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(d)} disabled={blocked || d.is_cartao}>
                                <Pencil className="mr-2 h-3 w-3" /> Editar
                              </DropdownMenuItem>
                              {!d.paga && (
                                <DropdownMenuItem onClick={() => { setPayIds([d.id]); setPayModalOpen(true); }} disabled={blocked}>
                                  <CheckCircle className="mr-2 h-3 w-3" /> Pagar
                                </DropdownMenuItem>
                              )}
                              {d.paga && (
                                <DropdownMenuItem onClick={() => handleCancelPayment(d.id)} disabled={blocked}>
                                  <XCircle className="mr-2 h-3 w-3" /> Cancelar Pagamento
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => { setDeleteIds([d.id]); setDeleteConfirmOpen(true); }}
                                disabled={blocked || d.is_cartao}
                              >
                                <Trash2 className="mr-2 h-3 w-3" /> Excluir
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
                  <tr className="bg-muted/50 font-semibold">
                    <td colSpan={8} className="px-3 py-2 text-right">Total:</td>
                    <td className="px-3 py-2 text-destructive">{formatCurrency(total)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pay Modal */}
      <PayModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        onConfirm={(dt, ct) => handlePay(payIds, dt, ct)}
        contas={contas}
        title="Pagar Despesa(s)"
        confirmLabel="Confirmar Pagamento"
      />

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteIds.length} despesa(s)? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(deleteIds)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
