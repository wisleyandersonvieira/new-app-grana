import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/financial';
import { exportToPDF } from '@/lib/export';

type Movimento = { data: string; descricao: string; categoria: string; subcategoria: string; entrada: number; saida: number; saldo: number };

export default function Extratos() {
  const { user } = useAuth();
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [contaId, setContaId] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [saldoAnterior, setSaldoAnterior] = useState(0);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('contas').select('id, nome').eq('usuario_id', user.id).order('nome')
      .then(({ data }) => { if (data) setContas(data); });
  }, [user]);

  const generate = async () => {
    if (!user || !contaId || !dataInicio || !dataFim) return;

    const catMap: Record<string, string> = {};
    const subMap: Record<string, string> = {};
    const [{ data: cats }, { data: subs }] = await Promise.all([
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id),
      supabase.from('subcategorias').select('id, nome').eq('usuario_id', user.id),
    ]);
    cats?.forEach(c => { catMap[c.id] = c.nome; });
    subs?.forEach(s => { subMap[s.id] = s.nome; });

    // Get conta info for saldo_inicial
    const { data: conta } = await supabase.from('contas').select('saldo_inicial, data_saldo_inicial').eq('id', contaId).single();
    let saldoAnt = conta?.saldo_inicial ?? 0;

    // Calculate saldo anterior from movements before dataInicio
    const [{ data: recBefore }, { data: despBefore }, { data: transBefore }] = await Promise.all([
      supabase.from('receitas').select('valor').eq('usuario_id', user.id).eq('conta_id', contaId).eq('paga', true).lt('data_pagamento', dataInicio),
      supabase.from('despesas').select('valor').eq('usuario_id', user.id).eq('conta_id', contaId).eq('paga', true).lt('data_pagamento', dataInicio),
      supabase.from('transferencias').select('conta_origem_id, conta_destino_id, valor').eq('usuario_id', user.id).or(`conta_origem_id.eq.${contaId},conta_destino_id.eq.${contaId}`).lt('data', dataInicio),
    ]);
    recBefore?.forEach(r => { saldoAnt += r.valor; });
    despBefore?.forEach(d => { saldoAnt -= d.valor; });
    transBefore?.forEach(t => {
      if (t.conta_destino_id === contaId) saldoAnt += t.valor;
      if (t.conta_origem_id === contaId) saldoAnt -= t.valor;
    });
    setSaldoAnterior(saldoAnt);

    // Get movements in range
    const movs: { data: string; descricao: string; categoria: string; subcategoria: string; entrada: number; saida: number }[] = [];

    const [{ data: recs }, { data: desps }, { data: trans }] = await Promise.all([
      supabase.from('receitas').select('*').eq('usuario_id', user.id).eq('conta_id', contaId).eq('paga', true).gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim),
      supabase.from('despesas').select('*').eq('usuario_id', user.id).eq('conta_id', contaId).eq('paga', true).gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim),
      supabase.from('transferencias').select('*').eq('usuario_id', user.id).or(`conta_origem_id.eq.${contaId},conta_destino_id.eq.${contaId}`).gte('data', dataInicio).lte('data', dataFim),
    ]);

    recs?.forEach(r => movs.push({
      data: r.data_pagamento ?? r.data, descricao: r.descricao ?? 'Receita',
      categoria: r.categoria_id ? catMap[r.categoria_id] ?? '' : '', subcategoria: r.subcategoria_id ? subMap[r.subcategoria_id] ?? '' : '',
      entrada: r.valor, saida: 0,
    }));
    desps?.forEach(d => movs.push({
      data: d.data_pagamento ?? d.data, descricao: d.descricao ?? 'Despesa',
      categoria: d.categoria_id ? catMap[d.categoria_id] ?? '' : '', subcategoria: d.subcategoria_id ? subMap[d.subcategoria_id] ?? '' : '',
      entrada: 0, saida: d.valor,
    }));
    const contaNome = contas.find(c => c.id === contaId)?.nome ?? '';
    trans?.forEach(t => {
      if (t.conta_destino_id === contaId) {
        movs.push({ data: t.data, descricao: `Transferência recebida${t.observacao ? ` - ${t.observacao}` : ''}`, categoria: '', subcategoria: '', entrada: t.valor, saida: 0 });
      }
      if (t.conta_origem_id === contaId) {
        movs.push({ data: t.data, descricao: `Transferência enviada${t.observacao ? ` - ${t.observacao}` : ''}`, categoria: '', subcategoria: '', entrada: 0, saida: t.valor });
      }
    });

    movs.sort((a, b) => a.data.localeCompare(b.data));

    let saldo = saldoAnt;
    const result: Movimento[] = movs.map(m => {
      saldo += m.entrada - m.saida;
      return { ...m, saldo };
    });

    setMovimentos(result);
    setGenerated(true);
  };

  const handleExportPDF = () => {
    const cols = [
      { header: 'Data', key: 'data' }, { header: 'Descrição', key: 'descricao' },
      { header: 'Categoria', key: 'categoria' }, { header: 'Subcategoria', key: 'subcategoria' },
      { header: 'Entrada', key: 'entradaFmt' }, { header: 'Saída', key: 'saidaFmt' }, { header: 'Saldo', key: 'saldoFmt' },
    ];
    const data = [
      { data: '', descricao: 'Saldo Anterior', categoria: '', subcategoria: '', entradaFmt: '', saidaFmt: '', saldoFmt: formatCurrency(saldoAnterior) },
      ...movimentos.map(m => ({
        data: m.data, descricao: m.descricao, categoria: m.categoria, subcategoria: m.subcategoria,
        entradaFmt: m.entrada ? formatCurrency(m.entrada) : '', saidaFmt: m.saida ? formatCurrency(m.saida) : '', saldoFmt: formatCurrency(m.saldo),
      })),
    ];
    exportToPDF(data, cols, `Extrato - ${contas.find(c => c.id === contaId)?.nome ?? ''}`, 'extrato');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Extratos</h1><p className="text-muted-foreground">Extrato com saldo progressivo</p></div>
        {generated && <Button variant="outline" onClick={handleExportPDF}><Download className="mr-2 h-4 w-4" /> PDF</Button>}
      </div>
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Conta</label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data inicial</label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-[160px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data final</label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-[160px]" />
            </div>
            <Button onClick={generate}>Gerar</Button>
          </div>
        </CardContent>
      </Card>
      {generated && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5 text-accent" /> Extrato</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left">
                  <th className="py-2 px-3">Data</th><th className="py-2 px-3">Descrição</th><th className="py-2 px-3">Categoria</th><th className="py-2 px-3">Subcategoria</th>
                  <th className="py-2 px-3 text-right">Entrada</th><th className="py-2 px-3 text-right">Saída</th><th className="py-2 px-3 text-right">Saldo</th>
                </tr></thead>
                <tbody>
                  <tr className="border-b bg-muted/30 font-medium">
                    <td className="py-2 px-3" colSpan={6}>Saldo Anterior</td>
                    <td className={`py-2 px-3 text-right ${saldoAnterior >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(saldoAnterior)}</td>
                  </tr>
                  {movimentos.map((m, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">{m.data}</td>
                      <td className="py-2 px-3">{m.descricao}</td>
                      <td className="py-2 px-3">{m.categoria}</td>
                      <td className="py-2 px-3">{m.subcategoria}</td>
                      <td className="py-2 px-3 text-right text-green-600">{m.entrada ? formatCurrency(m.entrada) : ''}</td>
                      <td className="py-2 px-3 text-right text-red-600">{m.saida ? formatCurrency(m.saida) : ''}</td>
                      <td className={`py-2 px-3 text-right font-medium ${m.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
