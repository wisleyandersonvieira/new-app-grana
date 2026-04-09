import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart3, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getMonthName } from '@/lib/financial';
import * as XLSX from 'xlsx';

type CatData = Record<string, Record<string, number>>; // catNome -> month -> value
type SubData = Record<string, Record<string, Record<string, number>>>; // catNome -> subNome -> month -> value

export default function RelatorioCompleto() {
  const { user } = useAuth();
  const [tipoData, setTipoData] = useState('competencia');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [subcategorias, setSubcategorias] = useState<{ id: string; nome: string; categoria_id: string }[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [receitaData, setReceitaData] = useState<{ cats: CatData; subs: SubData; totals: Record<string, number> }>({ cats: {}, subs: {}, totals: {} });
  const [despesaData, setDespesaData] = useState<{ cats: CatData; subs: SubData; totals: Record<string, number> }>({ cats: {}, subs: {}, totals: {} });
  const [investData, setInvestData] = useState<{ cats: CatData; subs: SubData; totals: Record<string, number> }>({ cats: {}, subs: {}, totals: {} });
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id').eq('usuario_id', user.id).order('nome'),
    ]).then(([{ data: cats }, { data: subs }]) => {
      if (cats) { setCategorias(cats); setSelectedCats(cats.map(c => c.id)); }
      if (subs) setSubcategorias(subs);
    });
  }, [user]);

  const getMonthsBetween = (start: string, end: string) => {
    const result: string[] = [];
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      result.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return result;
  };

  const processData = (items: any[], catMap: Record<string, string>, subMap: Record<string, { nome: string; catId: string }>, dateField: string) => {
    const cats: CatData = {};
    const subs: SubData = {};
    const totals: Record<string, number> = {};
    items.forEach(item => {
      const month = tipoData === 'competencia' ? item.competencia : (item[dateField] ?? item.data)?.substring(0, 7);
      if (!month) return;
      const catNome = item.categoria_id ? catMap[item.categoria_id] ?? 'Sem categoria' : 'Sem categoria';
      const subInfo = item.subcategoria_id ? subMap[item.subcategoria_id] : null;
      const subNome = subInfo?.nome ?? 'Sem subcategoria';

      if (!cats[catNome]) cats[catNome] = {};
      cats[catNome][month] = (cats[catNome][month] ?? 0) + item.valor;
      if (!subs[catNome]) subs[catNome] = {};
      if (!subs[catNome][subNome]) subs[catNome][subNome] = {};
      subs[catNome][subNome][month] = (subs[catNome][subNome][month] ?? 0) + item.valor;
      totals[month] = (totals[month] ?? 0) + item.valor;
    });
    return { cats, subs, totals };
  };

  const generate = async () => {
    if (!user || !dataInicio || !dataFim) return;
    const mths = getMonthsBetween(dataInicio, dataFim);
    setMonths(mths);

    const catMap: Record<string, string> = {};
    categorias.forEach(c => { catMap[c.id] = c.nome; });
    const subMap: Record<string, { nome: string; catId: string }> = {};
    subcategorias.forEach(s => { subMap[s.id] = { nome: s.nome, catId: s.categoria_id }; });

    const investCatId = categorias.find(c => c.nome === 'Investimentos')?.id;
    const dateCol = tipoData === 'competencia' ? 'competencia' : 'data_pagamento';

    // Receitas
    let rq = supabase.from('receitas').select('*').eq('usuario_id', user.id);
    if (tipoData === 'competencia') rq = rq.gte('competencia', dataInicio).lte('competencia', dataFim);
    else rq = rq.gte('data_pagamento', dataInicio + '-01').lte('data_pagamento', dataFim + '-31');
    if (selectedCats.length < categorias.length) rq = rq.in('categoria_id', selectedCats);
    const { data: receitas } = await rq;

    // Despesas (excl investimentos)
    let dq = supabase.from('despesas').select('*').eq('usuario_id', user.id);
    if (tipoData === 'competencia') dq = dq.gte('competencia', dataInicio).lte('competencia', dataFim);
    else dq = dq.gte('data_pagamento', dataInicio + '-01').lte('data_pagamento', dataFim + '-31');
    if (selectedCats.length < categorias.length) dq = dq.in('categoria_id', selectedCats);
    const { data: allDespesas } = await dq;

    const despesas = allDespesas?.filter(d => d.categoria_id !== investCatId) ?? [];
    const invest = allDespesas?.filter(d => d.categoria_id === investCatId) ?? [];

    setReceitaData(processData(receitas ?? [], catMap, subMap, dateCol));
    setDespesaData(processData(despesas, catMap, subMap, dateCol));
    setInvestData(processData(invest, catMap, subMap, dateCol));
    setGenerated(true);
  };

  const toggleCat = (id: string) => {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const formatMonth = (m: string) => { const [y, mo] = m.split('-'); return `${getMonthName(Number(mo) - 1).substring(0, 3)}/${y}`; };

  const SectionTable = ({ title, data }: { title: string; data: { cats: CatData; subs: SubData; totals: Record<string, number> } }) => (
    <div className="mb-6">
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b"><th className="py-1 px-2 text-left">Categoria / Subcategoria</th>
              {months.map(m => <th key={m} className="py-1 px-2 text-right">{formatMonth(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.keys(data.cats).sort().map(catNome => (
              <>
                <tr key={catNome} className="border-b font-medium bg-muted/30">
                  <td className="py-1 px-2">{catNome}</td>
                  {months.map(m => <td key={m} className="py-1 px-2 text-right">{formatCurrency(data.cats[catNome][m] ?? 0)}</td>)}
                </tr>
                {data.subs[catNome] && Object.keys(data.subs[catNome]).sort().map(subNome => (
                  <tr key={`${catNome}-${subNome}`} className="border-b">
                    <td className="py-1 px-2 pl-6 text-muted-foreground">{subNome}</td>
                    {months.map(m => <td key={m} className="py-1 px-2 text-right text-muted-foreground">{formatCurrency(data.subs[catNome][subNome][m] ?? 0)}</td>)}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold border-t">
              <td className="py-1 px-2">Total {title}</td>
              {months.map(m => <td key={m} className="py-1 px-2 text-right">{formatCurrency(data.totals[m] ?? 0)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const makeSheet = (data: { cats: CatData; subs: SubData; totals: Record<string, number> }) => {
      const rows: Record<string, any>[] = [];
      Object.keys(data.cats).sort().forEach(catNome => {
        const row: Record<string, any> = { 'Categoria/Subcategoria': catNome };
        months.forEach(m => { row[formatMonth(m)] = data.cats[catNome][m] ?? 0; });
        rows.push(row);
        if (data.subs[catNome]) {
          Object.keys(data.subs[catNome]).sort().forEach(subNome => {
            const sr: Record<string, any> = { 'Categoria/Subcategoria': `  ${subNome}` };
            months.forEach(m => { sr[formatMonth(m)] = data.subs[catNome][subNome][m] ?? 0; });
            rows.push(sr);
          });
        }
      });
      return XLSX.utils.json_to_sheet(rows);
    };
    XLSX.utils.book_append_sheet(wb, makeSheet(receitaData), 'Receitas');
    XLSX.utils.book_append_sheet(wb, makeSheet(despesaData), 'Despesas');
    XLSX.utils.book_append_sheet(wb, makeSheet(investData), 'Investimentos');

    // Saldo Final sheet
    const saldoRows: Record<string, any>[] = [{}];
    const sr: Record<string, any> = { 'Item': 'Saldo Final' };
    months.forEach(m => {
      sr[formatMonth(m)] = (receitaData.totals[m] ?? 0) - (despesaData.totals[m] ?? 0) - (investData.totals[m] ?? 0);
    });
    saldoRows[0] = sr;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(saldoRows), 'Saldo Final');
    XLSX.writeFile(wb, 'relatorio-completo.xlsx');
  };

  const currentYear = new Date().getFullYear();
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
        <div><h1 className="text-2xl font-bold">Relatório Completo</h1><p className="text-muted-foreground">Visão completa por seção</p></div>
        {generated && <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Excel</Button>}
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo de data</label>
              <Select value={tipoData} onValueChange={setTipoData}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="competencia">Competência</SelectItem>
                  <SelectItem value="pagamento">Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CompSelect value={dataInicio || `${currentYear}-01`} onChange={setDataInicio} label="Início" />
            <CompSelect value={dataFim || `${currentYear}-12`} onChange={setDataFim} label="Fim" />
            <Button onClick={generate}>Gerar</Button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Categorias</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {categorias.map(c => (
                <label key={c.id} className="flex items-center gap-1 text-xs cursor-pointer">
                  <Checkbox checked={selectedCats.includes(c.id)} onCheckedChange={() => toggleCat(c.id)} />
                  {c.nome}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      {generated && (
        <Card>
          <CardContent className="pt-4">
            <SectionTable title="Receitas" data={receitaData} />
            <SectionTable title="Despesas" data={despesaData} />
            <SectionTable title="Investimentos" data={investData} />
            <div className="mt-4">
              <h3 className="font-semibold text-lg mb-2">Saldo Final</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b"><th className="py-1 px-2 text-left"></th>{months.map(m => <th key={m} className="py-1 px-2 text-right">{formatMonth(m)}</th>)}</tr></thead>
                  <tbody>
                    <tr className="font-semibold">
                      <td className="py-1 px-2">Saldo Final</td>
                      {months.map(m => {
                        const v = (receitaData.totals[m] ?? 0) - (despesaData.totals[m] ?? 0) - (investData.totals[m] ?? 0);
                        return <td key={m} className={`py-1 px-2 text-right ${v >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(v)}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
