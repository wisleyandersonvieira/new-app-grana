import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseCurrencyInput } from '@/lib/financial';

export default function NovaTransferencia() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [data, setData] = useState('');
  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [observacao, setObservacao] = useState('');
  const [bloqueios, setBloqueios] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('contas').select('id, nome').eq('usuario_id', user.id).eq('bloqueada', false).eq('tipo', 'conta').order('nome')
      .then(({ data }) => { if (data) setContas(data); });
    supabase.from('bloqueios').select('mes_ano').eq('usuario_id', user.id)
      .then(({ data }) => { if (data) setBloqueios(data.map(b => b.mes_ano)); });
  }, [user]);

  const handleSave = async () => {
    if (!user || !data || !origemId || !destinoId || !valorStr.trim()) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (origemId === destinoId) { toast.error('Conta origem e destino devem ser diferentes.'); return; }
    const valor = parseCurrencyInput(valorStr);
    if (valor <= 0) { toast.error('Valor inválido.'); return; }

    // Check bloqueio
    const mesAno = data.substring(0, 7); // YYYY-MM
    if (bloqueios.includes(mesAno)) { toast.error('Mês bloqueado para lançamentos.'); return; }

    setLoading(true);
    const { error } = await supabase.from('transferencias').insert({
      data, conta_origem_id: origemId, conta_destino_id: destinoId, valor, observacao: observacao || null, usuario_id: user.id,
    });
    if (error) toast.error('Erro ao salvar transferência.');
    else { toast.success('Transferência cadastrada!'); navigate('/transferencias'); }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nova Transferência</h1>
          <p className="text-muted-foreground">Transfira valores entre contas</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/transferencias')}>Ver Transferências</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-accent" /> Dados da transferência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Data *</label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Valor (R$) *</label>
              <Input placeholder="0,00" value={valorStr} onChange={(e) => setValorStr(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Conta Origem *</label>
              <Select value={origemId} onValueChange={setOrigemId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Conta Destino *</label>
              <Select value={destinoId} onValueChange={setDestinoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {contas.filter(c => c.id !== origemId).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Observação</label>
              <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={loading}>Salvar</Button>
            <Button variant="outline" onClick={() => navigate('/transferencias')}>Cancelar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
