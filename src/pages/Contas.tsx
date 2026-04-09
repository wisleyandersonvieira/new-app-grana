import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Wallet, Pencil, Trash2, Lock, Unlock, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, parseCurrencyInput } from '@/lib/financial';

type Conta = {
  id: string; nome: string; tipo: string; saldo_inicial: number | null; data_saldo_inicial: string | null; bloqueada: boolean | null;
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

  const fetchContas = async () => {
    if (!user) return;
    const { data } = await supabase.from('contas').select('id, nome, tipo, saldo_inicial, data_saldo_inicial, bloqueada').eq('usuario_id', user.id).order('nome');
    if (data) setContas(data);
  };

  useEffect(() => { fetchContas(); }, [user]);

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
    const [{ count: dCount }, { count: rCount }, { count: tCount }] = await Promise.all([
      supabase.from('despesas').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id),
      supabase.from('receitas').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id),
      supabase.from('transferencias').select('id', { count: 'exact', head: true }).or(`conta_origem_id.eq.${conta.id},conta_destino_id.eq.${conta.id}`),
    ]);
    if ((dCount ?? 0) > 0 || (rCount ?? 0) > 0 || (tCount ?? 0) > 0) {
      toast.error('Conta em uso — não pode ser excluída.');
      return;
    }
    const { error } = await supabase.from('contas').delete().eq('id', conta.id);
    if (error) toast.error('Erro ao excluir');
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Contas</h1>
        <p className="text-muted-foreground">Gerencie suas contas e cartões</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-accent" /> Nova Conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input placeholder="Nome da conta" value={nome} onChange={(e) => setNome(e.target.value)} className="w-[180px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conta">Conta</SelectItem>
                  <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Saldo Inicial (R$)</label>
              <Input placeholder="0,00" value={saldoStr} onChange={(e) => setSaldoStr(e.target.value)} className="w-[140px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data Saldo Inicial</label>
              <Input type="date" value={dataSaldo} onChange={(e) => setDataSaldo(e.target.value)} className="w-[160px]" />
            </div>
            <Button onClick={handleAdd} disabled={loading || !nome.trim()}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-accent" /> Suas contas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contas.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma conta cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3">Nome</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Saldo Inicial</th>
                    <th className="py-2 px-3">Data Saldo</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contas.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">
                        {editId === c.id ? <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 w-[160px]" /> : c.nome}
                      </td>
                      <td className="py-2 px-3">
                        {editId === c.id ? (
                          <Select value={editTipo} onValueChange={setEditTipo}>
                            <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="conta">Conta</SelectItem>
                              <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : c.tipo === 'cartao' ? 'Cartão de Crédito' : 'Conta'}
                      </td>
                      <td className="py-2 px-3">
                        {editId === c.id ? <Input value={editSaldoStr} onChange={(e) => setEditSaldoStr(e.target.value)} className="h-8 w-[120px]" /> : formatCurrency(c.saldo_inicial ?? 0)}
                      </td>
                      <td className="py-2 px-3">
                        {editId === c.id ? <Input type="date" value={editDataSaldo} onChange={(e) => setEditDataSaldo(e.target.value)} className="h-8 w-[140px]" /> : (c.data_saldo_inicial ?? '-')}
                      </td>
                      <td className="py-2 px-3">
                        {c.bloqueada ? <Badge variant="destructive" className="text-xs">Bloqueada</Badge> : <Badge variant="default" className="text-xs bg-green-600">Ativa</Badge>}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {editId === c.id ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(c.id)}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(c)}><Trash2 className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => handleToggleBlock(c)}>
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
