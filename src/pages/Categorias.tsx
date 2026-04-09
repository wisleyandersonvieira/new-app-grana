import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Tags, Pencil, Trash2, Lock, Unlock, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

type Categoria = {
  id: string;
  nome: string;
  bloqueada: boolean | null;
  obrigatoria: boolean | null;
  categoria_padrao: boolean | null;
};

export default function Categorias() {
  const { user } = useAuth();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nome, setNome] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleAdd = async () => {
    if (!user || !nome.trim()) return;
    setLoading(true);
    const formatted = toTitleCase(nome.trim());
    const { error } = await supabase.from('categorias').insert({ nome: formatted, usuario_id: user.id });
    if (error) toast.error('Erro ao cadastrar categoria');
    else { toast.success('Categoria cadastrada!'); setNome(''); fetchCategorias(); }
    setLoading(false);
  };

  const handleEdit = async (id: string) => {
    if (!editNome.trim()) return;
    setLoading(true);
    const formatted = toTitleCase(editNome.trim());
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-accent" /> Nova Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Nome da categoria"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="max-w-sm"
            />
            <Button onClick={handleAdd} disabled={loading || !nome.trim()}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Tags className="h-5 w-5 text-accent" /> Suas categorias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categorias.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma categoria cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3">Nome</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((cat) => (
                    <tr key={cat.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">
                        {editId === cat.id ? (
                          <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 max-w-xs" onKeyDown={(e) => e.key === 'Enter' && handleEdit(cat.id)} />
                        ) : (
                          <span>{cat.nome}</span>
                        )}
                        {cat.obrigatoria && <Badge variant="secondary" className="ml-2 text-xs">Obrigatória</Badge>}
                        {cat.categoria_padrao && <Badge variant="outline" className="ml-1 text-xs">Padrão</Badge>}
                      </td>
                      <td className="py-2 px-3">
                        {cat.bloqueada ? (
                          <Badge variant="destructive" className="text-xs">Bloqueada</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs bg-green-600">Ativa</Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {editId === cat.id ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(cat.id)}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" disabled={!!cat.obrigatoria} onClick={() => { setEditId(cat.id); setEditNome(cat.nome); }} title="Editar"><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" disabled={!!cat.obrigatoria} onClick={() => handleDelete(cat)} title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" disabled={!!cat.obrigatoria} onClick={() => handleToggleBlock(cat)} title={cat.bloqueada ? 'Desbloquear' : 'Bloquear'}>
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
