import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock, Unlock, ToggleLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { getMonthName } from '@/lib/financial';

type Bloqueio = { id: string; mes_ano: string; tipo: string };

export default function Bloqueios() {
  const { user } = useAuth();
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [tipo, setTipo] = useState('competencia');
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);

  const fetchBloqueios = async () => {
    if (!user) return;
    const { data } = await supabase.from('bloqueios').select('*').eq('usuario_id', user.id).order('mes_ano', { ascending: false });
    if (data) setBloqueios(data);
  };

  useEffect(() => { fetchBloqueios(); }, [user]);

  const handleToggle = async () => {
    if (!user) return;
    const mesAno = `${ano}-${mes.padStart(2, '0')}`;
    setLoading(true);

    const existing = bloqueios.find(b => b.mes_ano === mesAno && b.tipo === tipo);
    if (existing) {
      const { error } = await supabase.from('bloqueios').delete().eq('id', existing.id);
      if (error) toast.error('Erro ao desbloquear.');
      else toast.success(`${getMonthName(Number(mes) - 1)}/${ano} desbloqueado (${tipo}).`);
    } else {
      const { error } = await supabase.from('bloqueios').insert({ mes_ano: mesAno, tipo, usuario_id: user.id });
      if (error) toast.error('Erro ao bloquear.');
      else toast.success(`${getMonthName(Number(mes) - 1)}/${ano} bloqueado (${tipo}).`);
    }
    fetchBloqueios();
    setLoading(false);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Bloqueio de Datas</h1>
        <p className="text-muted-foreground">Bloqueie ou desbloqueie competências e pagamentos</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ToggleLeft className="h-5 w-5 text-accent" /> Bloquear / Desbloquear
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="competencia">Competência</SelectItem>
                  <SelectItem value="pagamento">Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Mês</label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{getMonthName(i)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleToggle} disabled={loading}>
              {bloqueios.find(b => b.mes_ano === `${ano}-${mes.padStart(2, '0')}` && b.tipo === tipo)
                ? <><Unlock className="mr-2 h-4 w-4" /> Desbloquear</>
                : <><Lock className="mr-2 h-4 w-4" /> Bloquear</>
              }
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="h-5 w-5 text-accent" /> Bloqueios ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bloqueios.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum bloqueio cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3">Mês/Ano</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {bloqueios.map(b => {
                    const [y, m] = b.mes_ano.split('-');
                    return (
                      <tr key={b.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3">{getMonthName(Number(m) - 1)}/{y}</td>
                        <td className="py-2 px-3">
                          <Badge variant={b.tipo === 'competencia' ? 'default' : 'secondary'} className="text-xs">
                            {b.tipo === 'competencia' ? 'Competência' : 'Pagamento'}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button size="sm" variant="ghost" onClick={async () => {
                            await supabase.from('bloqueios').delete().eq('id', b.id);
                            toast.success('Bloqueio removido!');
                            fetchBloqueios();
                          }}>
                            <Unlock className="h-4 w-4" />
                          </Button>
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
