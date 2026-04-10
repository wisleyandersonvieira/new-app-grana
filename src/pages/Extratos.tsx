import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/financial';
import { exportToPDF } from '@/lib/export';

type MovimentoBase = {
  data: string;
  descricao: string;
  detalhes: string;
  entrada: number;
  saida: number;
};

type Movimento = MovimentoBase & {
  saldo: number;
};

const formatDate = (value: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const getMonthDateRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();

  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
};

export default function Extratos() {
  const { user } = useAuth();
  const defaultRange = getMonthDateRange();

  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [contaId, setContaId] = useState('');
  const [dataInicio, setDataInicio] = useState(defaultRange.start);
  const [dataFim, setDataFim] = useState(defaultRange.end);
  const [saldoAnterior, setSaldoAnterior] = useState(0);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [generated, setGenerated] = useState(false);
  const [adjustedStartDate, setAdjustedStartDate] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('contas')
      .select('id, nome')
      .eq('usuario_id', user.id)
      .eq('bloqueada', false)
      .order('nome')
      .then(({ data }) => {
        if (!data) return;
        setContas(data);
        setContaId((current) => current || data[0]?.id || '');
      });
  }, [user]);

  const contaNome = useMemo(
    () => contas.find((conta) => conta.id === contaId)?.nome ?? '',
    [contaId, contas],
  );

  const totals = useMemo(() => {
    const entradas = movimentos.reduce((sum, movimento) => sum + movimento.entrada, 0);
    const saidas = movimentos.reduce((sum, movimento) => sum + movimento.saida, 0);
    const saldoAtual = movimentos.length > 0 ? movimentos[movimentos.length - 1].saldo : saldoAnterior;

    return { entradas, saidas, saldoAtual };
  }, [movimentos, saldoAnterior]);

  const generate = async () => {
    if (!user || !contaId || !dataInicio || !dataFim) return;

    const [{ data: conta }, { data: contasData }, { data: cats }, { data: subs }] = await Promise.all([
      supabase
        .from('contas')
        .select('saldo_inicial, data_saldo_inicial')
        .eq('id', contaId)
        .eq('usuario_id', user.id)
        .single(),
      supabase.from('contas').select('id, nome').eq('usuario_id', user.id),
      supabase.from('categorias').select('id, nome').eq('usuario_id', user.id),
      supabase.from('subcategorias').select('id, nome').eq('usuario_id', user.id),
    ]);

    const contaMap: Record<string, string> = {};
    contasData?.forEach((item) => {
      contaMap[item.id] = item.nome;
    });

    const catMap: Record<string, string> = {};
    cats?.forEach((item) => {
      catMap[item.id] = item.nome;
    });

    const subMap: Record<string, string> = {};
    subs?.forEach((item) => {
      subMap[item.id] = item.nome;
    });

    const saldoInicial = conta?.saldo_inicial ?? 0;
    const baseDate = conta?.data_saldo_inicial ?? null;
    const effectiveStartDate = baseDate && baseDate > dataInicio ? baseDate : dataInicio;

    setAdjustedStartDate(baseDate && baseDate > dataInicio ? baseDate : null);

    let saldoAbertura = saldoInicial;

    const [{ data: recBefore }, { data: despBefore }, { data: transBefore }] = await Promise.all([
      supabase
        .from('receitas')
        .select('valor')
        .eq('usuario_id', user.id)
        .eq('conta_id', contaId)
        .eq('paga', true)
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', baseDate ?? '0001-01-01')
        .lt('data_pagamento', effectiveStartDate),
      supabase
        .from('despesas')
        .select('valor')
        .eq('usuario_id', user.id)
        .eq('conta_id', contaId)
        .eq('paga', true)
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', baseDate ?? '0001-01-01')
        .lt('data_pagamento', effectiveStartDate),
      supabase
        .from('transferencias')
        .select('conta_origem_id, conta_destino_id, valor')
        .eq('usuario_id', user.id)
        .or(`conta_origem_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
        .gte('data', baseDate ?? '0001-01-01')
        .lt('data', effectiveStartDate),
    ]);

    recBefore?.forEach((item) => {
      saldoAbertura += item.valor;
    });
    despBefore?.forEach((item) => {
      saldoAbertura -= item.valor;
    });
    transBefore?.forEach((item) => {
      if (item.conta_destino_id === contaId) saldoAbertura += item.valor;
      if (item.conta_origem_id === contaId) saldoAbertura -= item.valor;
    });

    setSaldoAnterior(saldoAbertura);

    const [{ data: recs }, { data: desps }, { data: trans }] = await Promise.all([
      supabase
        .from('receitas')
        .select('*')
        .eq('usuario_id', user.id)
        .eq('conta_id', contaId)
        .eq('paga', true)
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', effectiveStartDate)
        .lte('data_pagamento', dataFim),
      supabase
        .from('despesas')
        .select('*')
        .eq('usuario_id', user.id)
        .eq('conta_id', contaId)
        .eq('paga', true)
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', effectiveStartDate)
        .lte('data_pagamento', dataFim),
      supabase
        .from('transferencias')
        .select('*')
        .eq('usuario_id', user.id)
        .or(`conta_origem_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
        .gte('data', effectiveStartDate)
        .lte('data', dataFim),
    ]);

    const items: MovimentoBase[] = [];

    recs?.forEach((item) => {
      const categoria = item.categoria_id ? catMap[item.categoria_id] ?? 'Sem categoria' : 'Sem categoria';
      const subcategoria = item.subcategoria_id ? subMap[item.subcategoria_id] ?? 'Sem subcategoria' : '';

      items.push({
        data: item.data_pagamento ?? item.data ?? '',
        descricao: item.descricao?.trim() || 'Recebimento',
        detalhes: [categoria, subcategoria].filter(Boolean).join(' / '),
        entrada: item.valor,
        saida: 0,
      });
    });

    desps?.forEach((item) => {
      const categoria = item.categoria_id ? catMap[item.categoria_id] ?? 'Sem categoria' : 'Sem categoria';
      const subcategoria = item.subcategoria_id ? subMap[item.subcategoria_id] ?? 'Sem subcategoria' : '';

      items.push({
        data: item.data_pagamento ?? item.data ?? '',
        descricao: item.descricao?.trim() || 'Pagamento',
        detalhes: [categoria, subcategoria].filter(Boolean).join(' / '),
        entrada: 0,
        saida: item.valor,
      });
    });

    trans?.forEach((item) => {
      if (item.conta_destino_id === contaId) {
        items.push({
          data: item.data ?? '',
          descricao: `Transferência recebida de ${contaMap[item.conta_origem_id] ?? 'outra conta'}`,
          detalhes: item.observacao?.trim() || 'Transferência entre contas',
          entrada: item.valor,
          saida: 0,
        });
      }

      if (item.conta_origem_id === contaId) {
        items.push({
          data: item.data ?? '',
          descricao: `Transferência enviada para ${contaMap[item.conta_destino_id] ?? 'outra conta'}`,
          detalhes: item.observacao?.trim() || 'Transferência entre contas',
          entrada: 0,
          saida: item.valor,
        });
      }
    });

    items.sort((left, right) => {
      const dateCompare = left.data.localeCompare(right.data);
      if (dateCompare !== 0) return dateCompare;
      return left.descricao.localeCompare(right.descricao);
    });

    let saldoCorrente = saldoAbertura;
    const statement = items.map((item) => {
      saldoCorrente += item.entrada - item.saida;
      return { ...item, saldo: saldoCorrente };
    });

    setMovimentos(statement);
    setGenerated(true);
  };

  const handleExportPDF = () => {
    const data = [
      {
        data: adjustedStartDate ? formatDate(adjustedStartDate) : formatDate(dataInicio),
        descricao: 'Saldo anterior',
        detalhes: adjustedStartDate
          ? `Extrato ajustado para a data inicial do saldo da conta`
          : 'Saldo acumulado antes do periodo',
        entradaFmt: '',
        saidaFmt: '',
        saldoFmt: formatCurrency(saldoAnterior),
      },
      ...movimentos.map((movimento) => ({
        data: formatDate(movimento.data),
        descricao: movimento.descricao,
        detalhes: movimento.detalhes || '-',
        entradaFmt: movimento.entrada ? formatCurrency(movimento.entrada) : '',
        saidaFmt: movimento.saida ? formatCurrency(movimento.saida) : '',
        saldoFmt: formatCurrency(movimento.saldo),
      })),
      {
        data: formatDate(dataFim),
        descricao: 'Saldo atual',
        detalhes: `Periodo ${formatDate(dataInicio)} a ${formatDate(dataFim)}`,
        entradaFmt: formatCurrency(totals.entradas),
        saidaFmt: formatCurrency(totals.saidas),
        saldoFmt: formatCurrency(totals.saldoAtual),
      },
    ];

    exportToPDF(
      data,
      [
        { header: 'Data', key: 'data' },
        { header: 'Historico', key: 'descricao' },
        { header: 'Detalhes', key: 'detalhes' },
        { header: 'Entradas', key: 'entradaFmt' },
        { header: 'Saidas', key: 'saidaFmt' },
        { header: 'Saldo', key: 'saldoFmt' },
      ],
      `Extrato Bancario - ${contaNome || 'Conta'}`,
      'extrato-bancario',
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Extratos</h1>
          <p className="text-muted-foreground">Extrato bancario com saldo anterior, entradas, saidas e saldo atual</p>
        </div>
        {generated && (
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Conta</label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data inicial</label>
              <Input type="date" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} className="w-[170px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data final</label>
              <Input type="date" value={dataFim} onChange={(event) => setDataFim(event.target.value)} className="w-[170px]" />
            </div>
            <Button onClick={generate}>Emitir extrato</Button>
          </div>
        </CardContent>
      </Card>

      {generated && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo anterior</p>
                <p className={`mt-2 text-xl font-semibold ${saldoAnterior >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(saldoAnterior)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Entradas</p>
                <p className="mt-2 text-xl font-semibold text-green-600">{formatCurrency(totals.entradas)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Saidas</p>
                <p className="mt-2 text-xl font-semibold text-red-600">{formatCurrency(totals.saidas)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo atual</p>
                <p className={`mt-2 text-xl font-semibold ${totals.saldoAtual >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totals.saldoAtual)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-accent" />
                {contaNome ? `Extrato bancario - ${contaNome}` : 'Extrato bancario'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Periodo de {formatDate(dataInicio)} ate {formatDate(dataFim)}
              </p>
              {adjustedStartDate && (
                <p className="text-sm text-amber-700">
                  O saldo inicial desta conta comeca em {formatDate(adjustedStartDate)}. O extrato foi ajustado a partir dessa data.
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">Data</th>
                      <th className="py-2 px-3">Historico</th>
                      <th className="py-2 px-3">Detalhes</th>
                      <th className="py-2 px-3 text-right">Entradas</th>
                      <th className="py-2 px-3 text-right">Saidas</th>
                      <th className="py-2 px-3 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b bg-muted/30 font-medium">
                      <td className="py-2 px-3">{adjustedStartDate ? formatDate(adjustedStartDate) : formatDate(dataInicio)}</td>
                      <td className="py-2 px-3">Saldo anterior</td>
                      <td className="py-2 px-3">
                        {adjustedStartDate ? 'Saldo base da conta' : 'Saldo acumulado antes do periodo'}
                      </td>
                      <td className="py-2 px-3 text-right"></td>
                      <td className="py-2 px-3 text-right"></td>
                      <td className={`py-2 px-3 text-right ${saldoAnterior >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(saldoAnterior)}
                      </td>
                    </tr>

                    {movimentos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 px-3 text-center text-muted-foreground">
                          Nenhum movimento encontrado para o periodo informado.
                        </td>
                      </tr>
                    ) : (
                      movimentos.map((movimento, index) => (
                        <tr key={`${movimento.data}-${index}`} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3">{formatDate(movimento.data)}</td>
                          <td className="py-2 px-3">{movimento.descricao}</td>
                          <td className="py-2 px-3">{movimento.detalhes || '-'}</td>
                          <td className="py-2 px-3 text-right text-green-600">
                            {movimento.entrada ? formatCurrency(movimento.entrada) : ''}
                          </td>
                          <td className="py-2 px-3 text-right text-red-600">
                            {movimento.saida ? formatCurrency(movimento.saida) : ''}
                          </td>
                          <td className={`py-2 px-3 text-right font-medium ${movimento.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(movimento.saldo)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/20 font-semibold">
                      <td colSpan={3} className="py-3 px-3 text-right">Movimentacao do periodo</td>
                      <td className="py-3 px-3 text-right text-green-600">{formatCurrency(totals.entradas)}</td>
                      <td className="py-3 px-3 text-right text-red-600">{formatCurrency(totals.saidas)}</td>
                      <td className={`py-3 px-3 text-right ${totals.saldoAtual >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totals.saldoAtual)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
