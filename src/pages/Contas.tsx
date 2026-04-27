import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Wallet, Pencil, Trash2, Lock, Unlock, X, Check, Filter, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, parseCurrencyInput } from '@/lib/financial';
import { Label } from '@/components/ui/label';

type Conta = {
  id: string; nome: string; tipo: string; saldo_inicial: number | null; data_saldo_inicial: string | null; bloqueada: boolean | null;
};

type StatusFilter = 'todas' | 'ativas' | 'bloqueadas';
type SortKey = 'nome' | 'tipo' | 'dataSaldo';
type SortDirection = 'asc' | 'desc';

const getTipoLabel = (tipo: string) => {
  if (tipo === 'cartao') return 'Cartão de Crédito';
  if (tipo === 'conta') return 'Conta';
  return tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : '-';
};

const formatDisplayDate = (date: string | null) => {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}-${month}-${year}`;
};

export default function Contas() {
  const { user } = useAuth();
  const [contas, setContas] = useState<Conta[]>([]);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('conta');
  const [saldoStr, setSaldoStr] = useState('');
  const [dataSaldo, setDataSaldo] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editTipo, setEditTipo] = useState('');
  const [editSaldoStr, setEditSaldoStr] = useState('');
  const [editDataSaldo, setEditDataSaldo] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterNome, setFilterNome] = useState('');
  const [filterTipo, setFilterTipo] = useState('todas');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('todas');
  const [sortKey, setSortKey] = useState<SortKey>('nome');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const fetchContas = async () => {
    if (!user) return;
    const { data } = await supabase.from('contas').select('id, nome, tipo, saldo_inicial, data_saldo_inicial, bloqueada').eq('usuario_id', user.id).order('nome');
    if (data) setContas(data);
  };

  useEffect(() => { fetchContas(); }, [user]);

  const tipoOptions = useMemo(() => {
    const tipos = new Set(contas.map((conta) => conta.tipo).filter(Boolean));
    tipos.add('conta');
    tipos.add('cartao');
    return Array.from(tipos).sort((left, right) => getTipoLabel(left).localeCompare(getTipoLabel(right), 'pt-BR'));
  }, [contas]);

  const filteredContas = useMemo(() => {
    const normalizedName = filterNome.trim().toLocaleLowerCase('pt-BR');

    return contas
      .filter((conta) => {
        if (normalizedName && !conta.nome.toLocaleLowerCase('pt-BR').includes(normalizedName)) return false;
        if (filterTipo !== 'todas' && conta.tipo !== filterTipo) return false;
        if (filterStatus === 'ativas' && conta.bloqueada) return false;
        if (filterStatus === 'bloqueadas' && !conta.bloqueada) return false;
        return true;
      })
      .sort((left, right) => {
        const leftValue =
          sortKey === 'tipo' ? getTipoLabel(left.tipo) : sortKey === 'dataSaldo' ? left.data_saldo_inicial ?? '' : left.nome;
        const rightValue =
          sortKey === 'tipo' ? getTipoLabel(right.tipo) : sortKey === 'dataSaldo' ? right.data_saldo_inicial ?? '' : right.nome;
        const result = leftValue.localeCompare(rightValue, 'pt-BR', { sensitivity: 'base' });
        return sortDirection === 'asc' ? result : -result;
      });
  }, [contas, filterNome, filterTipo, filterStatus, sortKey, sortDirection]);

  const hasActiveFilters = filterNome.trim() !== '' || filterTipo !== 'todas' || filterStatus !== 'todas';

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

  const handleAdd = async () => {
    if (!user || !nome.trim() || !tipo) return;
    setLoading(true);
    const saldo = parseCurrencyInput(saldoStr);
    const { error } = await supabase.from('contas').insert({
      nome: nome.trim(), tipo, saldo_inicial: saldo, data_saldo_inicial: dataSaldo || null, usuario_id: user.id,
    });
    if (error) toast.error('Erro ao cadastrar conta');
    else { toast.success('Conta cadastrada!'); setNome(''); setSaldoStr(''); setDataSaldo(''); fetchContas(); }
    setLoading(false);
  };

  const handleEdit = async (id: string) => {
    if (!editNome.trim()) return;
    setLoading(true);
    const saldo = parseCurrencyInput(editSaldoStr);
    const { error } = await supabase.from('contas').update({
      nome: editNome.trim(), tipo: editTipo, saldo_inicial: saldo, data_saldo_inicial: editDataSaldo || null,
    }).eq('id', id);
    if (error) toast.error('Erro ao editar');
    else { toast.success('Conta atualizada!'); setEditId(null); fetchContas(); }
    setLoading(false);
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
    else { toast.success('Conta excluída!'); fetchContas(); }
  };

  const handleToggleBlock = async (conta: Conta) => {
    const { error } = await supabase.from('contas').update({ bloqueada: !conta.bloqueada }).eq('id', conta.id);
    if (error) toast.error('Erro');
    else { toast.success(conta.bloqueada ? 'Conta desbloqueada!' : 'Conta bloqueada!'); fetchContas(); }
  };

  const startEdit = (c: Conta) => {
    setEditId(c.id);
    setEditNome(c.nome);
    setEditTipo(c.tipo);
    setEditSaldoStr(c.saldo_inicial != null ? c.saldo_inicial.toFixed(2).replace('.', ',') : '');
    setEditDataSaldo(c.data_saldo_inicial ?? '');
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUp className="h-3.5 w-3.5 opacity-25" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Contas</h1>
        <p className="text-muted-foreground">Gerencie suas contas e cartões</p>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Plus className="h-5 w-5" />
            </span>
            Nova Conta
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,0.9fr)_minmax(140px,0.7fr)_minmax(160px,0.8fr)_auto] lg:items-end">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Nome</Label>
              <Input placeholder="Nome da conta" value={nome} onChange={(e) => setNome(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conta">Conta</SelectItem>
                  <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Saldo Inicial</Label>
              <Input placeholder="0,00" value={saldoStr} onChange={(e) => setSaldoStr(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Data Saldo</Label>
              <Input type="date" value={dataSaldo} onChange={(e) => setDataSaldo(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30" />
            </div>
            <Button onClick={handleAdd} disabled={loading || !nome.trim()} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Filtros</h2>
                <p className="mt-1 text-sm text-muted-foreground">Refine por nome, tipo e status.</p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
              {filteredContas.length} de {contas.length} contas
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.8fr)_minmax(160px,0.7fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="conta-nome-filter" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Nome
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="conta-nome-filter"
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

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </span>
            Suas contas
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters && (
              <Badge variant="outline" className="rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
                Filtros ativos
              </Badge>
            )}
            <p className="text-sm text-muted-foreground">{filteredContas.length} exibidas</p>
          </div>
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
                    <th className="px-4 py-2.5 text-right">Saldo Inicial</th>
                    <th className="px-4 py-2.5">
                      <button type="button" onClick={() => toggleSort('dataSaldo')} className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground">
                        Data Saldo
                        <SortIcon column="dataSaldo" />
                      </button>
                    </th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContas.map((c) => (
                    <tr key={c.id} className="border-b transition hover:bg-primary/5">
                      <td className="px-4 py-2">
                        {editId === c.id ? <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 w-[160px] rounded-lg" /> : <span className="font-medium">{c.nome}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {editId === c.id ? (
                          <Select value={editTipo} onValueChange={setEditTipo}>
                            <SelectTrigger className="h-8 w-[150px] rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="conta">Conta</SelectItem>
                              <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : getTipoLabel(c.tipo)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {editId === c.id ? <Input value={editSaldoStr} onChange={(e) => setEditSaldoStr(e.target.value)} className="h-8 w-[120px] rounded-lg text-right" /> : <span className="font-medium">{formatCurrency(c.saldo_inicial ?? 0)}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {editId === c.id ? <Input type="date" value={editDataSaldo} onChange={(e) => setEditDataSaldo(e.target.value)} className="h-8 w-[145px] rounded-lg" /> : formatDisplayDate(c.data_saldo_inicial)}
                      </td>
                      <td className="px-4 py-2">
                        {c.bloqueada ? <Badge variant="destructive" className="h-5 rounded-full px-2 text-[11px]">Bloqueada</Badge> : <Badge variant="default" className="h-5 rounded-full bg-green-600 px-2 text-[11px]">Ativa</Badge>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {editId === c.id ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-emerald-50 hover:text-emerald-700" onClick={() => handleEdit(c.id)}><Check className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-700" onClick={() => handleDelete(c)}><Trash2 className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-slate-100" onClick={() => handleToggleBlock(c)}>
                                {c.bloqueada ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                              </Button>
                            </>
                          )}
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
    </div>
  );
}
