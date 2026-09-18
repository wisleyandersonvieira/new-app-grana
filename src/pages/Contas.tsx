import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Wallet, Pencil, Trash2, Lock, Unlock, X, Filter, Search, ArrowUp, ArrowDown, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/financial';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ContaFormDialog } from '@/components/ContaFormDialog';
import { ContaDetalheDialog } from '@/components/ContaDetalheDialog';
import { calcularSaldosContas, getTodayIsoDate } from '@/lib/saldo-contas';
import { useOnTabActivate } from '@/hooks/useOnTabActivate';

type Conta = {
  id: string;
  nome: string;
  tipo: string;
  saldo_inicial: number | null;
  data_saldo_inicial: string | null;
  bloqueada: boolean | null;
  created_at: string | null;
  usuario_id: string;
};

type SaldoInfo = { saldo: number; ultimaMovimentacao: string | null };

type StatusFilter = 'todas' | 'ativas' | 'bloqueadas';
type SortKey = 'nome' | 'tipo' | 'saldo' | 'ultimaMovimentacao';
type SortDirection = 'asc' | 'desc';

const getTipoLabel = (tipo: string) => {
  if (tipo === 'cartao') return 'Cartão de Crédito';
  if (tipo === 'conta') return 'Conta';
  return tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : '-';
};

const formatIsoDate = (date: string | null) => {
  if (!date) return '—';
  const [year, month, day] = date.slice(0, 10).split('-');
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
};

export default function Contas() {
  const { user } = useAuth();
  // Duas abas na mesma tela duplicariam ids fixos no DOM: useId mantém cada painel independente.
  const filtroNomeId = useId();
  const [contas, setContas] = useState<Conta[]>([]);
  const [saldos, setSaldos] = useState<Record<string, SaldoInfo>>({});
  const [saldosLoading, setSaldosLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterNome, setFilterNome] = useState('');
  const [filterTipo, setFilterTipo] = useState('todas');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('todas');
  const [sortKey, setSortKey] = useState<SortKey>('nome');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [formOpen, setFormOpen] = useState(false);
  const [contaEmEdicao, setContaEmEdicao] = useState<Conta | null>(null);
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [contaEmDetalhe, setContaEmDetalhe] = useState<Conta | null>(null);

  const fetchContas = useCallback(async () => {
    if (!user) return [];
    const { data } = await supabase
      .from('contas')
      .select('id, nome, tipo, saldo_inicial, data_saldo_inicial, bloqueada, created_at, usuario_id')
      .eq('usuario_id', user.id)
      .order('nome');
    const lista = data ?? [];
    setContas(lista);
    return lista;
  }, [user]);

  /** Saldo atual pela mesma fonte do relatório Saldo de Contas, com a data de hoje. */
  const loadSaldos = useCallback(async (lista: Conta[]) => {
    if (!user || lista.length === 0) {
      setSaldos({});
      return;
    }

    setSaldosLoading(true);
    try {
      const calculados = await calcularSaldosContas(user.id, getTodayIsoDate(), lista);
      setSaldos(Object.fromEntries(calculados.map((item) => [
        item.id,
        { saldo: item.saldo, ultimaMovimentacao: item.ultimaMovimentacao },
      ])));
    } catch {
      toast.error('Não foi possível calcular os saldos atuais.');
    } finally {
      setSaldosLoading(false);
    }
  }, [user]);

  const reload = useCallback(async () => {
    const lista = await fetchContas();
    await loadSaldos(lista);
  }, [fetchContas, loadSaldos]);

  useEffect(() => { void reload(); }, [reload]);

  // Voltar para esta aba recalcula os saldos com os lançamentos feitos em outras abas.
  useOnTabActivate(() => { void reload(); });

  const tipoOptions = useMemo(() => {
    const tipos = new Set(contas.map((conta) => conta.tipo).filter(Boolean));
    tipos.add('conta');
    tipos.add('cartao');
    return Array.from(tipos).sort((left, right) => getTipoLabel(left).localeCompare(getTipoLabel(right), 'pt-BR'));
  }, [contas]);

  const filteredContas = useMemo(() => {
    const normalizedName = filterNome.trim().toLocaleLowerCase('pt-BR');

    const compare = (left: Conta, right: Conta) => {
      if (sortKey === 'saldo') return (saldos[left.id]?.saldo ?? 0) - (saldos[right.id]?.saldo ?? 0);
      if (sortKey === 'ultimaMovimentacao') {
        return (saldos[left.id]?.ultimaMovimentacao ?? '').localeCompare(saldos[right.id]?.ultimaMovimentacao ?? '');
      }
      const leftValue = sortKey === 'tipo' ? getTipoLabel(left.tipo) : left.nome;
      const rightValue = sortKey === 'tipo' ? getTipoLabel(right.tipo) : right.nome;
      return leftValue.localeCompare(rightValue, 'pt-BR', { sensitivity: 'base' });
    };

    return contas
      .filter((conta) => {
        if (normalizedName && !conta.nome.toLocaleLowerCase('pt-BR').includes(normalizedName)) return false;
        if (filterTipo !== 'todas' && conta.tipo !== filterTipo) return false;
        if (filterStatus === 'ativas' && conta.bloqueada) return false;
        if (filterStatus === 'bloqueadas' && !conta.bloqueada) return false;
        return true;
      })
      .sort((left, right) => {
        const result = compare(left, right);
        return sortDirection === 'asc' ? result : -result;
      });
  }, [contas, saldos, filterNome, filterTipo, filterStatus, sortKey, sortDirection]);

  const activeFilterCount =
    (filterNome.trim() !== '' ? 1 : 0) + (filterTipo !== 'todas' ? 1 : 0) + (filterStatus !== 'todas' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = () => {
    setFilterNome('');
    setFilterTipo('todas');
    setFilterStatus('todas');
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const openCreate = () => {
    setContaEmEdicao(null);
    setFormOpen(true);
  };

  const openEdit = (conta: Conta) => {
    setContaEmEdicao(conta);
    setFormOpen(true);
  };

  const openDetalhe = (conta: Conta) => {
    setContaEmDetalhe(conta);
    setDetalheOpen(true);
  };

  const handleDelete = async (conta: Conta) => {
    const [{ count: dCount }, { count: rCount }, { count: tCount }, { count: fCount }, { count: sCount }, { count: iCount }] = await Promise.all([
      supabase.from('despesas').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id),
      supabase.from('receitas').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id),
      supabase.from('transferencias').select('id', { count: 'exact', head: true }).or(`conta_origem_id.eq.${conta.id},conta_destino_id.eq.${conta.id}`),
      supabase.from('faturas_cartao').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id),
      supabase.from('categorias_sugeridas_cartao').select('id', { count: 'exact', head: true }).eq('cartao_id', conta.id),
      supabase.from('importacoes_fatura_pdf').select('id', { count: 'exact', head: true }).eq('cartao_id', conta.id),
    ]);
    if ((dCount ?? 0) > 0 || (rCount ?? 0) > 0 || (tCount ?? 0) > 0 || (fCount ?? 0) > 0 || (sCount ?? 0) > 0 || (iCount ?? 0) > 0) {
      toast.error('Esta conta não pode ser excluída porque possui movimentações cadastradas.');
      return;
    }
    const { error } = await supabase.from('contas').delete().eq('id', conta.id);
    if (error) toast.error('Esta conta não pode ser excluída porque possui movimentações cadastradas.');
    else { toast.success('Conta excluída!'); void reload(); }
  };

  const handleToggleBlock = async (conta: Conta) => {
    const { error } = await supabase.from('contas').update({ bloqueada: !conta.bloqueada }).eq('id', conta.id);
    if (error) toast.error('Erro');
    else { toast.success(conta.bloqueada ? 'Conta desbloqueada!' : 'Conta bloqueada!'); void reload(); }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUp className="h-3.5 w-3.5 opacity-25" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const renderSaldo = (contaId: string) => {
    const saldo = saldos[contaId]?.saldo;
    if (saldo == null) {
      return <span className="text-muted-foreground">{saldosLoading ? '…' : '—'}</span>;
    }
    return <span className={cn('font-medium', saldo < 0 && 'text-red-600')}>{formatCurrency(saldo)}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Contas</h1>
            <p className="text-muted-foreground">Gerencie suas contas e cartões</p>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl border-slate-200 bg-white px-4 shadow-sm sm:flex-none"
              >
                <Filter className="mr-2 h-4 w-4" />
                Filtros
                {!filtersOpen && activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>

            <Button
              type="button"
              onClick={openCreate}
              className="h-11 flex-1 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20 sm:flex-none"
            >
              <Plus className="mr-2 h-4 w-4" />
              Cadastrar conta
            </Button>
          </div>
        </div>

        <CollapsibleContent className="mt-4">
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.8fr)_minmax(160px,0.7fr)_auto] lg:items-end">
                <div className="space-y-2">
                  <Label htmlFor={filtroNomeId} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Nome
                  </Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id={filtroNomeId}
                      value={filterNome}
                      onChange={(event) => setFilterNome(event.target.value)}
                      placeholder="Buscar conta"
                      className="h-11 rounded-xl border-slate-200 bg-white pl-9 shadow-sm transition hover:border-primary/30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tipo</Label>
                  <Select value={filterTipo} onValueChange={setFilterTipo}>
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {tipoOptions.map((option) => (
                        <SelectItem key={option} value={option}>{getTipoLabel(option)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</Label>
                  <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as StatusFilter)}>
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="ativas">Ativas</SelectItem>
                      <SelectItem value="bloqueadas">Bloqueadas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasActiveFilters} className="h-11 rounded-xl border-slate-200 bg-white px-4 shadow-sm">
                  <X className="mr-2 h-4 w-4" />
                  Limpar
                </Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </span>
            Suas contas
          </CardTitle>
          <Badge variant="outline" className="w-fit rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
            {filteredContas.length} de {contas.length} contas
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {contas.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Nenhuma conta cadastrada.</div>
          ) : filteredContas.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              Nenhuma conta encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-2.5">
                      <button type="button" onClick={() => toggleSort('nome')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                        Nome
                        <SortIcon column="nome" />
                      </button>
                    </th>
                    <th className="px-4 py-2.5">
                      <button type="button" onClick={() => toggleSort('tipo')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                        Tipo
                        <SortIcon column="tipo" />
                      </button>
                    </th>
                    <th className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => toggleSort('saldo')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                        Saldo atual
                        <SortIcon column="saldo" />
                      </button>
                    </th>
                    <th className="px-4 py-2.5">
                      <button type="button" onClick={() => toggleSort('ultimaMovimentacao')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                        Última movimentação
                        <SortIcon column="ultimaMovimentacao" />
                      </button>
                    </th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContas.map((conta) => (
                    <tr key={conta.id} className="border-b transition hover:bg-primary/5">
                      <td className="px-4 py-2"><span className="font-medium">{conta.nome}</span></td>
                      <td className="px-4 py-2">{getTipoLabel(conta.tipo)}</td>
                      <td className="px-4 py-2 text-right">{renderSaldo(conta.id)}</td>
                      <td className="px-4 py-2">{formatIsoDate(saldos[conta.id]?.ultimaMovimentacao ?? null)}</td>
                      <td className="px-4 py-2">
                        {conta.bloqueada ? <Badge variant="destructive" className="h-5 rounded-full px-2 text-[11px]">Bloqueada</Badge> : <Badge variant="default" className="h-5 rounded-full bg-green-600 px-2 text-[11px]">Ativa</Badge>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-slate-100 hover:text-foreground" onClick={() => openDetalhe(conta)} title="Visualizar" aria-label={`Visualizar ${conta.nome}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" onClick={() => openEdit(conta)} title="Editar" aria-label={`Editar ${conta.nome}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-700" onClick={() => handleDelete(conta)} title="Excluir" aria-label={`Excluir ${conta.nome}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-slate-100" onClick={() => handleToggleBlock(conta)} title={conta.bloqueada ? 'Desbloquear' : 'Bloquear'} aria-label={conta.bloqueada ? `Desbloquear ${conta.nome}` : `Bloquear ${conta.nome}`}>
                            {conta.bloqueada ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {user && (
        <ContaFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          conta={contaEmEdicao}
          userId={user.id}
          onSaved={reload}
        />
      )}

      <ContaDetalheDialog
        open={detalheOpen}
        onOpenChange={setDetalheOpen}
        conta={contaEmDetalhe}
        saldoAtual={contaEmDetalhe ? saldos[contaEmDetalhe.id]?.saldo ?? null : null}
        ultimaMovimentacao={contaEmDetalhe ? saldos[contaEmDetalhe.id]?.ultimaMovimentacao ?? null : null}
        getTipoLabel={getTipoLabel}
        formatIsoDate={formatIsoDate}
        onEdit={() => {
          setDetalheOpen(false);
          if (contaEmDetalhe) openEdit(contaEmDetalhe);
        }}
      />
    </div>
  );
}
