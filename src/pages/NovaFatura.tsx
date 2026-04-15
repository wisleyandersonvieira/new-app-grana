import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function NovaFatura() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cartoes, setCartoes] = useState<{ id: string; nome: string }[]>([]);
  const [cartaoId, setCartaoId] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('contas').select('id, nome').eq('usuario_id', user.id).eq('tipo', 'cartao').eq('bloqueada', false)
      .then(({ data }) => { if (data) setCartoes(data); });
  }, [user]);

  const handleSave = async () => {
    if (!user || !cartaoId || !vencimento) { toast.error('Preencha todos os campos obrigatórios.'); return; }
    const competencia = `${ano}-${mes.padStart(2, '0')}`;
    setLoading(true);
    const { data, error } = await supabase.from('faturas_cartao').insert({
      conta_id: cartaoId,
      data_vencimento: vencimento,
      mes_ano: competencia,
      observacao: observacao || null,
      status: 'aberta',
      usuario_id: user.id,
    }).select('id').single();
    if (error) { toast.error('Erro ao criar fatura.'); setLoading(false); return; }
    toast.success('Fatura criada! Adicione os itens.');
    navigate(`/fatura/${data.id}`);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nova Fatura</h1>
          <p className="text-muted-foreground">Cadastre uma nova fatura de cartão</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/importar-fatura')}>Importar PDF</Button>
          <Button variant="outline" onClick={() => navigate('/faturas')}>Ver Faturas</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-accent" /> Dados da fatura
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Cartão *</label>
              <Select value={cartaoId} onValueChange={setCartaoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                <SelectContent>
                  {cartoes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Vencimento *</label>
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Competência *</label>
              <div className="flex gap-2">
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, '0')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={ano} onValueChange={setAno}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Observação</label>
              <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={loading}>Criar Fatura</Button>
            <Button variant="outline" onClick={() => navigate('/faturas')}>Cancelar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
