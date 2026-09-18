import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Tags, Pencil, Trash2, Lock, Unlock, X, Check, Filter, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { normalizeCategoryLabel } from '@/lib/credit-card-category';
import { Label } from '@/components/ui/label';
import {
  CLASSIFICACAO_OPTIONS,
  CLASSIFICACAO_PADRAO,
  getClassificacaoLabel,
  type Classificacao,
} from '@/lib/classificacao';

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

type Categoria = { id: string; nome: string };
type Subcategoria = {
  id: string; nome: string; categoria_id: string; bloqueada: boolean | null; obrigatoria: boolean | null; subcategoria_padrao: boolean | null;
  classificacao: Classificacao;
  categorias?: { nome: string } | null;
};

type StatusFilter = 'todas' | 'ativas' | 'bloqueadas';
type ClassificacaoFilter = 'todas' | Classificacao;
type SortKey = 'nome' | 'categoria';
type SortDirection = 'asc' | 'desc';

export default function Subcategorias() {
  const { user } = useAuth();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [classificacao, setClassificacao] = useState<Classificacao>(CLASSIFICACAO_PADRAO);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCategoriaId, setEditCategoriaId] = useState('');
  const [editClassificacao, setEditClassificacao] = useState<Classificacao>(CLASSIFICACAO_PADRAO);
  const [loading, setLoading] = useState(false);
  const [filterNome, setFilterNome] = useState('');
  const [filterCategoriaId, setFilterCategoriaId] = useState('todas');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('todas');
  const [filterClassificacao, setFilterClassificacao] = useState<ClassificacaoFilter>('todas');
  const [sortKey, setSortKey] = useState<SortKey>('nome');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const fetchData = async () => {
    if (!user) return;
    const [{ data: cats }, { data: subs }] = await Promise.all([
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id, bloqueada, obrigatoria, subcategoria_padrao, classificacao, categorias(nome)').eq('usuario_id', user.id).order('nome'),
    ]);
    if (cats) setCategorias(cats);
    if (subs) setSubcategorias(subs as unknown as Subcategoria[]);
  };

  useEffect(() => { fetchData(); }, [user]);

  const getCatNome = (catId: string) => categorias.find(c => c.id === catId)?.nome ?? '-';

  const filteredSubcategorias = useMemo(() => {
    const normalizedName = normalizeCategoryLabel(filterNome);

    return subcategorias
      .filter((sub) => {
        if (normalizedName && !normalizeCategoryLabel(sub.nome).includes(normalizedName)) return false;
        if (filterCategoriaId !== 'todas' && sub.categoria_id !== filterCategoriaId) return false;
        if (filterStatus === 'ativas' && sub.bloqueada) return false;
        if (filterStatus === 'bloqueadas' && !sub.bloqueada) return false;
        if (filterClassificacao !== 'todas' && sub.classificacao !== filterClassificacao) return false;
        return true;
      })
      .sort((left, right) => {
        const leftValue = sortKey === 'categoria' ? getCatNome(left.categoria_id) : left.nome;
        const rightValue = sortKey === 'categoria' ? getCatNome(right.categoria_id) : right.nome;
        const result = leftValue.localeCompare(rightValue, 'pt-BR', { sensitivity: 'base' });
        return sortDirection === 'asc' ? result : -result;
      });
  }, [subcategorias, filterNome, filterCategoriaId, filterStatus, filterClassificacao, sortKey, sortDirection, categorias]);

  const hasActiveFilters =
    filterNome.trim() !== '' || filterCategoriaId !== 'todas' || filterStatus !== 'todas' || filterClassificacao !== 'todas';

  const clearFilters = () => {
    setFilterNome('');
    setFilterCategoriaId('todas');
    setFilterStatus('todas');
    setFilterClassificacao('todas');
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
    if (!user || !nome.trim() || !categoriaId) return;
    const formatted = toTitleCase(nome.trim());
    // Duplicate check
    const existing = subcategorias.find(
      (s) => normalizeCategoryLabel(s.nome) === normalizeCategoryLabel(formatted) && s.categoria_id === categoriaId,
    );
    if (existing) { toast.error('Subcategoria já existe nesta categoria.'); return; }
    setLoading(true);
    const { error } = await supabase.from('subcategorias').insert({ nome: formatted, categoria_id: categoriaId, usuario_id: user.id, classificacao });
    if (error) toast.error('Erro ao cadastrar');
    else {
      toast.success('Subcategoria cadastrada!');
      setNome('');
      setCategoriaId('');
      setClassificacao(CLASSIFICACAO_PADRAO);
      fetchData();
    }
    setLoading(false);
  };

  const handleEdit = async (id: string) => {
    if (!editNome.trim() || !editCategoriaId) return;
    const formatted = toTitleCase(editNome.trim());
    const dup = subcategorias.find(
      (s) => s.id !== id && normalizeCategoryLabel(s.nome) === normalizeCategoryLabel(formatted) && s.categoria_id === editCategoriaId,
    );
    if (dup) { toast.error('Subcategoria já existe nesta categoria.'); return; }
    setLoading(true);
    const { error } = await supabase.from('subcategorias').update({ nome: formatted, categoria_id: editCategoriaId, classificacao: editClassificacao }).eq('id', id);
    if (error) toast.error('Erro ao editar');
    else { toast.success('Subcategoria atualizada!'); setEditId(null); fetchData(); }
    setLoading(false);
  };

  const handleDelete = async (sub: Subcategoria) => {
    if (sub.obrigatoria) { toast.error('Subcategoria obrigatória não pode ser excluída.'); return; }
    const [{ count: dCount }, { count: rCount }] = await Promise.all([
      supabase.from('despesas').select('id', { count: 'exact', head: true }).eq('subcategoria_id', sub.id),
      supabase.from('receitas').select('id', { count: 'exact', head: true }).eq('subcategoria_id', sub.id),
    ]);
    if ((dCount ?? 0) > 0 || (rCount ?? 0) > 0) {
      toast.error('Subcategoria em uso — não pode ser excluída.');
      return;
    }
    const { error } = await supabase.from('subcategorias').delete().eq('id', sub.id);
    if (error) toast.error('Erro ao excluir');
    else { toast.success('Subcategoria excluída!'); fetchData(); }
  };

  const handleToggleBlock = async (sub: Subcategoria) => {
    if (sub.obrigatoria) { toast.error('Subcategoria obrigatória não pode ser bloqueada.'); return; }
    const { error } = await supabase.from('subcategorias').update({ bloqueada: !sub.bloqueada }).eq('id', sub.id);
    if (error) toast.error('Erro');
    else { toast.success(sub.bloqueada ? 'Desbloqueada!' : 'Bloqueada!'); fetchData(); }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUp className="h-3.5 w-3.5 opacity-25" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Subcategorias</h1>
        <p className="text-muted-foreground">Gerencie suas subcategorias</p>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Plus className="h-5 w-5" />
            </span>
            Nova Subcategoria
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,0.9fr)_minmax(180px,0.7fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="nova-subcategoria" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Nome
              </Label>
              <Input
                id="nova-subcategoria"
                placeholder="Nome da subcategoria"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Classificação</Label>
              <Select value={classificacao} onValueChange={(value) => setClassificacao(value as Classificacao)}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASSIFICACAO_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={loading || !nome.trim() || !categoriaId} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
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
                <p className="mt-1 text-sm text-muted-foreground">Refine por nome, categoria, classificação e status.</p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
              {filteredSubcategorias.length} de {subcategorias.length} subcategorias
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(160px,0.7fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="subcategoria-nome-filter" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Nome
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="subcategoria-nome-filter"
                  value={filterNome}
                  onChange={(event) => setFilterNome(event.target.value)}
                  placeholder="Buscar subcategoria"
                  className="h-11 rounded-xl border-slate-200 bg-white pl-9 shadow-sm transition hover:border-primary/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Categoria</Label>
              <Select value={filterCategoriaId} onValueChange={setFilterCategoriaId}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Classificação</Label>
              <Select value={filterClassificacao} onValueChange={(value) => setFilterClassificacao(value as ClassificacaoFilter)}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {CLASSIFICACAO_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
              <Tags className="h-5 w-5" />
            </span>
            Suas subcategorias
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters && (
              <Badge variant="outline" className="rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
                Filtros ativos
              </Badge>
            )}
            <p className="text-sm text-muted-foreground">
              {filteredSubcategorias.length} exibidas
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {subcategorias.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Nenhuma subcategoria cadastrada.</div>
          ) : filteredSubcategorias.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              Nenhuma subcategoria encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleSort('nome')}
                        className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground"
                      >
                        Nome
                        <SortIcon column="nome" />
                      </button>
                    </th>
                    <th className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleSort('categoria')}
                        className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground"
                      >
                        Categoria
                        <SortIcon column="categoria" />
                      </button>
                    </th>
                    <th className="px-4 py-2.5">Classificação</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubcategorias.map((sub) => (
                    <tr key={sub.id} className="border-b transition hover:bg-primary/5">
                      <td className="px-4 py-2">
                        {editId === sub.id ? (
                          <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 max-w-xs rounded-lg" />
                        ) : (
                          <span className="font-medium">{sub.nome}</span>
                        )}
                        {sub.obrigatoria && <Badge variant="secondary" className="ml-2 h-5 rounded-full px-2 text-[11px]">Obrigatória</Badge>}
                        {sub.subcategoria_padrao && <Badge variant="outline" className="ml-1 h-5 rounded-full px-2 text-[11px]">Padrão</Badge>}
                      </td>
                      <td className="px-4 py-2">
                        {editId === sub.id ? (
                          <Select value={editCategoriaId} onValueChange={setEditCategoriaId}>
                            <SelectTrigger className="h-8 w-[180px] rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{getCatNome(sub.categoria_id)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {editId === sub.id ? (
                          <Select value={editClassificacao} onValueChange={(value) => setEditClassificacao(value as Classificacao)}>
                            <SelectTrigger className="h-8 w-[140px] rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CLASSIFICACAO_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="h-5 rounded-full px-2 text-[11px]">{getClassificacaoLabel(sub.classificacao)}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {sub.bloqueada ? (
                          <Badge variant="destructive" className="h-5 rounded-full px-2 text-[11px]">Bloqueada</Badge>
                        ) : (
                          <Badge variant="default" className="h-5 rounded-full bg-green-600 px-2 text-[11px]">Ativa</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {editId === sub.id ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-emerald-50 hover:text-emerald-700" onClick={() => handleEdit(sub.id)}><Check className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" disabled={!!sub.obrigatoria} onClick={() => { setEditId(sub.id); setEditNome(sub.nome); setEditCategoriaId(sub.categoria_id); setEditClassificacao(sub.classificacao); }}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-700" disabled={!!sub.obrigatoria} onClick={() => handleDelete(sub)}><Trash2 className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-slate-100" disabled={!!sub.obrigatoria} onClick={() => handleToggleBlock(sub)}>
                                {sub.bloqueada ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
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
