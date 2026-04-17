import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Wallet, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/financial';
import { exportToExcel, exportToPDF } from '@/lib/export';

type ContaSaldo = { id: string; nome: string; tipo: string; saldo_inicial: number; data_saldo_inicial: string | null; saldo: number };

export default function SaldoDeContas() {
  const { user } = useAuth();
  const [dataRef, setDataRef] = useState(new Date().toISOString().split('T')[0]);
  const [contas, setContas] = useState<{ id: string; nome: string; tipo: string; saldo_inicial: number; data_saldo_inicial: string | null; bloqueada: boolean }[]>([]);
  const [selectedContas, setSelectedContas] = useState<string[]>([]);
  const [result, setResult] = useState<ContaSaldo[]>([]);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('contas').select('id, nome, tipo, saldo_inicial, data_saldo_inicial, bloqueada').eq('usuario_id', user.id).order('nome')
      .then(({ data }) => { if (data) { setContas(data); setSelectedContas(data.map(c => c.id)); } });
  }, [user]);

  const fetchAll = async <T,>(builder: () => any): Promise<T[]> => {
    const pageSize = 1000;
    let from = 0;
    const all: T[] = [];
    while (true) {
      const { data, error } = await builder().range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as T[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  };

  const generate = async () => {
    if (!user) return;
    const filtered = contas.filter(c => selectedContas.includes(c.id));

    const [receitas, despesas, transf] = await Promise.all([
      fetchAll<{ conta_id: string | null; valor: number }>(() =>
        supabase.from('receitas').select('conta_id, valor').eq('usuario_id', user.id).eq('paga', true).lte('data_pagamento', dataRef),
      ),
      fetchAll<{ conta_id: string | null; valor: number }>(() =>
        supabase.from('despesas').select('conta_id, valor').eq('usuario_id', user.id).eq('paga', true).lte('data_pagamento', dataRef),
      ),
      fetchAll<{ conta_origem_id: string | null; conta_destino_id: string | null; valor: number }>(() =>
        supabase.from('transferencias').select('conta_origem_id, conta_destino_id, valor').eq('usuario_id', user.id).lte('data', dataRef),
      ),
    ]);

    const res: ContaSaldo[] = filtered.map(c => {
      let saldo = c.saldo_inicial ?? 0;
      receitas?.forEach(r => { if (r.conta_id === c.id) saldo += r.valor; });
      despesas?.forEach(d => { if (d.conta_id === c.id) saldo -= d.valor; });
      transf?.forEach(t => {
        if (t.conta_destino_id === c.id) saldo += t.valor;
        if (t.conta_origem_id === c.id) saldo -= t.valor;
      });
      return { id: c.id, nome: c.nome, tipo: c.tipo, saldo_inicial: c.saldo_inicial ?? 0, data_saldo_inicial: c.data_saldo_inicial, saldo };
    });

    setResult(res);
    setGenerated(true);
  };

  const toggleConta = (id: string) => setSelectedContas(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const total = result.reduce((s, c) => s + c.saldo, 0);

  const cols = [
    { header: 'Conta', key: 'nome' },
    { header: 'Tipo', key: 'tipo' },
    { header: 'Saldo Inicial', key: 'saldoInicialFmt' },
    { header: 'Saldo Atual', key: 'saldoFmt' },
  ];
  const exportData = result.map(c => ({ nome: c.nome, tipo: c.tipo === 'cartao' ? 'Cartão' : 'Conta', saldoInicialFmt: formatCurrency(c.saldo_inicial), saldoFmt: formatCurrency(c.saldo) }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Saldo de Contas</h1><p className="text-muted-foreground">Saldo calculado até uma data de referência</p></div>
        {generated && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportToExcel(exportData, cols, 'saldo-contas')}><Download className="mr-2 h-4 w-4" /> Excel</Button>
            <Button variant="outline" onClick={() => exportToPDF(exportData, cols, 'Saldo de Contas', 'saldo-contas')}><Download className="mr-2 h-4 w-4" /> PDF</Button>
          </div>
        )}
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data de referência</label>
              <Input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} className="w-[180px]" />
            </div>
            <Button onClick={generate}>Gerar</Button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Contas</label>
            <div className="flex flex-wrap gap-2">
              {contas.map(c => (
                <label key={c.id} className="flex items-center gap-1 text-xs cursor-pointer">
                  <Checkbox checked={selectedContas.includes(c.id)} onCheckedChange={() => toggleConta(c.id)} />{c.nome}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      {generated && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wallet className="h-5 w-5 text-accent" /> Resultado</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="py-2 px-3">Conta</th><th className="py-2 px-3">Tipo</th><th className="py-2 px-3 text-right">Saldo Inicial</th><th className="py-2 px-3 text-right">Saldo Atual</th></tr></thead>
              <tbody>
                {result.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3">{c.nome}</td>
                    <td className="py-2 px-3">{c.tipo === 'cartao' ? 'Cartão' : 'Conta'}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(c.saldo_inicial)}</td>
                    <td className={`py-2 px-3 text-right font-medium ${c.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(c.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t"><td colSpan={3} className="py-2 px-3 text-right">Total:</td>
                  <td className={`py-2 px-3 text-right ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
