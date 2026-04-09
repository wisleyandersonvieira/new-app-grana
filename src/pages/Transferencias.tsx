import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowLeftRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/financial';

type Transferencia = {
  id: string; data: string; valor: number; observacao: string | null;
  conta_origem_id: string; conta_destino_id: string;
};

export default function Transferencias() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [contasMap, setContasMap] = useState<Record<string, string>>({});
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [bloqueios, setBloqueios] = useState<string[]>([]);

  // Filters
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');
  const [filterOrigem, setFilterOrigem] = useState('all');
  const [filterDestino, setFilterDestino] = useState('all');

  const fetchData = async () => {
    if (!user) return;
    const [{ data: trans }, { data: contasData }, { data: bloq }] = await Promise.all([
      supabase.from('transferencias').select('*').eq('usuario_id', user.id).order('data', { ascending: false }),
      supabase.from('contas').select('id, nome').eq('usuario_id', user.id),
      supabase.from('bloqueios').select('mes_ano').eq('usuario_id', user.id),
    ]);
    if (trans) setTransferencias(trans);
    if (contasData) {
      setContas(contasData);
      const map: Record<string, string> = {};
      contasData.forEach(c => { map[c.id] = c.nome; });
      setContasMap(map);
    }
    if (bloq) setBloqueios(bloq.map(b => b.mes_ano));
  };

  useEffect(() => { fetchData(); }, [user]);

  const filtered = transferencias.filter(t => {
    if (filterDataInicio && t.data < filterDataInicio) return false;
    if (filterDataFim && t.data > filterDataFim) return false;
    if (filterOrigem !== 'all' && t.conta_origem_id !== filterOrigem) return false;
    if (filterDestino !== 'all' && t.conta_destino_id !== filterDestino) return false;
    return true;
  });

  const handleDelete = async (t: Transferencia) => {
    const mesAno = t.data.substring(0, 7);
    if (bloqueios.includes(mesAno)) { toast.error('Mês bloqueado — não é possível excluir.'); return; }
    const { error } = await supabase.from('transferencias').delete().eq('id', t.id);
    if (error) toast.error('Erro ao excluir.');
    else { toast.success('Transferência excluída!'); fetchData(); }
  };

  const total = filtered.reduce((s, t) => s + t.valor, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transferências</h1>
          <p className="text-muted-foreground">Transferências entre contas</p>
        </div>
        <Button onClick={() => navigate('/nova-transferencia')}>
          <Plus className="mr-2 h-4 w-4" /> Nova Transferência
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data início</label>
              <Input type="date" value={filterDataInicio} onChange={(e) => setFilterDataInicio(e.target.value)} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data fim</label>
              <Input type="date" value={filterDataFim} onChange={(e) => setFilterDataFim(e.target.value)} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Conta Origem</label>
              <Select value={filterOrigem} onValueChange={setFilterOrigem}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Conta Destino</label>
              <Select value={filterDestino} onValueChange={setFilterDestino}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-accent" /> Transferências
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma transferência encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Origem</th>
                    <th className="py-2 px-3">Destino</th>
                    <th className="py-2 px-3">Valor</th>
                    <th className="py-2 px-3">Observação</th>
                    <th className="py-2 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">{t.data}</td>
                      <td className="py-2 px-3">{contasMap[t.conta_origem_id] ?? '-'}</td>
                      <td className="py-2 px-3">{contasMap[t.conta_destino_id] ?? '-'}</td>
                      <td className="py-2 px-3">{formatCurrency(t.valor)}</td>
                      <td className="py-2 px-3">{t.observacao ?? '-'}</td>
                      <td className="py-2 px-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(t)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={3} className="py-2 px-3 text-right">Total:</td>
                    <td className="py-2 px-3">{formatCurrency(total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
