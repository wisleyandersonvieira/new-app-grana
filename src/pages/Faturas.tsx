import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CreditCard, Eye, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency, formatCompetencia } from '@/lib/financial';
import { Badge } from '@/components/ui/badge';

type FaturaRow = {
  id: string; competencia: string; vencimento: string; valor_total: number | null;
  cartao_id: string; paga: boolean;
};

export default function Faturas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [faturas, setFaturas] = useState<FaturaRow[]>([]);
  const [contasMap, setContasMap] = useState<Record<string, string>>({});

  const fetchFaturas = async () => {
    if (!user) return;
    const [{ data: fats }, { data: contas }, { data: despesas }] = await Promise.all([
      supabase.from('faturas_cartao').select('id, competencia, vencimento, valor_total, cartao_id').eq('usuario_id', user.id).order('vencimento', { ascending: false }),
      supabase.from('contas').select('id, nome').eq('usuario_id', user.id),
      supabase.from('despesas').select('lote_id, paga').eq('usuario_id', user.id).not('lote_id', 'is', null),
    ]);
    const paidLotes = new Set<string>();
    despesas?.forEach(d => { if (d.paga && d.lote_id) paidLotes.add(d.lote_id); });
    if (fats) setFaturas(fats.map(f => ({ ...f, paga: paidLotes.has(f.id) })));
    if (contas) {
      const map: Record<string, string> = {};
      contas.forEach(c => { map[c.id] = c.nome; });
      setContasMap(map);
    }
  };

  useEffect(() => { fetchFaturas(); }, [user]);

  const handleDelete = async (fat: FaturaRow) => {
    if (fat.paga) { toast.error('Fatura quitada não pode ser excluída.'); return; }
    await supabase.from('itens_fatura').delete().eq('fatura_id', fat.id);
    await supabase.from('despesas').delete().eq('lote_id', fat.id);
    const { error } = await supabase.from('faturas_cartao').delete().eq('id', fat.id);
    if (error) toast.error('Erro ao excluir fatura.');
    else { toast.success('🗑️ Fatura excluída!'); fetchFaturas(); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faturas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gerencie faturas dos cartões de crédito</p>
        </div>
        <Button onClick={() => navigate('/nova-fatura')} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Fatura
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
              <CreditCard className="h-4 w-4 text-accent" />
            </div>
            Faturas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {faturas.length === 0 ? (
            <p className="text-muted-foreground text-sm px-6 pb-6">Nenhuma fatura cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-table-header text-table-header-foreground">
                    <th className="py-3 px-4 text-left text-xs font-semibold">Cartão</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold">Competência</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold">Vencimento</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold">Valor Total</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold">Situação</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {faturas.map((fat, i) => (
                    <tr key={fat.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                      <td className="py-3 px-4 font-medium">{contasMap[fat.cartao_id] ?? '-'}</td>
                      <td className="py-3 px-4">{formatCompetencia(fat.competencia)}</td>
                      <td className="py-3 px-4">{fat.vencimento}</td>
                      <td className="py-3 px-4 font-semibold">{formatCurrency(fat.valor_total ?? 0)}</td>
                      <td className="py-3 px-4">
                        {fat.paga ? (
                          <Badge className="text-xs bg-success/15 text-success border-success/20 hover:bg-success/20">✅ Quitada</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Em Aberto</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" onClick={() => navigate(`/fatura/${fat.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!fat.paga && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(fat)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
