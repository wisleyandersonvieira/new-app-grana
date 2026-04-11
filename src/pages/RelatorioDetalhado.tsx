import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, ArrowUpDown, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getCurrentCompetencia, getMonthName } from '@/lib/financial';
import { exportToExcel } from '@/lib/export';

type Row = { data_pagamento: string; descricao: string; categoria: string; subcategoria: string; receita: number; despesa: number };

export default function RelatorioDetalhado() {
  const { user } = useAuth();
  const now = new Date();
  const [compInicio, setCompInicio] = useState(getCurrentCompetencia());
  const [compFim, setCompFim] = useState(getCurrentCompetencia());
  const [filterCat, setFilterCat] = useState('all');
  const [filterSub, setFilterSub] = useState('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [subcategorias, setSubcategorias] = useState<{ id: string; nome: string; categoria_id: string }[]>([]);
  const [sortKey, setSortKey] = useState<keyof Row>('data_pagamento');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id),
      supabase.from('subcategorias').select('id, nome, categoria_id').eq('usuario_id', user.id),
    ]).then(([{ data: cats }, { data: subs }]) => {
      if (cats) setCategorias(cats);
      if (subs) setSubcategorias(subs);
    });
  }, [user]);

  const generate = async () => {
    if (!user) return;
    const catMap: Record<string, string> = {};
    categorias.forEach(c => { catMap[c.id] = c.nome; });
    const subMap: Record<string, string> = {};
    subcategorias.forEach(s => { subMap[s.id] = s.nome; });

    const result: Row[] = [];

    // Receitas
    let rq = supabase.from('receitas').select('*').eq('usuario_id', user.id).gte('competencia', compInicio).lte('competencia', compFim);
    if (filterCat !== 'all') rq = rq.eq('categoria_id', filterCat);
    if (filterSub !== 'all') rq = rq.eq('subcategoria_id', filterSub);

    // Despesas (excl Cartão De Crédito)
    const cartaoCatId = categorias.find(c => c.nome === 'Cartão De Crédito')?.id;
    let dq = supabase.from('despesas').select('*').eq('usuario_id', user.id).gte('competencia', compInicio).lte('competencia', compFim);
    if (cartaoCatId) dq = dq.neq('categoria_id', cartaoCatId);
    if (filterCat !== 'all') dq = dq.eq('categoria_id', filterCat);
    if (filterSub !== 'all') dq = dq.eq('subcategoria_id', filterSub);

    // Itens fatura
    let iq = supabase.from('itens_fatura').select('*').eq('usuario_id', user.id).gte('competencia', compInicio).lte('competencia', compFim);
    if (filterCat !== 'all') iq = iq.eq('categoria_id', filterCat);
    if (filterSub !== 'all') iq = iq.eq('subcategoria_id', filterSub);
    const [{ data: receitas }, { data: despesas }, { data: itens }] = await Promise.all([rq, dq, iq]);

    receitas?.forEach(r => {
      result.push({
        data_pagamento: r.data_pagamento ?? r.data ?? '',
        descricao: r.descricao ?? '',
        categoria: r.categoria_id ? catMap[r.categoria_id] ?? '' : '',
        subcategoria: r.subcategoria_id ? subMap[r.subcategoria_id] ?? '' : '',
        receita: r.valor,
        despesa: 0,
      });
    });

    despesas?.forEach(d => {
      result.push({
        data_pagamento: d.data_pagamento ?? d.data ?? '',
        descricao: d.descricao ?? '',
        categoria: d.categoria_id ? catMap[d.categoria_id] ?? '' : '',
        subcategoria: d.subcategoria_id ? subMap[d.subcategoria_id] ?? '' : '',
        receita: 0,
        despesa: d.valor,
      });
    });

    itens?.forEach(it => {
      result.push({
        data_pagamento: it.data ?? '',
        descricao: it.descricao ?? '',
        categoria: it.categoria_id ? catMap[it.categoria_id] ?? '' : '',
        subcategoria: it.subcategoria_id ? subMap[it.subcategoria_id] ?? '' : '',
        receita: 0,
        despesa: it.valor,
      });
    });

    setRows(result);
  };

  useEffect(() => { if (categorias.length > 0) generate(); }, [user, compInicio, compFim, filterCat, filterSub, categorias]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: keyof Row) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const totalRec = rows.reduce((s, r) => s + r.receita, 0);
  const totalDesp = rows.reduce((s, r) => s + r.despesa, 0);

  const filteredSubs = filterCat !== 'all' ? subcategorias.filter(s => s.categoria_id === filterCat) : subcategorias;
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);

  const handleExport = () => {
    const data = sorted.map(r => ({
      'Data Pagamento': r.data_pagamento,
      Descrição: r.descricao,
      Categoria: r.categoria,
      Subcategoria: r.subcategoria,
      'Receita (R$)': r.receita ? formatCurrency(r.receita) : '',
      'Despesa (R$)': r.despesa ? formatCurrency(r.despesa) : '',
    }));
    exportToExcel(data, [
      { header: 'Data Pagamento', key: 'Data Pagamento' },
      { header: 'Descrição', key: 'Descrição' },
      { header: 'Categoria', key: 'Categoria' },
      { header: 'Subcategoria', key: 'Subcategoria' },
      { header: 'Receita (R$)', key: 'Receita (R$)' },
      { header: 'Despesa (R$)', key: 'Despesa (R$)' },
    ], 'relatorio-detalhado');
  };

  const CompSelect = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => {
    const [y, m] = value.split('-');
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <div className="flex gap-1">
          <Select value={m} onValueChange={(v) => onChange(`${y}-${v}`)}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>{getMonthName(i)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={y} onValueChange={(v) => onChange(`${v}-${m}`)}>
            <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(yr => <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  const SortHeader = ({ label, field }: { label: string; field: keyof Row }) => (
    <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <span className="flex items-center gap-1">{label} <ArrowUpDown className="h-3 w-3" /></span>
    </th>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Relatório Detalhado</h1><p className="text-muted-foreground">Receitas e despesas unificadas</p></div>
        <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Excel</Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <CompSelect value={compInicio} onChange={setCompInicio} label="Competência início" />
            <CompSelect value={compFim} onChange={setCompFim} label="Competência fim" />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Categoria</label>
              <Select value={filterCat} onValueChange={(v) => { setFilterCat(v); setFilterSub('all'); }}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Subcategoria</label>
              <Select value={filterSub} onValueChange={setFilterSub}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filteredSubs.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5 text-accent" /> Resultado</CardTitle></CardHeader>
        <CardContent>
          {sorted.length === 0 ? <p className="text-muted-foreground text-sm">Sem dados.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <SortHeader label="Data Pgto" field="data_pagamento" />
                    <SortHeader label="Descrição" field="descricao" />
                    <SortHeader label="Categoria" field="categoria" />
                    <SortHeader label="Subcategoria" field="subcategoria" />
                    <th className="py-2 px-3 text-right cursor-pointer" onClick={() => toggleSort('receita')}>Receita (R$)</th>
                    <th className="py-2 px-3 text-right cursor-pointer" onClick={() => toggleSort('despesa')}>Despesa (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">{r.data_pagamento}</td>
                      <td className="py-2 px-3">{r.descricao}</td>
                      <td className="py-2 px-3">{r.categoria}</td>
                      <td className="py-2 px-3">{r.subcategoria}</td>
                      <td className="py-2 px-3 text-right">{r.receita ? formatCurrency(r.receita) : ''}</td>
                      <td className="py-2 px-3 text-right">{r.despesa ? formatCurrency(r.despesa) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t">
                    <td colSpan={4} className="py-2 px-3 text-right">Totais:</td>
                    <td className="py-2 px-3 text-right text-green-600">{formatCurrency(totalRec)}</td>
                    <td className="py-2 px-3 text-right text-red-600">{formatCurrency(totalDesp)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td colSpan={4} className="py-2 px-3 text-right">Resultado:</td>
                    <td colSpan={2} className={`py-2 px-3 text-right ${totalRec - totalDesp >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(totalRec - totalDesp)}
                    </td>
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
