import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Tags, Pencil, Trash2, Lock, Unlock, X, Check, Filter, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { normalizeCategoryLabel } from '@/lib/credit-card-category';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

function toTitleCase(str: string) {
  const lower = ['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com'];
  return str.replace(/\w\S*/g, (txt, offset) => {
    const word = txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
    if (offset > 0 && lower.includes(txt.toLowerCase())) return txt.toLowerCase();
    return word;
  });
}

type Categoria = {
  id: string;
  nome: string;
  bloqueada: boolean | null;
  obrigatoria: boolean | null;
  categoria_padrao: boolean | null;
};

type StatusFilter = 'todas' | 'ativas' | 'bloqueadas';
type SpecialFilter = 'todas' | 'padrao' | 'obrigatoria' | 'especial';
type SortDirection = 'asc' | 'desc';

export default function Categorias() {
  const { user } = useAuth();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nome, setNome] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterNome, setFilterNome] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('todas');
  const [filterSpecial, setFilterSpecial] = useState<SpecialFilter>('todas');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const fetchCategorias = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('categorias')
      .select('id, nome, bloqueada, obrigatoria, categoria_padrao')
      .eq('usuario_id', user.id)
      .order('nome');
    if (data) setCategorias(data);
  };

  useEffect(() => { fetchCategorias(); }, [user]);

  const filteredCategorias = useMemo(() => {
    const normalizedName = normalizeCategoryLabel(filterNome);

    return categorias
      .filter((categoria) => {
        if (normalizedName && !normalizeCategoryLabel(categoria.nome).includes(normalizedName)) return false;
        if (filterStatus === 'ativas' && categoria.bloqueada) return false;
        if (filterStatus === 'bloqueadas' && !categoria.bloqueada) return false;
        if (filterSpecial === 'padrao' && !categoria.categoria_padrao) return false;
        if (filterSpecial === 'obrigatoria' && !categoria.obrigatoria) return false;
        if (filterSpecial === 'especial' && !categoria.categoria_padrao && !categoria.obrigatoria) return false;
        return true;
      })
      .sort((left, right) => {
        const result = left.nome.localeCompare(right.nome, 'pt-BR', { sensitivity: 'base' });
        return sortDirection === 'asc' ? result : -result;
      });
  }, [categorias, filterNome, filterStatus, filterSpecial, sortDirection]);

  const hasActiveFilters = filterNome.trim() !== '' || filterStatus !== 'todas' || filterSpecial !== 'todas';

  const clearFilters = () => {
    setFilterNome('');
    setFilterStatus('todas');
    setFilterSpecial('todas');
  };

  const toggleNameSort = () => {
    setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
  };

  const handleAdd = async () => {
    if (!user || !nome.trim()) return;
    setLoading(true);
    const formatted = toTitleCase(nome.trim());
    const duplicate = categorias.find((categoria) => normalizeCategoryLabel(categoria.nome) === normalizeCategoryLabel(formatted));
    if (duplicate) {
      toast.error('Categoria já existe.');
      setLoading(false);
      return;
    }
    const { error } = await supabase.from('categorias').insert({ nome: formatted, usuario_id: user.id });
    if (error) toast.error('Erro ao cadastrar categoria');
    else { toast.success('Categoria cadastrada!'); setNome(''); fetchCategorias(); }
    setLoading(false);
  };

  const handleEdit = async (id: string) => {
    if (!editNome.trim()) return;
    setLoading(true);
    const formatted = toTitleCase(editNome.trim());
    const duplicate = categorias.find(
      (categoria) => categoria.id !== id && normalizeCategoryLabel(categoria.nome) === normalizeCategoryLabel(formatted),
    );
    if (duplicate) {
      toast.error('Categoria já existe.');
      setLoading(false);
      return;
    }
    const { error } = await supabase.from('categorias').update({ nome: formatted }).eq('id', id);
    if (error) { toast.error('Erro ao editar'); setLoading(false); return; }
    // Update nome in despesas/receitas is not needed — they reference by categoria_id FK
    toast.success('Categoria atualizada!');
    setEditId(null);
    fetchCategorias();
    setLoading(false);
  };

  const handleDelete = async (cat: Categoria) => {
    if (cat.obrigatoria) { toast.error('Categoria obrigatória não pode ser excluída.'); return; }
    // Check usage
    const [{ count: dCount }, { count: rCount }] = await Promise.all([
      supabase.from('despesas').select('id', { count: 'exact', head: true }).eq('categoria_id', cat.id),
      supabase.from('receitas').select('id', { count: 'exact', head: true }).eq('categoria_id', cat.id),
    ]);
    if ((dCount ?? 0) > 0 || (rCount ?? 0) > 0) {
      toast.error('Categoria em uso — não pode ser excluída.');
      return;
    }
    // Also delete subcategorias
    await supabase.from('subcategorias').delete().eq('categoria_id', cat.id);
    const { error } = await supabase.from('categorias').delete().eq('id', cat.id);
    if (error) toast.error('Erro ao excluir');
    else { toast.success('Categoria excluída!'); fetchCategorias(); }
  };

  const handleToggleBlock = async (cat: Categoria) => {
    if (cat.obrigatoria) { toast.error('Categoria obrigatória não pode ser bloqueada.'); return; }
    const { error } = await supabase.from('categorias').update({ bloqueada: !cat.bloqueada }).eq('id', cat.id);
    if (error) toast.error('Erro');
    else { toast.success(cat.bloqueada ? 'Categoria desbloqueada!' : 'Categoria bloqueada!'); fetchCategorias(); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Categorias</h1>
        <p className="text-muted-foreground">Gerencie categorias de lançamentos</p>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Plus className="h-5 w-5" />
            </span>
            Nova Categoria
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="Nome da categoria"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="h-11 max-w-sm rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30"
            />
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
                <p className="mt-1 text-sm text-muted-foreground">Refine a listagem por nome, status e etiquetas.</p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
              {filteredCategorias.length} de {categorias.length} categorias
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.4fr)_minmax(160px,0.8fr)_minmax(180px,0.9fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="categoria-nome-filter" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Nome
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="categoria-nome-filter"
                  value={filterNome}
                  onChange={(event) => setFilterNome(event.target.value)}
                  placeholder="Buscar categoria"
                  className="h-11 rounded-xl border-slate-200 bg-white pl-9 shadow-sm transition hover:border-primary/30"
                />
              </div>
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

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tipo</Label>
              <Select value={filterSpecial} onValueChange={(value) => setFilterSpecial(value as SpecialFilter)}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="padrao">Padrão</SelectItem>
                  <SelectItem value="obrigatoria">Obrigatória</SelectItem>
                  <SelectItem value="especial">Ambas / especiais</SelectItem>
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
            Suas categorias
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters ? 'Resultados filtrados' : 'Todas as categorias'}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {categorias.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Nenhuma categoria cadastrada.</div>
          ) : filteredCategorias.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              Nenhuma categoria encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={toggleNameSort}
                        className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-semibold transition hover:bg-white hover:text-foreground"
                      >
                        Nome
                        {sortDirection === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : sortDirection === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategorias.map((cat) => (
                    <tr key={cat.id} className="border-b transition hover:bg-primary/5">
                      <td className="px-4 py-2">
                        {editId === cat.id ? (
                          <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 max-w-xs rounded-lg" onKeyDown={(e) => e.key === 'Enter' && handleEdit(cat.id)} />
                        ) : (
                          <span className="font-medium">{cat.nome}</span>
                        )}
                        {cat.obrigatoria && <Badge variant="secondary" className="ml-2 h-5 rounded-full px-2 text-[11px]">Obrigatória</Badge>}
                        {cat.categoria_padrao && <Badge variant="outline" className="ml-1 h-5 rounded-full px-2 text-[11px]">Padrão</Badge>}
                      </td>
                      <td className="px-4 py-2">
                        {cat.bloqueada ? (
                          <Badge variant="destructive" className="h-5 rounded-full px-2 text-[11px]">Bloqueada</Badge>
                        ) : (
                          <Badge variant="default" className="h-5 rounded-full bg-green-600 px-2 text-[11px]">Ativa</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {editId === cat.id ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-emerald-50 hover:text-emerald-700" onClick={() => handleEdit(cat.id)}><Check className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" disabled={!!cat.obrigatoria} onClick={() => { setEditId(cat.id); setEditNome(cat.nome); }} title="Editar"><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-700" disabled={!!cat.obrigatoria} onClick={() => handleDelete(cat)} title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-slate-100" disabled={!!cat.obrigatoria} onClick={() => handleToggleBlock(cat)} title={cat.bloqueada ? 'Desbloquear' : 'Bloquear'}>
                                {cat.bloqueada ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
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
