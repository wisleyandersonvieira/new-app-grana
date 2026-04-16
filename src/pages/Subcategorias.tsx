import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Tags, Pencil, Trash2, Lock, Unlock, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { normalizeCategoryLabel } from '@/lib/credit-card-category';

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

type Categoria = { id: string; nome: string };
type Subcategoria = {
  id: string; nome: string; categoria_id: string; bloqueada: boolean | null; obrigatoria: boolean | null; subcategoria_padrao: boolean | null;
  categorias?: { nome: string } | null;
};

export default function Subcategorias() {
  const { user } = useAuth();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCategoriaId, setEditCategoriaId] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    const [{ data: cats }, { data: subs }] = await Promise.all([
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id, bloqueada, obrigatoria, subcategoria_padrao, categorias(nome)').eq('usuario_id', user.id).order('nome'),
    ]);
    if (cats) setCategorias(cats);
    if (subs) setSubcategorias(subs as unknown as Subcategoria[]);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleAdd = async () => {
    if (!user || !nome.trim() || !categoriaId) return;
    const formatted = toTitleCase(nome.trim());
    // Duplicate check
    const existing = subcategorias.find(
      (s) => normalizeCategoryLabel(s.nome) === normalizeCategoryLabel(formatted) && s.categoria_id === categoriaId,
    );
    if (existing) { toast.error('Subcategoria já existe nesta categoria.'); return; }
    setLoading(true);
    const { error } = await supabase.from('subcategorias').insert({ nome: formatted, categoria_id: categoriaId, usuario_id: user.id });
    if (error) toast.error('Erro ao cadastrar');
    else { toast.success('Subcategoria cadastrada!'); setNome(''); setCategoriaId(''); fetchData(); }
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
    const { error } = await supabase.from('subcategorias').update({ nome: formatted, categoria_id: editCategoriaId }).eq('id', id);
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

  const getCatNome = (catId: string) => categorias.find(c => c.id === catId)?.nome ?? '-';

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Subcategorias</h1>
        <p className="text-muted-foreground">Gerencie suas subcategorias</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-accent" /> Nova Subcategoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="max-w-xs" />
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={loading || !nome.trim() || !categoriaId}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Tags className="h-5 w-5 text-accent" /> Suas subcategorias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subcategorias.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma subcategoria cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3">Nome</th>
                    <th className="py-2 px-3">Categoria</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {subcategorias.map((sub) => (
                    <tr key={sub.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">
                        {editId === sub.id ? (
                          <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 max-w-xs" />
                        ) : (
                          <span>{sub.nome}</span>
                        )}
                        {sub.obrigatoria && <Badge variant="secondary" className="ml-2 text-xs">Obrigatória</Badge>}
                      </td>
                      <td className="py-2 px-3">
                        {editId === sub.id ? (
                          <Select value={editCategoriaId} onValueChange={setEditCategoriaId}>
                            <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          getCatNome(sub.categoria_id)
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {sub.bloqueada ? <Badge variant="destructive" className="text-xs">Bloqueada</Badge> : <Badge variant="default" className="text-xs bg-green-600">Ativa</Badge>}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {editId === sub.id ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(sub.id)}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" disabled={!!sub.obrigatoria} onClick={() => { setEditId(sub.id); setEditNome(sub.nome); setEditCategoriaId(sub.categoria_id); }}><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" disabled={!!sub.obrigatoria} onClick={() => handleDelete(sub)}><Trash2 className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" disabled={!!sub.obrigatoria} onClick={() => handleToggleBlock(sub)}>
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
