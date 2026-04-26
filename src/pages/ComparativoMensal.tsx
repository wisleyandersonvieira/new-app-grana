import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, Download, Filter, Play, Tags } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getMonthName } from '@/lib/financial';
import {
  type ComparisonDateType,
  type InvoiceReferenceRow,
  type InvoicePaymentRow,
  buildInvoicePaymentDateMap,
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
    status?: string | null;
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
  const [categoriesOpen, setCategoriesOpen] = useState(false);

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
        .select('lote_id, data_pagamento, categoria_id, competencia, valor')
        .eq('usuario_id', user.id)
        .not('data_pagamento', 'is', null);
      pq = pq.gte('data_pagamento', inicioDia).lte('data_pagamento', fimDia);

      const [{ data: pagamentosFatura }, { data: faturasReferencia }] = await Promise.all([
        pq,
        supabase
          .from('faturas_cartao')
          .select('id, mes_ano, valor_total, data_vencimento, status')
          .eq('usuario_id', user.id),
      ]);
      const paymentRows = (pagamentosFatura ?? []) as InvoicePaymentRow[];
      const invoiceRows = (faturasReferencia ?? []) as InvoiceReferenceRow[];
      invoicePayments = buildInvoicePaymentDateMap(paymentRows, invoiceRows, cartaoCatIds);
      const fallbackInvoicePayments = new Map(
        (faturasReferencia ?? [])
          .filter((invoice) => {
            const date = invoice.data_vencimento;
            return Boolean(date && date >= inicioDia && date <= fimDia);
          })
          .map((invoice) => [invoice.id, invoice.data_vencimento as string]),
      );
      const invoiceIds = Array.from(new Set([...invoicePayments.keys(), ...fallbackInvoicePayments.keys()]));

      if (invoiceIds.length > 0) {
        let iq = supabase
          .from('itens_fatura')
          .select('fatura_id, categoria_id, valor, competencia, data, faturas_cartao(mes_ano, data_vencimento, status)')
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
        .select('fatura_id, categoria_id, valor, competencia, data, faturas_cartao(mes_ano, data_vencimento, status)')
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
        const invoicePaymentDate =
          invoicePayments.get(it.fatura_id) ??
          (it.faturas_cartao?.status === 'quitada' ? it.faturas_cartao?.data_vencimento : null) ??
          it.data;

        return isInvoiceItemWithinRange({
          tipoData,
          competencia: it.faturas_cartao?.mes_ano ?? it.competencia,
          paymentDate: invoicePaymentDate,
          startMonth: dataInicio,
          endMonth: dataFim,
          startDate: inicioDia,
          endDate: fimDia,
        });
      })
      .forEach((it) => {
      const catNome = it.categoria_id ? catMap[it.categoria_id] ?? 'Sem' : 'Sem';
      const invoicePaymentDate =
        invoicePayments.get(it.fatura_id) ??
        (it.faturas_cartao?.status === 'quitada' ? it.faturas_cartao?.data_vencimento : null) ??
        it.data;
      const month = resolveInvoiceItemMonth({
        tipoData,
        competencia: it.faturas_cartao?.mes_ano ?? it.competencia,
        paymentDate: invoicePaymentDate,
      });
      if (!month) return;
      addSectionValue(nextReportData.saidas, catNome, month, -it.valor);
    });

    setReportData(nextReportData);
    setGenerated(true);
  };

  const toggleCat = (id: string) => setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const formatMonth = (m: string) => { const [y, mo] = m.split('-'); return `${getMonthName(Number(mo) - 1).substring(0, 3)}/${y}`; };

  const selectedCategoryNames = useMemo(
    () => categorias.filter((categoria) => selectedCats.includes(categoria.id)).map((categoria) => categoria.nome),
    [categorias, selectedCats],
  );

  const categorySummary = useMemo(() => {
    if (categorias.length === 0) return 'Nenhuma categoria cadastrada';
    if (selectedCats.length === categorias.length) return 'Todas as categorias';
    if (selectedCats.length === 0) return 'Nenhuma categoria selecionada';

    const visibleNames = selectedCategoryNames.slice(0, 2).join(', ');
    const hiddenCount = selectedCats.length - 2;
    return hiddenCount > 0 ? `${visibleNames} +${hiddenCount}` : visibleNames;
  }, [categorias.length, selectedCats.length, selectedCategoryNames]);

  const selectAllCategories = () => setSelectedCats(categorias.map((categoria) => categoria.id));
  const clearCategories = () => setSelectedCats([]);

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
      <div className="space-y-2">
        <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</label>
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Select value={parts[1] || '01'} onValueChange={(v) => onChange(`${parts[0]}-${v}`)}>
            <SelectTrigger className="h-11 min-w-[132px] rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>{getMonthName(i)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={parts[0] || String(currentYear)} onValueChange={(v) => onChange(`${v}-${parts[1]}`)}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
              <SelectValue />
            </SelectTrigger>
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
      <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_hsl(224_48%_12%/0.45)]">
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Filtros do comparativo</h2>
                <p className="mt-1 text-sm text-muted-foreground">Defina a visão, o período e as categorias para montar o relatório.</p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit rounded-full border-primary/15 bg-primary/5 px-3 py-1 text-primary">
              {selectedCats.length} de {categorias.length} categorias
            </Badge>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(180px,0.9fr)_minmax(240px,1.2fr)_minmax(240px,1.2fr)_minmax(150px,0.7fr)] xl:items-end">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tipo de data</label>
              <Select value={tipoData} onValueChange={(value) => setTipoData(value as ComparisonDateType)}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="competencia">Competência</SelectItem>
                  <SelectItem value="pagamento">Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CompSelect value={dataInicio} onChange={setDataInicio} label="Início" />
            <CompSelect value={dataFim} onChange={setDataFim} label="Fim" />
            <Button onClick={generate} className="h-11 rounded-xl px-5 font-semibold shadow-sm shadow-primary/20">
              <Play className="mr-2 h-4 w-4" /> Gerar
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
                  <Tags className="h-4 w-4" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Categorias</label>
                  <p className="mt-1 text-sm font-medium text-foreground">{categorySummary}</p>
                </div>
              </div>

              <Popover open={categoriesOpen} onOpenChange={setCategoriesOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 justify-between rounded-xl border-slate-200 bg-white px-4 shadow-sm lg:min-w-[280px]">
                    <span className="truncate text-left">
                      {selectedCats.length === categorias.length ? 'Todas selecionadas' : `${selectedCats.length} selecionadas`}
                    </span>
                    <ChevronDown className="ml-3 h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[min(92vw,520px)] rounded-2xl border-slate-200 p-0 shadow-xl">
                  <div className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Selecionar categorias</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{selectedCats.length} de {categorias.length} categorias no filtro</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={selectAllCategories}>
                          Selecionar todas
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={clearCategories}>
                          Limpar
                        </Button>
                      </div>
                    </div>
                    <Separator />
                    <div className="max-h-[300px] overflow-y-auto pr-1">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {categorias.map(c => (
                          <label
                            key={c.id}
                            className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm transition hover:border-primary/15 hover:bg-primary/5"
                          >
                            <Checkbox checked={selectedCats.includes(c.id)} onCheckedChange={() => toggleCat(c.id)} />
                            <span className="truncate">{c.nome}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
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
