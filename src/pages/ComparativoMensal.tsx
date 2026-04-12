import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getMonthName } from '@/lib/financial';
import { exportToPDF } from '@/lib/export';

type ItemFaturaReport = {
  valor: number;
  categoria_id: string | null;
  data: string | null;
  competencia: string | null;
  faturas_cartao?: {
    mes_ano: string | null;
    data_vencimento: string | null;
  } | null;
};

export default function ComparativoMensal() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [tipoData, setTipoData] = useState('competencia');
  const [dataInicio, setDataInicio] = useState(`${currentYear}-01`);
  const [dataFim, setDataFim] = useState(`${currentYear}-12`);
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [catMonthData, setCatMonthData] = useState<Record<string, Record<string, number>>>({});
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome')
      .then(({ data }) => { if (data) { setCategorias(data); setSelectedCats(data.map(c => c.id)); } });
  }, [user]);

  const getMonthsBetween = (start: string, end: string) => {
    const result: string[] = [];
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      result.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    return result;
  };

  const generate = async () => {
    if (!user || !dataInicio || !dataFim) return;
    const mths = getMonthsBetween(dataInicio, dataFim);
    setMonths(mths);

    const catMap: Record<string, string> = {};
    categorias.forEach(c => { catMap[c.id] = c.nome; });
    const cartaoCatId = categorias.find(c => c.nome === 'Cartão De Crédito')?.id;

    const data: Record<string, Record<string, number>> = {};

    // Despesas (excl Cartão De Crédito)
    let dq = supabase.from('despesas').select('categoria_id, valor, competencia, data_pagamento').eq('usuario_id', user.id);
    if (tipoData === 'competencia') dq = dq.gte('competencia', dataInicio).lte('competencia', dataFim);
    else dq = dq.gte('data_pagamento', dataInicio + '-01').lte('data_pagamento', dataFim + '-31');
    if (selectedCats.length < categorias.length) dq = dq.in('categoria_id', selectedCats);
    const { data: despesas } = await dq;

    despesas?.forEach(d => {
      if (d.categoria_id === cartaoCatId) return;
      const catNome = d.categoria_id ? catMap[d.categoria_id] ?? 'Sem' : 'Sem';
      const month = tipoData === 'competencia' ? d.competencia : d.data_pagamento?.substring(0, 7);
      if (!month) return;
      if (!data[catNome]) data[catNome] = {};
      data[catNome][month] = (data[catNome][month] ?? 0) + d.valor;
    });

    // Itens fatura
    let iq = supabase
      .from('itens_fatura')
      .select('categoria_id, valor, competencia, data, faturas_cartao(mes_ano, data_vencimento)')
      .eq('usuario_id', user.id);
    if (selectedCats.length < categorias.length) iq = iq.in('categoria_id', selectedCats);
    const { data: itens } = await iq;

    ((itens ?? []) as ItemFaturaReport[])
      .filter((it) => {
        const compRef = it.faturas_cartao?.mes_ano ?? it.competencia;
        const dataRef = it.faturas_cartao?.data_vencimento ?? it.data;

        if (tipoData === 'competencia') {
          return Boolean(compRef && compRef >= dataInicio && compRef <= dataFim);
        }

        return Boolean(dataRef && dataRef >= `${dataInicio}-01` && dataRef <= `${dataFim}-31`);
      })
      .forEach(it => {
      const catNome = it.categoria_id ? catMap[it.categoria_id] ?? 'Sem' : 'Sem';
      const month =
        tipoData === 'competencia'
          ? (it.faturas_cartao?.mes_ano ?? it.competencia)
          : (it.faturas_cartao?.data_vencimento ?? it.data)?.substring(0, 7);
      if (!month) return;
      if (!data[catNome]) data[catNome] = {};
      data[catNome][month] = (data[catNome][month] ?? 0) + it.valor;
    });

    setCatMonthData(data);
    setGenerated(true);
  };

  const toggleCat = (id: string) => setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const formatMonth = (m: string) => { const [y, mo] = m.split('-'); return `${getMonthName(Number(mo) - 1).substring(0, 3)}/${y}`; };

  const handleExportPDF = () => {
    const cols = [{ header: 'Categoria', key: 'cat' }, ...months.map(m => ({ header: formatMonth(m), key: m })), { header: 'Total', key: 'total' }];
    const rows = Object.keys(catMonthData).sort().map(catNome => {
      const row: Record<string, any> = { cat: catNome };
      let total = 0;
      months.forEach(m => { const v = catMonthData[catNome][m] ?? 0; row[m] = formatCurrency(v); total += v; });
      row.total = formatCurrency(total);
      return row;
    });
    exportToPDF(rows, cols, 'Comparativo Mensal', 'comparativo-mensal');
  };

  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);
  const CompSelect = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => {
    const parts = value ? value.split('-') : [String(currentYear), '01'];
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <div className="flex gap-1">
          <Select value={parts[1] || '01'} onValueChange={(v) => onChange(`${parts[0]}-${v}`)}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>{getMonthName(i)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={parts[0] || String(currentYear)} onValueChange={(v) => onChange(`${v}-${parts[1]}`)}>
            <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Comparativo Mensal</h1><p className="text-muted-foreground">Categoria × Mês</p></div>
        {generated && <Button variant="outline" onClick={handleExportPDF}><Download className="mr-2 h-4 w-4" /> PDF</Button>}
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo de data</label>
              <Select value={tipoData} onValueChange={setTipoData}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="competencia">Competência</SelectItem><SelectItem value="pagamento">Pagamento</SelectItem></SelectContent>
              </Select>
            </div>
            <CompSelect value={dataInicio} onChange={setDataInicio} label="Início" />
            <CompSelect value={dataFim} onChange={setDataFim} label="Fim" />
            <Button onClick={generate}>Gerar</Button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Categorias</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {categorias.map(c => (
                <label key={c.id} className="flex items-center gap-1 text-xs cursor-pointer">
                  <Checkbox checked={selectedCats.includes(c.id)} onCheckedChange={() => toggleCat(c.id)} />{c.nome}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      {generated && (
        <Card>
          <CardContent className="pt-4">
            {Object.keys(catMonthData).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado encontrado para o periodo e filtros selecionados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b"><th className="py-1 px-2 text-left">Categoria</th>{months.map(m => <th key={m} className="py-1 px-2 text-right">{formatMonth(m)}</th>)}<th className="py-1 px-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {Object.keys(catMonthData).sort().map(catNome => {
                      let total = 0;
                      return (
                        <tr key={catNome} className="border-b hover:bg-muted/50">
                          <td className="py-1 px-2">{catNome}</td>
                          {months.map(m => { const v = catMonthData[catNome][m] ?? 0; total += v; return <td key={m} className="py-1 px-2 text-right">{v ? formatCurrency(v) : '-'}</td>; })}
                          <td className="py-1 px-2 text-right font-medium">{formatCurrency(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold border-t">
                      <td className="py-1 px-2">Total</td>
                      {months.map(m => {
                        const v = Object.values(catMonthData).reduce((s, d) => s + (d[m] ?? 0), 0);
                        return <td key={m} className="py-1 px-2 text-right">{formatCurrency(v)}</td>;
                      })}
                      <td className="py-1 px-2 text-right">{formatCurrency(Object.values(catMonthData).reduce((s, d) => s + Object.values(d).reduce((a, b) => a + b, 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
