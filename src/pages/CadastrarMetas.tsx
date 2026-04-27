import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Target, Plus, Pencil, Trash2, Check, X, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency, parseCurrencyInput, getMonthName } from '@/lib/financial';

type MetaNatureza = 'receita' | 'despesa';
type MetaTipo = 'receita' | 'despesa' | 'categoria';

type Meta = {
  id: string;
  tipo: MetaTipo | null;
  natureza?: MetaNatureza | null;
  mes_ano: string;
  valor: number;
  categoria_id: string | null;
};

type Categoria = { id: string; nome: string };

type FilterState = {
  compInicio: string;
  compFim: string;
  ano: string;
  tipo: string;
  natureza: string;
  categoriaId: string;
};

const PAGE_SIZE = 15;
const ALL = 'all';

const getMetaNatureza = (meta: Pick<Meta, 'tipo' | 'natureza'>): MetaNatureza =>
  meta.natureza ?? (meta.tipo === 'receita' ? 'receita' : 'despesa');

const getMetaDisplayName = (meta: Pick<Meta, 'tipo' | 'natureza' | 'categoria_id'>, categoryName?: string) => {
  const natureza = getMetaNatureza(meta);
  if (meta.tipo === 'receita') return 'Meta de receita';
  if (meta.tipo === 'despesa') return 'Orçamento de despesas';
  if (natureza === 'receita') return categoryName ? `Meta de ${categoryName}` : 'Meta por categoria';
  return categoryName ? `Orçamento de ${categoryName}` : 'Orçamento por categoria';
};

const formatCompetencia = (competencia: string) => {
  const [year, month] = competencia.split('-');
  return `${getMonthName(Number(month) - 1)}/${year}`;
};

export default function CadastrarMetas() {
  const { user } = useAuth();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [tipo, setTipo] = useState<MetaTipo>('despesa');
  const [natureza, setNatureza] = useState<MetaNatureza>('despesa');
  const [categoriaId, setCategoriaId] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [modo, setModo] = useState<'mes' | 'ano'>('mes');
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));

  const [filterCompInicio, setFilterCompInicio] = useState('');
  const [filterCompFim, setFilterCompFim] = useState('');
  const [filterAno, setFilterAno] = useState(ALL);
  const [filterTipo, setFilterTipo] = useState(ALL);
  const [filterNatureza, setFilterNatureza] = useState(ALL);
  const [filterCategoria, setFilterCategoria] = useState(ALL);
  const [appliedFilters, setAppliedFilters] = useState<FilterState | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editValorStr, setEditValorStr] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);

  const catMap = useMemo(() => {
    const map: Record<string, string> = {};
    categorias.forEach(c => { map[c.id] = c.nome; });
    return map;
  }, [categorias]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showingFrom = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PAGE_SIZE, totalCount);

  const fetchCategorias = async () => {
    if (!user) return;
    const { data } = await supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome');
    if (data) setCategorias(data);
  };

  useEffect(() => { fetchCategorias(); }, [user]);

  const buildMetasQuery = (filters: FilterState) => {
    let query = supabase
      .from('metas')
      .select('*', { count: 'exact' })
      .eq('usuario_id', user!.id);

    if (filters.compInicio) query = query.gte('mes_ano', filters.compInicio);
    if (filters.compFim) query = query.lte('mes_ano', filters.compFim);
    if (filters.ano !== ALL) {
      query = query.gte('mes_ano', `${filters.ano}-01`).lte('mes_ano', `${filters.ano}-12`);
    }
    if (filters.tipo !== ALL) query = query.eq('tipo', filters.tipo);
    if (filters.natureza !== ALL) {
      if (filters.natureza === 'despesa') query = query.or('natureza.is.null,natureza.eq.despesa');
      else query = query.eq('natureza', filters.natureza);
    }
    if (filters.categoriaId !== ALL) query = query.eq('categoria_id', filters.categoriaId);

    return query.order('mes_ano', { ascending: false }).order('tipo', { ascending: true }).order('created_at', { ascending: false });
  };

  const fetchMetas = async (filters = appliedFilters, page = currentPage) => {
    if (!user || !filters) return;
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count, error } = await buildMetasQuery(filters).range(from, to);

    if (error) {
      toast.error('Erro ao consultar metas.');
      setLoading(false);
      return;
    }

    setMetas((data ?? []) as Meta[]);
    setTotalCount(count ?? 0);
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => {
    if (appliedFilters) fetchMetas(appliedFilters, currentPage);
  }, [currentPage]);

  const handleApplyFilters = () => {
    const filters = {
      compInicio: filterCompInicio,
      compFim: filterCompFim,
      ano: filterAno,
      tipo: filterTipo,
      natureza: filterNatureza,
      categoriaId: filterCategoria,
    };
    setAppliedFilters(filters);
    setCurrentPage(1);
    fetchMetas(filters, 1);
  };

  const handleClearFilters = () => {
    setFilterCompInicio('');
    setFilterCompFim('');
    setFilterAno(ALL);
    setFilterTipo(ALL);
    setFilterNatureza(ALL);
    setFilterCategoria(ALL);
    setAppliedFilters(null);
    setMetas([]);
    setTotalCount(0);
    setSelectedIds(new Set());
    setCurrentPage(1);
  };

  const duplicateExists = async (comp: string) => {
    let query = supabase
      .from('metas')
      .select('id')
      .eq('usuario_id', user!.id)
      .eq('mes_ano', comp)
      .eq('tipo', tipo)
      .limit(1);

    if (tipo === 'categoria') {
      query = query.eq('categoria_id', categoriaId);
      if (natureza === 'despesa') query = query.or('natureza.is.null,natureza.eq.despesa');
      else query = query.eq('natureza', natureza);
    }

    const { data } = await query;
    return Boolean(data?.length);
  };

  const handleAdd = async () => {
    if (!user || !valorStr.trim()) return;
    const valor = parseCurrencyInput(valorStr);
    if (valor <= 0) { toast.error('Valor inválido.'); return; }
    if (tipo === 'categoria' && !categoriaId) { toast.error('Selecione uma categoria.'); return; }

    setSaving(true);
    const competencias = modo === 'mes'
      ? [`${ano}-${mes.padStart(2, '0')}`]
      : Array.from({ length: 12 }, (_, index) => `${ano}-${String(index + 1).padStart(2, '0')}`);

    let created = 0;
    for (const comp of competencias) {
      if (await duplicateExists(comp)) continue;

      const metaNatureza = tipo === 'categoria' ? natureza : tipo;
      const { error } = await supabase.from('metas').insert({
        usuario_id: user.id,
        tipo,
        natureza: metaNatureza,
        mes_ano: comp,
        valor,
        categoria_id: tipo === 'categoria' ? categoriaId : null,
      } as any);
      if (!error) created++;
    }

    if (created > 0) toast.success(`${created} registro(s) criado(s)!`);
    else toast.info('Nenhum registro novo (duplicatas ignoradas).');
    setValorStr('');
    if (appliedFilters) fetchMetas(appliedFilters, currentPage);
    setSaving(false);
  };

  const handleEditSave = async (id: string) => {
    const valor = parseCurrencyInput(editValorStr);
    if (valor <= 0) { toast.error('Valor inválido.'); return; }
    const { error } = await supabase.from('metas').update({ valor }).eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar.');
      return;
    }
    toast.success('Registro atualizado!');
    setEditId(null);
    if (appliedFilters) fetchMetas(appliedFilters, currentPage);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('metas').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir.');
      return;
    }
    toast.success('Registro excluído!');
    if (appliedFilters) fetchMetas(appliedFilters, currentPage);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const { error } = await supabase.from('metas').delete().in('id', Array.from(selectedIds));
    if (error) {
      toast.error('Erro ao excluir registros selecionados.');
      return;
    }
    toast.success(`${selectedIds.size} registro(s) excluído(s)!`);
    setSelectedIds(new Set());
    if (appliedFilters) fetchMetas(appliedFilters, currentPage);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleTipoChange = (nextTipo: MetaTipo) => {
    setTipo(nextTipo);
    if (nextTipo === 'receita') setNatureza('receita');
    if (nextTipo === 'despesa') setNatureza('despesa');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Cadastrar Metas</h1>
        <p className="text-muted-foreground">Defina metas de receita e orçamentos de despesa.</p>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Plus className="h-5 w-5" />
            </span>
            Nova meta ou orçamento
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(140px,0.8fr)_minmax(160px,0.8fr)_minmax(190px,1fr)_minmax(140px,0.8fr)_minmax(150px,0.8fr)_minmax(130px,0.6fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tipo</Label>
              <Select value={tipo} onValueChange={(value) => handleTipoChange(value as MetaTipo)}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="categoria">Categoria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipo === 'categoria' && (
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Natureza</Label>
                <Select value={natureza} onValueChange={(value) => setNatureza(value as MetaNatureza)}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {tipo === 'categoria' && (
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Categoria</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Valor</Label>
              <Input placeholder="0,00" value={valorStr} onChange={(e) => setValorStr(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white shadow-sm" />
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Período</Label>
              <Select value={modo} onValueChange={(value) => setModo(value as 'mes' | 'ano')}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">Mês específico</SelectItem>
                  <SelectItem value="ano">Ano inteiro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {modo === 'mes' ? (
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mês</Label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{getMonthName(i)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ano</Label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <Button onClick={handleAdd} disabled={saving} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
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
                <p className="mt-1 text-sm text-muted-foreground">Use competência, tipo e natureza para consultar os registros cadastrados.</p>
              </div>
            </div>
            {appliedFilters && (
              <Badge variant="outline" className="w-fit rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
                {totalCount} resultado(s)
              </Badge>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(120px,0.6fr)_minmax(140px,0.7fr)_minmax(140px,0.7fr)_minmax(190px,1fr)_auto_auto] xl:items-end">
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Competência inicial</Label>
              <Input type="month" value={filterCompInicio} onChange={(e) => setFilterCompInicio(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white shadow-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Competência final</Label>
              <Input type="month" value={filterCompFim} onChange={(e) => setFilterCompFim(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white shadow-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ano</Label>
              <Select value={filterAno} onValueChange={setFilterAno}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tipo</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="categoria">Categoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Natureza</Label>
              <Select value={filterNatureza} onValueChange={setFilterNatureza}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Categoria</Label>
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleApplyFilters} disabled={loading} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
              Filtrar
            </Button>
            <Button variant="outline" onClick={handleClearFilters} disabled={loading && !appliedFilters} className="h-11 rounded-xl border-slate-200 bg-white px-4 shadow-sm">
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </span>
            Metas e orçamentos cadastrados
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected} className="h-9 rounded-lg">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir {selectedIds.size}
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              {appliedFilters ? `${showingFrom}-${showingTo} de ${totalCount}` : 'Aguardando consulta'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!appliedFilters ? (
            <div className="m-5 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Use os filtros para consultar as metas e orçamentos cadastrados.
            </div>
          ) : loading ? (
            <div className="m-5 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Consultando registros...
            </div>
          ) : metas.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Nenhum registro encontrado para os filtros selecionados.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="px-4 py-2.5 w-10">
                        <Checkbox
                          checked={selectedIds.size === metas.length && metas.length > 0}
                          onCheckedChange={(checked) => { if (checked) setSelectedIds(new Set(metas.map(m => m.id))); else setSelectedIds(new Set()); }}
                        />
                      </th>
                      <th className="px-4 py-2.5">Competência</th>
                      <th className="px-4 py-2.5">Registro</th>
                      <th className="px-4 py-2.5">Natureza</th>
                      <th className="px-4 py-2.5">Categoria</th>
                      <th className="px-4 py-2.5 text-right">Valor</th>
                      <th className="px-4 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metas.map(m => {
                      const categoryName = m.categoria_id ? catMap[m.categoria_id] ?? '-' : '-';
                      const naturezaMeta = getMetaNatureza(m);
                      return (
                        <tr key={m.id} className="border-b transition hover:bg-primary/5">
                          <td className="px-4 py-2"><Checkbox checked={selectedIds.has(m.id)} onCheckedChange={() => toggleSelect(m.id)} /></td>
                          <td className="px-4 py-2">{formatCompetencia(m.mes_ano)}</td>
                          <td className="px-4 py-2 font-medium">{getMetaDisplayName(m, categoryName === '-' ? undefined : categoryName)}</td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className={naturezaMeta === 'receita' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                              {naturezaMeta === 'receita' ? 'Meta' : 'Orçamento'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">{categoryName}</td>
                          <td className="px-4 py-2 text-right font-medium">
                            {editId === m.id ? (
                              <Input value={editValorStr} onChange={(e) => setEditValorStr(e.target.value)} className="ml-auto h-8 w-[120px] rounded-lg text-right" />
                            ) : formatCurrency(m.valor)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {editId === m.id ? (
                              <div className="flex gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => handleEditSave(m.id)}><Check className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { setEditId(m.id); setEditValorStr(m.valor.toFixed(2).replace('.', ',')); }}><Pencil className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-700" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
