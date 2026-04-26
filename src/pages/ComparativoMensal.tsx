import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getMonthName } from '@/lib/financial';
import {
  type ComparisonDateType,
  type InvoicePaymentRow,
  buildInvoicePaymentDateMap,
  getPaidInvoiceIds,
  getMonthDateRange,
  getMonthKey,
  getMonthsBetween,
  isInvoiceItemWithinRange,
  resolveInvoiceItemMonth,
} from '@/lib/comparativo-mensal';
import { exportToPDF } from '@/lib/export';
import {
  isCreditCardCategoryName,
  sanitizeCreditCardCategoryData,
} from '@/lib/credit-card-category';

type ItemFaturaReport = {
  fatura_id: string;
  valor: number;
  categoria_id: string | null;
  data: string | null;
  competencia: string | null;
  faturas_cartao?: {
    mes_ano: string | null;
    data_vencimento: string | null;
  } | null;
};

type SectionData = Record<string, Record<string, number>>;

export default function ComparativoMensal() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [tipoData, setTipoData] = useState<ComparisonDateType>('competencia');
  const [dataInicio, setDataInicio] = useState(`${currentYear}-01`);
  const [dataFim, setDataFim] = useState(`${currentYear}-12`);
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [reportData, setReportData] = useState<{ entradas: SectionData; saidas: SectionData }>({
    entradas: {},
    saidas: {},
  });
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome')
      .then(({ data }) => { if (data) { setCategorias(data); setSelectedCats(data.map(c => c.id)); } });
  }, [user]);

  const addSectionValue = (
    sectionData: SectionData,
    categoryName: string,
    month: string,
    value: number,
  ) => {
    if (!sectionData[categoryName]) sectionData[categoryName] = {};
    sectionData[categoryName][month] = (sectionData[categoryName][month] ?? 0) + value;
  };

  const getSectionMonthTotal = (sectionData: SectionData, month: string) =>
    Object.values(sectionData).reduce((sum, monthData) => sum + (monthData[month] ?? 0), 0);

  const getSectionGrandTotal = (sectionData: SectionData) =>
    Object.values(sectionData).reduce(
      (sum, monthData) => sum + Object.values(monthData).reduce((subtotal, value) => subtotal + value, 0),
      0,
    );

  const generate = async () => {
    if (!user || !dataInicio || !dataFim) return;
    await sanitizeCreditCardCategoryData(user.id);
    const mths = getMonthsBetween(dataInicio, dataFim);
    const { start: inicioDia, end: fimDia } = {
      start: getMonthDateRange(dataInicio).start,
      end: getMonthDateRange(dataFim).end,
    };
    setMonths(mths);

    const catMap: Record<string, string> = {};
    categorias.forEach(c => { catMap[c.id] = c.nome; });
    const cartaoCatIds = new Set(
      categorias
        .filter(c => isCreditCardCategoryName(c.nome))
        .map(c => c.id),
    );
    let invoicePayments = new Map<string, string>();

    const nextReportData: { entradas: SectionData; saidas: SectionData } = {
      entradas: {},
      saidas: {},
    };

    // Receitas
    let rq = supabase
      .from('receitas')
      .select('categoria_id, valor, competencia, data_pagamento')
      .eq('usuario_id', user.id);
    if (tipoData === 'competencia') rq = rq.gte('competencia', dataInicio).lte('competencia', dataFim);
    else rq = rq.gte('data_pagamento', inicioDia).lte('data_pagamento', fimDia);
    if (selectedCats.length < categorias.length) rq = rq.in('categoria_id', selectedCats);
    const { data: receitas } = await rq;

    receitas?.forEach((r) => {
      const catNome = r.categoria_id ? catMap[r.categoria_id] ?? 'Sem' : 'Sem';
      const month = tipoData === 'competencia' ? getMonthKey(r.competencia) : getMonthKey(r.data_pagamento);
      if (!month) return;
      addSectionValue(nextReportData.entradas, catNome, month, r.valor);
    });

    // Despesas (exclui todas as categorias de fatura consolidada do cartão)
    let dq = supabase
      .from('despesas')
      .select('categoria_id, valor, competencia, data_pagamento')
      .eq('usuario_id', user.id);
    if (tipoData === 'competencia') dq = dq.gte('competencia', dataInicio).lte('competencia', dataFim);
    else dq = dq.gte('data_pagamento', inicioDia).lte('data_pagamento', fimDia);
    if (selectedCats.length < categorias.length) dq = dq.in('categoria_id', selectedCats);
    const { data: despesas } = await dq;

    despesas?.forEach(d => {
      if (d.categoria_id && cartaoCatIds.has(d.categoria_id)) return;
      const catNome = d.categoria_id ? catMap[d.categoria_id] ?? 'Sem' : 'Sem';
      const month = tipoData === 'competencia' ? getMonthKey(d.competencia) : getMonthKey(d.data_pagamento);
      if (!month) return;
      addSectionValue(nextReportData.saidas, catNome, month, -d.valor);
    });

    // Itens fatura
    let itens: ItemFaturaReport[] = [];
    if (tipoData === 'pagamento') {
      let pq = supabase
        .from('despesas')
        .select('lote_id, data_pagamento')
        .eq('usuario_id', user.id)
        .not('lote_id', 'is', null)
        .not('data_pagamento', 'is', null);
      pq = pq.gte('data_pagamento', inicioDia).lte('data_pagamento', fimDia);

      const { data: pagamentosFatura } = await pq;
      const paymentRows = (pagamentosFatura ?? []) as InvoicePaymentRow[];
      invoicePayments = buildInvoicePaymentDateMap(paymentRows);
      const invoiceIds = getPaidInvoiceIds(paymentRows);

      if (invoiceIds.length > 0) {
        let iq = supabase
          .from('itens_fatura')
          .select('fatura_id, categoria_id, valor, competencia, data, faturas_cartao(mes_ano, data_vencimento)')
          .eq('usuario_id', user.id)
          .in('fatura_id', invoiceIds);
        if (selectedCats.length < categorias.length) iq = iq.in('categoria_id', selectedCats);
        const { data: paidItems } = await iq;
        itens = (paidItems ?? []) as ItemFaturaReport[];
      }
    } else {
      // Server-side competencia range filter prevents hitting Supabase's 1000-row default limit.
      let iq = supabase
        .from('itens_fatura')
        .select('fatura_id, categoria_id, valor, competencia, data, faturas_cartao(mes_ano, data_vencimento)')
        .eq('usuario_id', user.id)
        .gte('competencia', inicioDia)
        .lte('competencia', fimDia);
      if (selectedCats.length < categorias.length) iq = iq.in('categoria_id', selectedCats);
      const { data: competenciaItems } = await iq;
      itens = (competenciaItems ?? []) as ItemFaturaReport[];
    }

    itens
      .filter((it) => {
        if (it.categoria_id && cartaoCatIds.has(it.categoria_id)) return false;

        return isInvoiceItemWithinRange({
          tipoData,
          competencia: it.faturas_cartao?.mes_ano ?? it.competencia,
          paymentDate: invoicePayments.get(it.fatura_id),
          startMonth: dataInicio,
          endMonth: dataFim,
          startDate: inicioDia,
          endDate: fimDia,
        });
      })
      .forEach((it) => {
      const catNome = it.categoria_id ? catMap[it.categoria_id] ?? 'Sem' : 'Sem';
      const month = resolveInvoiceItemMonth({
        tipoData,
        competencia: it.faturas_cartao?.mes_ano ?? it.competencia,
        paymentDate: invoicePayments.get(it.fatura_id),
      });
      if (!month) return;
      addSectionValue(nextReportData.saidas, catNome, month, -it.valor);
    });

    setReportData(nextReportData);
    setGenerated(true);
  };

  const toggleCat = (id: string) => setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const formatMonth = (m: string) => { const [y, mo] = m.split('-'); return `${getMonthName(Number(mo) - 1).substring(0, 3)}/${y}`; };

  const handleExportPDF = () => {
    const cols = [{ header: 'Categoria', key: 'cat' }, ...months.map(m => ({ header: formatMonth(m), key: m })), { header: 'Total', key: 'total' }];
    const buildSectionExportRows = (title: string, sectionData: SectionData, subtotalLabel: string) => {
      if (Object.keys(sectionData).length === 0) return [];

      const titleRow: Record<string, any> = { cat: title };
      months.forEach((month) => { titleRow[month] = ''; });
      titleRow.total = '';

      const dataRows = Object.keys(sectionData).sort().map((catNome) => {
        const row: Record<string, any> = { cat: catNome };
        let total = 0;
        months.forEach((month) => {
          const value = sectionData[catNome][month] ?? 0;
          row[month] = value ? formatCurrency(value) : '-';
          total += value;
        });
        row.total = formatCurrency(total);
        return row;
      });

      const subtotalRow: Record<string, any> = { cat: subtotalLabel };
      months.forEach((month) => { subtotalRow[month] = formatCurrency(getSectionMonthTotal(sectionData, month)); });
      subtotalRow.total = formatCurrency(getSectionGrandTotal(sectionData));

      return [titleRow, ...dataRows, subtotalRow];
    };

    const saldoRow: Record<string, any> = { cat: 'Saldo' };
    months.forEach((month) => {
      saldoRow[month] = formatCurrency(
        getSectionMonthTotal(reportData.entradas, month) + getSectionMonthTotal(reportData.saidas, month),
      );
    });
    saldoRow.total = formatCurrency(
      getSectionGrandTotal(reportData.entradas) + getSectionGrandTotal(reportData.saidas),
    );

    const rows = [
      ...buildSectionExportRows('ENTRADAS', reportData.entradas, 'Total Entradas'),
      ...buildSectionExportRows('SAÍDAS', reportData.saidas, 'Total Saídas'),
      saldoRow,
    ];
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
              <Select value={tipoData} onValueChange={(value) => setTipoData(value as ComparisonDateType)}>
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
            {Object.keys(reportData.entradas).length === 0 && Object.keys(reportData.saidas).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado encontrado para o periodo e filtros selecionados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b"><th className="py-1 px-2 text-left">Categoria</th>{months.map(m => <th key={m} className="py-1 px-2 text-right">{formatMonth(m)}</th>)}<th className="py-1 px-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {Object.keys(reportData.entradas).length > 0 && (
                      <>
                        <tr className="border-b bg-green-50/70 font-semibold text-green-700">
                          <td className="py-1.5 px-2">ENTRADAS</td>
                          {months.map((month) => <td key={month} className="py-1.5 px-2 text-right" />)}
                          <td className="py-1.5 px-2 text-right" />
                        </tr>
                        {Object.keys(reportData.entradas).sort().map((catNome) => {
                          let total = 0;
                          return (
                            <tr key={`entrada-${catNome}`} className="border-b hover:bg-muted/50">
                              <td className="py-1 px-2">{catNome}</td>
                              {months.map((month) => {
                                const value = reportData.entradas[catNome][month] ?? 0;
                                total += value;
                                return <td key={month} className="py-1 px-2 text-right text-green-600">{value ? formatCurrency(value) : '-'}</td>;
                              })}
                              <td className="py-1 px-2 text-right font-medium text-green-700">{formatCurrency(total)}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-b bg-green-50/40 font-semibold">
                          <td className="py-1.5 px-2">Total Entradas</td>
                          {months.map((month) => (
                            <td key={month} className="py-1.5 px-2 text-right text-green-700">
                              {formatCurrency(getSectionMonthTotal(reportData.entradas, month))}
                            </td>
                          ))}
                          <td className="py-1.5 px-2 text-right text-green-700">{formatCurrency(getSectionGrandTotal(reportData.entradas))}</td>
                        </tr>
                      </>
                    )}
                    {Object.keys(reportData.saidas).length > 0 && (
                      <>
                        <tr className="border-b bg-red-50/70 font-semibold text-red-700">
                          <td className="py-1.5 px-2">SAÍDAS</td>
                          {months.map((month) => <td key={month} className="py-1.5 px-2 text-right" />)}
                          <td className="py-1.5 px-2 text-right" />
                        </tr>
                        {Object.keys(reportData.saidas).sort().map((catNome) => {
                          let total = 0;
                          return (
                            <tr key={`saida-${catNome}`} className="border-b hover:bg-muted/50">
                              <td className="py-1 px-2">{catNome}</td>
                              {months.map((month) => {
                                const value = reportData.saidas[catNome][month] ?? 0;
                                total += value;
                                return <td key={month} className="py-1 px-2 text-right text-red-600">{value ? formatCurrency(value) : '-'}</td>;
                              })}
                              <td className="py-1 px-2 text-right font-medium text-red-700">{formatCurrency(total)}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-b bg-red-50/40 font-semibold">
                          <td className="py-1.5 px-2">Total Saídas</td>
                          {months.map((month) => (
                            <td key={month} className="py-1.5 px-2 text-right text-red-700">
                              {formatCurrency(getSectionMonthTotal(reportData.saidas, month))}
                            </td>
                          ))}
                          <td className="py-1.5 px-2 text-right text-red-700">{formatCurrency(getSectionGrandTotal(reportData.saidas))}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold border-t">
                      <td className="py-1 px-2">Saldo</td>
                      {months.map(m => {
                        const v = getSectionMonthTotal(reportData.entradas, m) + getSectionMonthTotal(reportData.saidas, m);
                        return <td key={m} className="py-1 px-2 text-right">{formatCurrency(v)}</td>;
                      })}
                      <td className="py-1 px-2 text-right">{formatCurrency(getSectionGrandTotal(reportData.entradas) + getSectionGrandTotal(reportData.saidas))}</td>
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
