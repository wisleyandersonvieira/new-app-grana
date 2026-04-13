import { Fragment, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Layers3,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getMonthName } from '@/lib/financial';
import { cn } from '@/lib/utils';

type CatData = Record<string, Record<string, number>>;
type SubData = Record<string, Record<string, Record<string, number>>>;
type ReportSectionData = {
  cats: CatData;
  subs: SubData;
  totals: Record<string, number>;
};

type Categoria = { id: string; nome: string };
type Subcategoria = { id: string; nome: string; categoria_id: string };

type ItemFaturaReport = {
  valor: number;
  categoria_id: string | null;
  subcategoria_id: string | null;
  descricao: string | null;
  data: string | null;
  competencia: string | null;
  faturas_cartao?: {
    mes_ano: string | null;
    data_vencimento: string | null;
  } | null;
};

const MONTH_SHORT_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const REPORT_TITLE = 'Relatório Completo';
const SYSTEM_NAME = 'Grana';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado.';
}

function getMonthsBetween(start: string, end: string) {
  const result: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let year = sy;
  let month = sm;

  while (year < ey || (year === ey && month <= em)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return result;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-');
  return `${MONTH_SHORT_NAMES[Number(month) - 1]}/${year}`;
}

function getMonthDateRange(value: string) {
  const [year, month] = value.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function processData(
  items: Array<{ valor: number; categoria_id: string | null; subcategoria_id: string | null; competencia?: string | null; data?: string | null; data_pagamento?: string | null }>,
  catMap: Record<string, string>,
  subMap: Record<string, { nome: string; catId: string }>,
  tipoData: string,
  dateField: 'data_pagamento' | 'data',
) {
  const cats: CatData = {};
  const subs: SubData = {};
  const totals: Record<string, number> = {};

  items.forEach((item) => {
    const month =
      tipoData === 'competencia'
        ? item.competencia
        : (item[dateField] ?? item.data)?.substring(0, 7);

    if (!month) return;

    const catNome = item.categoria_id ? catMap[item.categoria_id] ?? 'Sem categoria' : 'Sem categoria';
    const subInfo = item.subcategoria_id ? subMap[item.subcategoria_id] : null;
    const subNome = subInfo?.nome ?? 'Sem subcategoria';

    cats[catNome] ??= {};
    cats[catNome][month] = (cats[catNome][month] ?? 0) + item.valor;

    subs[catNome] ??= {};
    subs[catNome][subNome] ??= {};
    subs[catNome][subNome][month] = (subs[catNome][subNome][month] ?? 0) + item.valor;

    totals[month] = (totals[month] ?? 0) + item.valor;
  });

  return { cats, subs, totals };
}

function buildRowsForPdf(
  title: string,
  tone: 'positive' | 'negative' | 'neutral',
  data: ReportSectionData,
  months: string[],
) {
  const rows: RowInput[] = [];
  const categoryNames = Object.keys(data.cats).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (categoryNames.length === 0) return rows;

  const sectionColor: [number, number, number] =
    tone === 'positive' ? [231, 247, 237] : tone === 'negative' ? [255, 241, 242] : [239, 244, 255];

  rows.push([
    {
      content: title,
      colSpan: months.length + 1,
      styles: {
        fillColor: sectionColor,
        textColor: [17, 24, 39] as [number, number, number],
        fontStyle: 'bold' as const,
        fontSize: 10,
        halign: 'left',
        cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      },
    },
  ]);

  categoryNames.forEach((catNome) => {
    rows.push([
      {
        content: catNome,
        styles: {
          fontStyle: 'bold' as const,
          fillColor: [248, 250, 252] as [number, number, number],
          textColor: [15, 23, 42] as [number, number, number],
        },
      },
      ...months.map((month) => ({
        content: formatCurrency(data.cats[catNome][month] ?? 0),
        styles: {
          fontStyle: 'bold' as const,
          fillColor: [248, 250, 252] as [number, number, number],
          halign: 'right' as const,
          textColor: [15, 23, 42] as [number, number, number],
        },
      })),
    ]);

    Object.keys(data.subs[catNome] ?? {})
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .forEach((subNome) => {
        rows.push([
          {
            content: `   ${subNome}`,
            styles: {
              textColor: [71, 85, 105] as [number, number, number],
            },
          },
          ...months.map((month) => ({
            content: formatCurrency(data.subs[catNome][subNome][month] ?? 0),
            styles: {
              halign: 'right' as const,
              textColor: [71, 85, 105] as [number, number, number],
            },
          })),
        ]);
      });
  });

  rows.push([
    {
      content: `Total ${title}`,
      styles: {
        fontStyle: 'bold' as const,
        fillColor: [226, 232, 240] as [number, number, number],
        textColor: [15, 23, 42] as [number, number, number],
      },
    },
    ...months.map((month) => ({
      content: formatCurrency(data.totals[month] ?? 0),
      styles: {
        fontStyle: 'bold' as const,
        fillColor: [226, 232, 240] as [number, number, number],
        halign: 'right' as const,
        textColor: [15, 23, 42] as [number, number, number],
      },
    })),
  ]);

  return rows;
}

export default function RelatorioCompleto() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();

  const [tipoData, setTipoData] = useState('competencia');
  const [dataInicio, setDataInicio] = useState(`${currentYear}-01`);
  const [dataFim, setDataFim] = useState(`${currentYear}-12`);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [receitaData, setReceitaData] = useState<ReportSectionData>({ cats: {}, subs: {}, totals: {} });
  const [despesaData, setDespesaData] = useState<ReportSectionData>({ cats: {}, subs: {}, totals: {} });
  const [investData, setInvestData] = useState<ReportSectionData>({ cats: {}, subs: {}, totals: {} });
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;

    Promise.all([
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id').eq('usuario_id', user.id).order('nome'),
    ]).then(([{ data: cats }, { data: subs }]) => {
      if (cats) {
        setCategorias(cats);
        setSelectedCats(cats.map((cat) => cat.id));
      }
      if (subs) setSubcategorias(subs);
    });
  }, [user]);

  const hasAnyData = useMemo(
    () => [receitaData, despesaData, investData].some((section) => Object.keys(section.cats).length > 0),
    [receitaData, despesaData, investData],
  );

  const selectedCategoryNames = useMemo(() => {
    const selected = categorias.filter((category) => selectedCats.includes(category.id)).map((category) => category.nome);
    return selected.length === categorias.length ? ['Todas as categorias'] : selected;
  }, [categorias, selectedCats]);

  const reportSubtitle = useMemo(() => {
    const period = `${formatMonthLabel(dataInicio)} a ${formatMonthLabel(dataFim)}`;
    const typeLabel = tipoData === 'competencia' ? 'Competência' : 'Pagamento';
    return `${typeLabel} • ${period}`;
  }, [dataFim, dataInicio, tipoData]);

  const sectionConfigs = useMemo(
    () => [
      {
        key: 'receitas',
        title: 'Receitas',
        description: 'Entradas agrupadas por categoria e subcategoria.',
        tone: 'positive' as const,
        data: receitaData,
      },
      {
        key: 'despesas',
        title: 'Despesas',
        description: 'Saídas operacionais e gastos recorrentes.',
        tone: 'negative' as const,
        data: despesaData,
      },
      {
        key: 'investimentos',
        title: 'Investimentos',
        description: 'Aportes e movimentações classificadas como investimento.',
        tone: 'neutral' as const,
        data: investData,
      },
    ],
    [despesaData, investData, receitaData],
  );

  const saldoFinal = useMemo(
    () =>
      months.reduce<Record<string, number>>((acc, month) => {
        acc[month] = (receitaData.totals[month] ?? 0) - (despesaData.totals[month] ?? 0) - (investData.totals[month] ?? 0);
        return acc;
      }, {}),
    [despesaData.totals, investData.totals, months, receitaData.totals],
  );

  const years = Array.from({ length: 10 }, (_, index) => currentYear - 3 + index);

  const toggleCat = (id: string) => {
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleRow = (sectionKey: string, catName: string) => {
    const rowKey = `${sectionKey}:${catName}`;
    setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  const handleGenerate = async () => {
    if (!user) return;

    if (dataFim < dataInicio) {
      toast.error('O período final precisa ser igual ou posterior ao período inicial.');
      return;
    }

    setLoading(true);

    try {
      const reportMonths = getMonthsBetween(dataInicio, dataFim);
      setMonths(reportMonths);

      const catMap = categorias.reduce<Record<string, string>>((acc, category) => {
        acc[category.id] = category.nome;
        return acc;
      }, {});

      const subMap = subcategorias.reduce<Record<string, { nome: string; catId: string }>>((acc, subcategory) => {
        acc[subcategory.id] = { nome: subcategory.nome, catId: subcategory.categoria_id };
        return acc;
      }, {});

      const investCatId = categorias.find((category) => category.nome === 'Investimentos')?.id;
      const cartaoCatId = categorias.find((category) => category.nome.toLowerCase() === 'cartão de crédito')?.id;
      const dateColumn = tipoData === 'competencia' ? 'competencia' : 'data_pagamento';
      const { start: inicioDia, end: fimDia } = {
        start: getMonthDateRange(dataInicio).start,
        end: getMonthDateRange(dataFim).end,
      };

      let receitaQuery = supabase.from('receitas').select('*').eq('usuario_id', user.id);
      if (tipoData === 'competencia') {
        receitaQuery = receitaQuery.gte('competencia', dataInicio).lte('competencia', dataFim);
      } else {
        receitaQuery = receitaQuery.gte('data_pagamento', inicioDia).lte('data_pagamento', fimDia);
      }
      if (selectedCats.length < categorias.length) receitaQuery = receitaQuery.in('categoria_id', selectedCats);

      let despesaQuery = supabase.from('despesas').select('*').eq('usuario_id', user.id);
      if (tipoData === 'competencia') {
        despesaQuery = despesaQuery.gte('competencia', dataInicio).lte('competencia', dataFim);
      } else {
        despesaQuery = despesaQuery.gte('data_pagamento', inicioDia).lte('data_pagamento', fimDia);
      }
      if (selectedCats.length < categorias.length) despesaQuery = despesaQuery.in('categoria_id', selectedCats);

      let itensFaturaQuery = supabase
        .from('itens_fatura')
        .select('valor, categoria_id, subcategoria_id, descricao, data, competencia, faturas_cartao(mes_ano, data_vencimento)')
        .eq('usuario_id', user.id);
      if (selectedCats.length < categorias.length) itensFaturaQuery = itensFaturaQuery.in('categoria_id', selectedCats);

      const [{ data: receitas, error: receitasError }, { data: allDespesas, error: despesasError }, { data: itensFatura, error: itensError }] =
        await Promise.all([receitaQuery, despesaQuery, itensFaturaQuery]);

      if (receitasError) throw receitasError;
      if (despesasError) throw despesasError;
      if (itensError) throw itensError;

      const itensFaturaFiltrados = ((itensFatura ?? []) as ItemFaturaReport[])
        .filter((item) => {
          const compRef = item.faturas_cartao?.mes_ano ?? item.competencia;
          const dataRef = item.faturas_cartao?.data_vencimento ?? item.data;

          if (tipoData === 'competencia') {
            return Boolean(compRef && compRef >= dataInicio && compRef <= dataFim);
          }

          return Boolean(dataRef && dataRef >= inicioDia && dataRef <= fimDia);
        })
        .map((item) => ({
          ...item,
          competencia: item.faturas_cartao?.mes_ano ?? item.competencia,
          data: item.faturas_cartao?.data_vencimento ?? item.data,
        }));

      const despesasBase = allDespesas?.filter(
        (despesa) => despesa.categoria_id !== investCatId && despesa.categoria_id !== cartaoCatId,
      ) ?? [];
      const despesas = [...despesasBase, ...itensFaturaFiltrados];
      const investimentos = allDespesas?.filter((despesa) => despesa.categoria_id === investCatId) ?? [];

      setReceitaData(processData(receitas ?? [], catMap, subMap, tipoData, dateColumn));
      setDespesaData(processData(despesas, catMap, subMap, tipoData, 'data_pagamento'));
      setInvestData(processData(investimentos, catMap, subMap, tipoData, 'data_pagamento'));
      setExpandedRows({});
      setGenerated(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Não foi possível gerar o relatório.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!generated || months.length === 0) {
      toast.error('Gere o relatório antes de exportar o PDF.');
      return;
    }

    setExportingPdf(true);

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const generatedAt = new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date());

      const filterLines = [
        `Período: ${formatMonthLabel(dataInicio)} a ${formatMonthLabel(dataFim)}`,
        `Tipo de data: ${tipoData === 'competencia' ? 'Competência' : 'Pagamento'}`,
        `Categorias: ${selectedCategoryNames.join(', ')}`,
      ];
      const wrappedFilters = doc.splitTextToSize(filterLines.join('  •  '), pageWidth - 28);
      const filterBoxHeight = Math.max(13, wrappedFilters.length * 3.8 + 4);
      const tableStartY = 29 + filterBoxHeight + 4;

      const tableHead = [['Seção / Categoria', ...months.map((month) => formatMonthLabel(month))]];
      const tableBody = [
        ...buildRowsForPdf('Receitas', 'positive', receitaData, months),
        ...buildRowsForPdf('Despesas', 'negative', despesaData, months),
        ...buildRowsForPdf('Investimentos', 'neutral', investData, months),
        [
          {
            content: 'Saldo Final',
            styles: {
              fontStyle: 'bold',
              fillColor: [15, 23, 42],
              textColor: [255, 255, 255],
            },
          },
          ...months.map((month) => ({
            content: formatCurrency(saldoFinal[month] ?? 0),
            styles: {
              fontStyle: 'bold',
              fillColor: [15, 23, 42],
              halign: 'right',
              textColor: [255, 255, 255],
            },
          })),
        ],
      ];

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: tableStartY,
        margin: { top: tableStartY, right: 10, bottom: 16, left: 10 },
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2.6,
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
          textColor: [30, 41, 59],
          valign: 'middle',
        },
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: months.reduce<Record<number, { halign: 'left' | 'right' }>>((acc, _month, index) => {
          acc[index + 1] = { halign: 'right' };
          return acc;
        }, { 0: { halign: 'left' } }),
        didDrawPage: (hookData) => {
          doc.setFillColor(15, 23, 42);
          doc.rect(0, 0, pageWidth, 26, 'F');

          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.text(SYSTEM_NAME, 10, 11);
          doc.setFontSize(13);
          doc.text(REPORT_TITLE, 10, 18);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.text(`Gerado em ${generatedAt}`, pageWidth - 10, 11, { align: 'right' });
          doc.text(reportSubtitle, pageWidth - 10, 18, { align: 'right' });

          doc.setDrawColor(226, 232, 240);
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(10, 29, pageWidth - 20, filterBoxHeight, 2, 2, 'FD');
          doc.setTextColor(51, 65, 85);
          doc.setFontSize(8);
          doc.text(wrappedFilters, 14, 34);

          doc.setTextColor(100, 116, 139);
          doc.setFontSize(8);
          doc.text(`Página ${hookData.pageNumber}`, pageWidth - 10, pageHeight - 6, { align: 'right' });
        },
      });

      doc.save(`relatorio-completo-${dataInicio}-${dataFim}.pdf`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Não foi possível exportar o PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const CompSelect = ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
  }) => {
    const [year, month] = value ? value.split('-') : [String(currentYear), '01'];

    return (
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</label>
        <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-2">
          <Select value={month || '01'} onValueChange={(nextMonth) => onChange(`${year}-${nextMonth}`)}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white/90">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, index) => (
                <SelectItem key={index} value={String(index + 1).padStart(2, '0')}>
                  {getMonthName(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year || String(currentYear)} onValueChange={(nextYear) => onChange(`${nextYear}-${month}`)}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white/90">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((optionYear) => (
                <SelectItem key={optionYear} value={String(optionYear)}>
                  {optionYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  const SectionTable = ({
    sectionKey,
    title,
    description,
    tone,
    data,
  }: {
    sectionKey: string;
    title: string;
    description: string;
    tone: 'positive' | 'negative' | 'neutral';
    data: ReportSectionData;
  }) => {
    const categoryNames = Object.keys(data.cats).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (categoryNames.length === 0) return null;

    const toneClasses = {
      positive: 'from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-200/70',
      negative: 'from-rose-500/10 via-rose-500/5 to-transparent border-rose-200/70',
      neutral: 'from-blue-500/10 via-blue-500/5 to-transparent border-blue-200/70',
    };

    return (
      <Card className={cn('overflow-hidden border bg-white/95 backdrop-blur-sm', toneClasses[tone])}>
        <CardContent className="p-0">
          <div className="border-b border-slate-200 bg-gradient-to-r px-6 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-500">{description}</p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600">
                <Layers3 className="h-3.5 w-3.5" />
                {categoryNames.length} categorias
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                <tr>
                  <th className="min-w-[260px] px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">
                    Categoria
                  </th>
                  {months.map((month) => (
                    <th
                      key={month}
                      className="min-w-[120px] px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]"
                    >
                      {formatMonthLabel(month)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categoryNames.map((catName) => {
                  const rowKey = `${sectionKey}:${catName}`;
                  const isExpanded = expandedRows[rowKey] ?? false;
                  const subNames = Object.keys(data.subs[catName] ?? {}).sort((a, b) => a.localeCompare(b, 'pt-BR'));

                  return (
                    <Fragment key={rowKey}>
                      <tr className="border-b border-slate-200 bg-slate-50/90 transition-colors duration-200 hover:bg-slate-100">
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 text-left"
                            onClick={() => toggleRow(sectionKey, catName)}
                          >
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </span>
                            <span>
                              <span className="block font-semibold text-slate-900">{catName}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {subNames.length} subcategorias • clique para {isExpanded ? 'recolher' : 'expandir'}
                              </span>
                            </span>
                          </button>
                        </td>
                        {months.map((month) => (
                          <td key={month} className="px-4 py-4 text-right font-semibold text-slate-900">
                            {formatCurrency(data.cats[catName][month] ?? 0)}
                          </td>
                        ))}
                      </tr>

                      {isExpanded &&
                        subNames.map((subName) => (
                          <tr key={`${rowKey}:${subName}`} className="border-b border-slate-100 bg-white">
                            <td className="px-5 py-3.5 pl-16 text-slate-500">{subName}</td>
                            {months.map((month) => (
                              <td key={month} className="px-4 py-3.5 text-right text-slate-600">
                                {formatCurrency(data.subs[catName][subName][month] ?? 0)}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 bg-slate-950/95 text-white">
                  <td className="px-5 py-4 text-left font-semibold">Total {title}</td>
                  {months.map((month) => (
                    <td key={month} className="px-4 py-4 text-right font-semibold">
                      {formatCurrency(data.totals[month] ?? 0)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.8)] md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.28),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_24%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-100">
              <Sparkles className="h-3.5 w-3.5" />
              Relatórios
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{REPORT_TITLE}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              Visão consolidada por seção, com leitura resumida por categoria, expansão sob demanda e exportação em PDF pronta para apresentação.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Tipo</p>
              <p className="mt-1 text-sm font-medium">{tipoData === 'competencia' ? 'Competência' : 'Pagamento'}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Período</p>
              <p className="mt-1 text-sm font-medium">{formatMonthLabel(dataInicio)} a {formatMonthLabel(dataFim)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Categorias</p>
              <p className="mt-1 text-sm font-medium">{selectedCats.length}/{categorias.length || 0} selecionadas</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border-0 bg-transparent shadow-none">
        <CardContent className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-6 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.55)] md:p-7">
          <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-blue-700">
                  <Filter className="h-3.5 w-3.5" />
                  Filtros do relatório
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Configure o recorte do relatório</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Selecione o período, o tipo de data e as categorias que devem compor a análise e a exportação.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
                <CalendarRange className="h-3.5 w-3.5" />
                {reportSubtitle}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_auto_auto]">
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Tipo de data</label>
                <Select value={tipoData} onValueChange={setTipoData}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white/90">
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

              <Button className="h-11 rounded-xl px-5" onClick={() => void handleGenerate()} disabled={loading}>
                {loading ? 'Gerando...' : 'Gerar'}
              </Button>

              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white px-5 text-slate-700 hover:bg-slate-50"
                onClick={() => void handleExportPdf()}
                disabled={!generated || exportingPdf}
              >
                <Download className="h-4 w-4" />
                {exportingPdf ? 'Exportando...' : 'Exportar PDF'}
              </Button>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Categorias</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Use os chips para montar rapidamente o escopo do relatório. A seleção será aplicada tanto na tela quanto no PDF.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-slate-300 bg-white px-4"
                    onClick={() => setSelectedCats(categorias.map((category) => category.id))}
                  >
                    Selecionar todas
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-slate-300 bg-white px-4"
                    onClick={() => setSelectedCats([])}
                  >
                    Limpar seleção
                  </Button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {categorias.map((category) => {
                  const active = selectedCats.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCat(category.id)}
                      className={cn(
                        'rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                        active
                          ? 'border-blue-700 bg-blue-700 text-white shadow-[0_12px_24px_-16px_rgba(29,78,216,0.95)] hover:bg-blue-800'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white hover:text-slate-900',
                      )}
                    >
                      {category.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {generated && (
        <div className="space-y-6">
          {!hasAnyData ? (
            <Card>
              <CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
                <div className="rounded-full bg-slate-100 p-3 text-slate-500">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Nenhum dado encontrado</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Não há lançamentos para o período e as categorias selecionadas.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {sectionConfigs.map((section) => (
                <SectionTable
                  key={section.key}
                  sectionKey={section.key}
                  title={section.title}
                  description={section.description}
                  tone={section.tone}
                  data={section.data}
                />
              ))}

              <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
                <CardContent className="p-0">
                  <div className="border-b border-white/10 px-6 py-5">
                    <h3 className="text-lg font-semibold tracking-tight">Saldo Final</h3>
                    <p className="mt-1 text-sm text-slate-300">
                      Resultado líquido após receitas, despesas e investimentos.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="min-w-[220px] px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                            Resumo
                          </th>
                          {months.map((month) => (
                            <th
                              key={month}
                              className="min-w-[120px] px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-300"
                            >
                              {formatMonthLabel(month)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-5 py-4 font-semibold">Saldo Final</td>
                          {months.map((month) => {
                            const value = saldoFinal[month] ?? 0;
                            return (
                              <td
                                key={month}
                                className={cn(
                                  'px-4 py-4 text-right font-semibold',
                                  value >= 0 ? 'text-emerald-300' : 'text-rose-300',
                                )}
                              >
                                {formatCurrency(value)}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
