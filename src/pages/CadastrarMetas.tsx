import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Target, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency, parseCurrencyInput, getMonthName, getCurrentCompetencia } from '@/lib/financial';

type Meta = {
  id: string; tipo: string | null; mes_ano: string; valor: number; categoria_id: string | null;
};
type Categoria = { id: string; nome: string };

export default function CadastrarMetas() {
  const { user } = useAuth();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  // Form
  const [tipo, setTipo] = useState('despesa');
  const [categoriaId, setCategoriaId] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [modo, setModo] = useState<'mes' | 'ano'>('mes');
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterCompInicio, setFilterCompInicio] = useState('');
  const [filterCompFim, setFilterCompFim] = useState('');
  const [filterAno, setFilterAno] = useState('');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterCats, setFilterCats] = useState<string[]>([]);

  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editValorStr, setEditValorStr] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    if (!user) return;
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('metas').select('*').eq('usuario_id', user.id).order('mes_ano'),
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome'),
    ]);
    if (m) setMetas(m as any);
    if (c) setCategorias(c);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleAdd = async () => {
    if (!user || !valorStr.trim()) return;
    const valor = parseCurrencyInput(valorStr);
    if (valor <= 0) { toast.error('Valor inválido.'); return; }
    if (tipo === 'categoria' && !categoriaId) { toast.error('Selecione uma categoria.'); return; }

    setLoading(true);
    const competencias: string[] = [];
    if (modo === 'mes') {
      competencias.push(`${ano}-${mes.padStart(2, '0')}`);
    } else {
      for (let m = 1; m <= 12; m++) competencias.push(`${ano}-${String(m).padStart(2, '0')}`);
    }

    let created = 0;
    for (const comp of competencias) {
      // Check duplicate
      const existing = metas.find(m =>
        m.mes_ano === comp && m.tipo === tipo && (tipo !== 'categoria' || m.categoria_id === categoriaId)
      );
      if (existing) continue;

      const { error } = await supabase.from('metas').insert({
        usuario_id: user.id, tipo, mes_ano: comp, valor,
        categoria_id: tipo === 'categoria' ? categoriaId : null,
      } as any);
      if (!error) created++;
    }

    if (created > 0) toast.success(`${created} meta(s) criada(s)!`);
    else toast.info('Nenhuma meta nova (duplicatas ignoradas).');
    setValorStr('');
    fetchData();
    setLoading(false);
  };

  const handleEditSave = async (id: string) => {
    const valor = parseCurrencyInput(editValorStr);
    if (valor <= 0) { toast.error('Valor inválido.'); return; }
    await supabase.from('metas').update({ valor }).eq('id', id);
    toast.success('Meta atualizada!');
    setEditId(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('metas').delete().eq('id', id);
    toast.success('Meta excluída!');
    fetchData();
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      await supabase.from('metas').delete().eq('id', id);
    }
    toast.success(`${selectedIds.size} meta(s) excluída(s)!`);
    setSelectedIds(new Set());
    fetchData();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const catMap = useMemo(() => {
    const m: Record<string, string> = {};
    categorias.forEach(c => { m[c.id] = c.nome; });
    return m;
  }, [categorias]);

  const filtered = useMemo(() => {
    return metas.filter(m => {
      if (filterCompInicio && m.mes_ano < filterCompInicio) return false;
      if (filterCompFim && m.mes_ano > filterCompFim) return false;
      if (filterAno && !m.mes_ano.startsWith(filterAno)) return false;
      if (filterTipo !== 'all' && m.tipo !== filterTipo) return false;
      if (filterCats.length > 0 && m.categoria_id && !filterCats.includes(m.categoria_id)) return false;
      return true;
    });
  }, [metas, filterCompInicio, filterCompFim, filterAno, filterTipo, filterCats]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);

  const tipoLabel = (t: string) => t === 'receita' ? 'Receita' : t === 'despesa' ? 'Despesa' : 'Categoria';

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Cadastrar Metas</h1>
        <p className="text-muted-foreground">Defina suas metas financeiras</p>
      </div>

      {/* Form */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Plus className="h-5 w-5 text-accent" /> Nova Meta</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="categoria">Categoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipo === 'categoria' && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Categoria</label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Valor (R$)</label>
              <Input placeholder="0,00" value={valorStr} onChange={(e) => setValorStr(e.target.value)} className="w-[140px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Período</label>
              <Select value={modo} onValueChange={(v) => setModo(v as 'mes' | 'ano')}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">Mês específico</SelectItem>
                  <SelectItem value="ano">Ano inteiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {modo === 'mes' && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Mês</label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{getMonthName(i)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={loading}><Plus className="mr-2 h-4 w-4" /> Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Comp. início</label>
              <Input placeholder="YYYY-MM" value={filterCompInicio} onChange={(e) => setFilterCompInicio(e.target.value)} className="w-[120px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Comp. fim</label>
              <Input placeholder="YYYY-MM" value={filterCompFim} onChange={(e) => setFilterCompFim(e.target.value)} className="w-[120px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Select value={filterAno} onValueChange={setFilterAno}>
                <SelectTrigger className="w-[90px]"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="categoria">Categoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir {selectedIds.size}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Listing */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Target className="h-5 w-5 text-accent" /> Metas cadastradas</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? <p className="text-muted-foreground text-sm">Nenhuma meta encontrada.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left">
                  <th className="py-2 px-2 w-8"><Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={(c) => { if (c) setSelectedIds(new Set(filtered.map(m => m.id))); else setSelectedIds(new Set()); }} /></th>
                  <th className="py-2 px-3">Competência</th><th className="py-2 px-3">Tipo</th><th className="py-2 px-3">Categoria</th><th className="py-2 px-3 text-right">Valor</th><th className="py-2 px-3 text-right">Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map(m => {
                    const [y, mo] = m.mes_ano.split('-');
                    return (
                      <tr key={m.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2"><Checkbox checked={selectedIds.has(m.id)} onCheckedChange={() => toggleSelect(m.id)} /></td>
                        <td className="py-2 px-3">{getMonthName(Number(mo) - 1)}/{y}</td>
                        <td className="py-2 px-3">{tipoLabel(m.tipo)}</td>
                        <td className="py-2 px-3">{m.categoria_id ? catMap[m.categoria_id] ?? '-' : '-'}</td>
                        <td className="py-2 px-3 text-right">
                          {editId === m.id ? (
                            <Input value={editValorStr} onChange={(e) => setEditValorStr(e.target.value)} className="h-8 w-[120px] inline-block" />
                          ) : formatCurrency(m.valor)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {editId === m.id ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => handleEditSave(m.id)}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => { setEditId(m.id); setEditValorStr(m.valor.toFixed(2).replace('.', ',')); }}><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
