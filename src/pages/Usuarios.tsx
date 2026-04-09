import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Pencil, Trash2, UserCheck, UserX, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

type AssinaturaRow = {
  status: string;
  plano: string | null;
  trial_fim: string | null;
  data_expiracao: string | null;
};

type UserRow = {
  id: string; user_id: string; nome: string; email: string;
  is_admin: boolean | null; status: string | null; ultimo_acesso: string | null; created_at: string | null;
  assinatura: AssinaturaRow | null;
};

function getSubscriptionLabel(assinatura: AssinaturaRow | null): { plano: string; status: string; statusVariant: 'default' | 'secondary' | 'destructive' | 'outline'; expira: string } {
  if (!assinatura) {
    return { plano: 'Sem assinatura', status: 'Livre', statusVariant: 'secondary', expira: '-' };
  }

  // Plano
  let plano = 'Trial';
  if (assinatura.plano === 'mensal') plano = 'Mensal';
  else if (assinatura.plano === 'anual') plano = 'Anual';
  else if (assinatura.status === 'trial') plano = 'Trial';

  // Status
  let status = assinatura.status;
  let statusVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';

  if (assinatura.status === 'trial') {
    const daysLeft = assinatura.trial_fim
      ? Math.max(0, Math.ceil((new Date(assinatura.trial_fim).getTime() - Date.now()) / 86400000))
      : 0;
    status = `Trial (${daysLeft}d)`;
    statusVariant = daysLeft > 1 ? 'default' : 'destructive';
  } else if (assinatura.status === 'active') {
    status = 'Ativa';
    statusVariant = 'default';
  } else if (assinatura.status === 'past_due') {
    status = 'Inadimplente';
    statusVariant = 'destructive';
  } else if (assinatura.status === 'canceled') {
    status = 'Cancelada';
    statusVariant = 'outline';
  } else if (assinatura.status === 'expired') {
    status = 'Expirada';
    statusVariant = 'destructive';
  }

  // Expira em
  const expDate = assinatura.status === 'trial' ? assinatura.trial_fim : assinatura.data_expiracao;
  const expira = expDate ? new Date(expDate).toLocaleDateString('pt-BR') : '-';

  return { plano, status, statusVariant, expira };
}

export default function UsuariosPage() {
  const { user, profile } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newNome, setNewNome] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAdmin, setNewAdmin] = useState('nao');
  const [newStatus, setNewStatus] = useState('ativo');

  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editAdmin, setEditAdmin] = useState('nao');
  const [editStatus, setEditStatus] = useState('ativo');

  const callEdgeFunction = async (body: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const fetchUsers = async () => {
    const data = await callEdgeFunction({ action: 'list' });
    if (Array.isArray(data)) setUsers(data);
  };

  useEffect(() => {
    if (user && profile?.is_admin) fetchUsers();
  }, [user, profile]);

  if (!profile?.is_admin) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <Card><CardContent className="py-6"><p className="text-muted-foreground text-sm">Acesso restrito a administradores.</p></CardContent></Card>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!newNome.trim() || !newEmail.trim() || !newPassword.trim()) { toast.error('Preencha todos os campos.'); return; }
    if (newPassword.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres.'); return; }
    setLoading(true);
    const result = await callEdgeFunction({
      action: 'create', nome: newNome.trim(), email: newEmail.trim(),
      password: newPassword, is_admin: newAdmin === 'sim', status: newStatus,
    });
    if (result.error) toast.error(result.error);
    else { toast.success('Usuário criado!'); setDialogOpen(false); setNewNome(''); setNewEmail(''); setNewPassword(''); fetchUsers(); }
    setLoading(false);
  };

  const handleEditSave = async (userId: string) => {
    setLoading(true);
    const result = await callEdgeFunction({
      action: 'update', user_id: userId, nome: editNome.trim(),
      is_admin: editAdmin === 'sim', status: editStatus,
    });
    if (result.error) toast.error(result.error);
    else { toast.success('Usuário atualizado!'); setEditId(null); fetchUsers(); }
    setLoading(false);
  };

  const handleToggleStatus = async (u: UserRow) => {
    const newSt = u.status === 'ativo' ? 'inativo' : 'ativo';
    await callEdgeFunction({ action: 'update', user_id: u.user_id, status: newSt });
    toast.success(`Usuário ${newSt === 'ativo' ? 'ativado' : 'inativado'}!`);
    fetchUsers();
  };

  const handleDelete = async (u: UserRow) => {
    if (u.user_id === user?.id) { toast.error('Não é possível excluir o próprio usuário.'); return; }
    if (!confirm(`Excluir ${u.nome}? Todos os dados serão removidos.`)) return;
    setLoading(true);
    const result = await callEdgeFunction({ action: 'delete', user_id: u.user_id });
    if (result.error) toast.error(result.error);
    else { toast.success('Usuário excluído!'); fetchUsers(); }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">Gerenciamento de usuários</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1"><Label>Nome</Label><Input value={newNome} onChange={(e) => setNewNome(e.target.value)} /></div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
              <div className="space-y-1"><Label>Senha</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
              <div className="flex gap-4">
                <div className="space-y-1 flex-1">
                  <Label>Admin</Label>
                  <Select value={newAdmin} onValueChange={setNewAdmin}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1">
                  <Label>Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={loading} className="w-full">Criar Usuário</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5 text-accent" /> Usuários cadastrados</CardTitle></CardHeader>
        <CardContent>
          {users.length === 0 ? <p className="text-muted-foreground text-sm">Nenhum usuário encontrado.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left">
                  <th className="py-2 px-3">Nome</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Admin</th>
                  <th className="py-2 px-3">Plano</th>
                  <th className="py-2 px-3">Assinatura</th>
                  <th className="py-2 px-3">Expira em</th>
                  <th className="py-2 px-3">Último Acesso</th>
                  <th className="py-2 px-3 text-right">Ações</th>
                </tr></thead>
                <tbody>
                  {users.map(u => {
                    const sub = getSubscriptionLabel(u.assinatura);
                    return (
                      <tr key={u.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3">
                          {editId === u.user_id ? <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 w-[160px]" /> : u.nome}
                        </td>
                        <td className="py-2 px-3">{u.email}</td>
                        <td className="py-2 px-3">
                          {editId === u.user_id ? (
                            <Select value={editStatus} onValueChange={setEditStatus}>
                              <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={u.status === 'ativo' ? 'default' : 'destructive'} className="text-xs">{u.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {editId === u.user_id ? (
                            <Select value={editAdmin} onValueChange={setEditAdmin}>
                              <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent>
                            </Select>
                          ) : (u.is_admin ? 'Sim' : 'Não')}
                        </td>
                        <td className="py-2 px-3 text-xs">{sub.plano}</td>
                        <td className="py-2 px-3">
                          <Badge variant={sub.statusVariant} className="text-xs">{sub.status}</Badge>
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">{sub.expira}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : '-'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {editId === u.user_id ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => handleEditSave(u.user_id)}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => { setEditId(u.user_id); setEditNome(u.nome); setEditAdmin(u.is_admin ? 'sim' : 'nao'); setEditStatus(u.status ?? 'ativo'); }}><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(u)}>
                                {u.status === 'ativo' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(u)}><Trash2 className="h-4 w-4" /></Button>
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
