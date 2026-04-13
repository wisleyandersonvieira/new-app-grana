import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, TrendingDown, Save, CheckCircle, FlaskConical } from 'lucide-react';
import { format, addMonths, isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/lib/financial';

interface Categoria {
  id: string;
  nome: string;
}

interface Subcategoria {
  id: string;
  nome: string;
  categoria_id: string;
}

interface Conta {
  id: string;
  nome: string;
  data_saldo_inicial: string | null;
}

interface ParcelaRow {
  numero: number;
  valor: string;
  competencia_mes: string;
  competencia_ano: string;
  vencimento: Date;
}

interface UltimaDespesa {
  descricao: string | null;
  valor: number;
  data: string;
  categoria_nome: string | null;
  paga: boolean;
}

type DespesaRow = Database['public']['Tables']['despesas']['Row'];

interface UltimaDespesaQueryRow extends Pick<DespesaRow, 'descricao' | 'valor' | 'data' | 'paga'> {
  categorias: { nome: string } | { nome: string }[] | null;
}

function formatDateToDisplay(date: Date) {
  return format(date, 'dd-MM-yyyy');
}

function formatIsoDateToDisplay(date: string | null) {
  if (!date) return '—';

  const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
  return isValid(parsedDate) ? formatDateToDisplay(parsedDate) : date;
}

function parseManualDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;

  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function getDateFromInput(value: string) {
  if (value.length !== 10) return undefined;

  const parsedDate = parse(value, 'dd-MM-yyyy', new Date());
  return isValid(parsedDate) ? parsedDate : undefined;
}

export default function NovaDespesaPage() {
  const { user } = useAuth();

  // Form state
  const [categoriaId, setCategoriaId] = useState('');
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorDisplay, setValorDisplay] = useState('');
  const [dataVencimento, setDataVencimento] = useState<Date | undefined>(undefined);
  const [dataVencimentoInput, setDataVencimentoInput] = useState('');
  const [compMes, setCompMes] = useState(String(new Date().getMonth() + 1));
  const [compAno, setCompAno] = useState(String(new Date().getFullYear()));
  const [contaId, setContaId] = useState('');
  const [numParcelas, setNumParcelas] = useState('1');
  const [parcelas, setParcelas] = useState<ParcelaRow[]>([]);
  const [showParcelas, setShowParcelas] = useState(false);

  // Reference data
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [bloqueios, setBloqueios] = useState<string[]>([]);
  const [ultimaDespesa, setUltimaDespesa] = useState<UltimaDespesa | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtered subcategorias based on selected categoria
  const filteredSubcategorias = useMemo(
    () => subcategorias.filter((s) => s.categoria_id === categoriaId),
    [subcategorias, categoriaId]
  );

  const setLastExpenseFromRow = useCallback((row: UltimaDespesaQueryRow | null) => {
    if (!row) {
      setUltimaDespesa(null);
      return;
    }

    const categoria = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;

    setUltimaDespesa({
      descricao: row.descricao,
      valor: row.valor,
      data: row.data,
      categoria_nome: categoria?.nome || null,
      paga: Boolean(row.paga),
    });
  }, []);

  // Load reference data
  const loadUltimaDespesa = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('despesas')
        .select('descricao, valor, data, paga, categorias(nome)')
        .eq('usuario_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar última despesa:', error);
        return;
      }

      setLastExpenseFromRow((data as UltimaDespesaQueryRow | null) ?? null);
    } catch (err) {
      console.error('Erro ao carregar última despesa:', err);
    }
  }, [setLastExpenseFromRow, user]);

  const loadReferenceData = useCallback(async () => {
    const [catRes, subRes, contRes, bloqRes] = await Promise.all([
      supabase.from('categorias').select('id, nome').eq('bloqueada', false).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id').eq('bloqueada', false).order('nome'),
      supabase.from('contas').select('id, nome, data_saldo_inicial').eq('tipo', 'conta').eq('bloqueada', false).order('nome'),
      supabase.from('bloqueios').select('mes_ano').eq('tipo', 'competencia'),
    ]);

    setCategorias(catRes.data || []);
    setSubcategorias(subRes.data || []);
    setContas(contRes.data || []);
    setBloqueios((bloqRes.data || []).map((b) => b.mes_ano));
    await loadUltimaDespesa();
  }, [loadUltimaDespesa]);

  useEffect(() => {
    if (!user) return;
    void loadReferenceData();
  }, [user, loadReferenceData]);

  useEffect(() => {
    setDataVencimentoInput(dataVencimento ? formatDateToDisplay(dataVencimento) : '');
  }, [dataVencimento]);

  // Generate parcelas simulation
  function simularParcelas() {
    const n = parseInt(numParcelas, 10);
    if (n < 2) {
      toast.error('Parcelas devem ser maior que 1 para simular.');
      return;
    }

    const totalCents = Math.round(parseCurrencyInput(valorDisplay) * 100);
    if (totalCents <= 0) {
      toast.error('Informe um valor válido antes de simular parcelas.');
      return;
    }

    if (!dataVencimento) {
      toast.error('Informe a data de vencimento antes de simular parcelas.');
      return;
    }

    const parcelaBase = Math.floor(totalCents / n);
    const resto = totalCents - parcelaBase * n;

    const rows: ParcelaRow[] = [];
    for (let i = 0; i < n; i++) {
      const valorParcela = (parcelaBase + (i < resto ? 1 : 0)) / 100;
      const venc = addMonths(dataVencimento, i);
      rows.push({
        numero: i + 1,
        valor: valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        competencia_mes: String(venc.getMonth() + 1),
        competencia_ano: String(venc.getFullYear()),
        vencimento: venc,
      });
    }

    setParcelas(rows);
    setShowParcelas(true);
  }

  function updateParcela<K extends keyof ParcelaRow>(index: number, field: K, value: ParcelaRow[K]) {
    setParcelas((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  // Validations
  function validate(): string | null {
    if (!categoriaId) return 'Selecione uma categoria.';
    if (parseCurrencyInput(valorDisplay) <= 0) return 'Informe um valor válido.';
    if (!dataVencimento) return 'Informe a data de vencimento.';
    if (!contaId) return 'Selecione uma conta.';

    const ano = parseInt(compAno, 10);
    if (ano < 1900 || ano > 2100) return 'Ano deve ser entre 1900 e 2100.';

    const comp = `${compAno}-${compMes.padStart(2, '0')}`;
    if (bloqueios.includes(comp)) return `A competência ${comp} está bloqueada.`;

    // Check date vs saldo_inicial
    const conta = contas.find((c) => c.id === contaId);
    if (conta?.data_saldo_inicial && dataVencimento) {
      const saldoDate = new Date(conta.data_saldo_inicial + 'T00:00:00');
      if (dataVencimento < saldoDate) {
        return `A data de vencimento não pode ser anterior ao saldo inicial da conta (${conta.data_saldo_inicial}).`;
      }
    }

    return null;
  }

  async function handleSave(marcarPaga: boolean) {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);

    try {
      const n = parseInt(numParcelas, 10);
      const comp = `${compAno}-${compMes.padStart(2, '0')}`;

      if (n > 1 && showParcelas && parcelas.length > 0) {
        // Save multiple parcelas
        const loteId = crypto.randomUUID();
        const inserts = parcelas.map((p) => ({
          categoria_id: categoriaId,
          subcategoria_id: subcategoriaId || null,
          descricao: descricao || null,
          valor: parseCurrencyInput(p.valor),
          data: format(p.vencimento, 'yyyy-MM-dd'),
          competencia: `${p.competencia_ano}-${p.competencia_mes.padStart(2, '0')}`,
          conta_id: contaId,
          parcela: p.numero,
          lote_id: loteId,
          paga: false,
          usuario_id: user!.id,
        }));

        const { error } = await supabase.from('despesas').insert(inserts);
        if (error) throw error;
        toast.success(`${parcelas.length} parcelas salvas com sucesso!`);
      } else {
        // Save single
        const insert = {
          categoria_id: categoriaId,
          subcategoria_id: subcategoriaId || null,
          descricao: descricao || null,
          valor: parseCurrencyInput(valorDisplay),
          data: format(dataVencimento!, 'yyyy-MM-dd'),
          competencia: comp,
          conta_id: contaId,
          parcela: 1,
          lote_id: crypto.randomUUID(),
          paga: marcarPaga,
          data_pagamento: marcarPaga ? format(dataVencimento!, 'yyyy-MM-dd') : null,
          usuario_id: user!.id,
        };

        const { error } = await supabase.from('despesas').insert(insert);
        if (error) throw error;
        toast.success(marcarPaga ? 'Despesa salva e paga!' : 'Despesa salva com sucesso!');
      }

      // Reset form
      setCategoriaId('');
      setSubcategoriaId('');
      setDescricao('');
      setValorDisplay('');
      setDataVencimento(undefined);
      setDataVencimentoInput('');
      setNumParcelas('1');
      setParcelas([]);
      setShowParcelas(false);

      await loadUltimaDespesa();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar despesa.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const isSingleParcela = parseInt(numParcelas, 10) <= 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Nova Despesa</h1>
        <p className="text-muted-foreground">Cadastre uma nova despesa</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-destructive" />
                Dados da Despesa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Categoria + Subcategoria */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <Select value={categoriaId} onValueChange={(v) => { setCategoriaId(v); setSubcategoriaId(''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subcategoria</Label>
                  <Select value={subcategoriaId} onValueChange={setSubcategoriaId} disabled={!categoriaId}>
                    <SelectTrigger>
                      <SelectValue placeholder={categoriaId ? 'Selecione...' : 'Selecione uma categoria primeiro'} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSubcategorias.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Descrição */}
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descrição da despesa"
                  maxLength={200}
                />
              </div>

              {/* Row 3: Valor + Data */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      R$
                    </span>
                    <Input
                      className="pl-10"
                      value={valorDisplay}
                      onChange={(e) => setValorDisplay(formatCurrencyInput(e.target.value))}
                      placeholder="0,00"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Data de Vencimento *</Label>
                  <div className="flex gap-2">
                    <Input
                      value={dataVencimentoInput}
                      onChange={(e) => {
                        const formattedValue = parseManualDateInput(e.target.value);
                        setDataVencimentoInput(formattedValue);

                        const parsedDate = getDateFromInput(formattedValue);
                        if (parsedDate) {
                          setDataVencimento(parsedDate);
                        } else {
                          setDataVencimento(undefined);
                        }
                      }}
                      placeholder="DD-MM-AAAA"
                      inputMode="numeric"
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            'shrink-0',
                            !dataVencimento && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={dataVencimento}
                          onSelect={setDataVencimento}
                          locale={ptBR}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Row 4: Competência + Conta */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Mês Competência</Label>
                  <Select value={compMes} onValueChange={setCompMes}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {String(i + 1).padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ano Competência</Label>
                  <Input
                    type="number"
                    value={compAno}
                    onChange={(e) => setCompAno(e.target.value)}
                    min={1900}
                    max={2100}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Conta *</Label>
                  <Select value={contaId} onValueChange={setContaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 5: Parcelas */}
              <div className="grid gap-4 sm:grid-cols-2 items-end">
                <div className="space-y-2">
                  <Label>Parcelas</Label>
                  <Input
                    type="number"
                    value={numParcelas}
                    onChange={(e) => {
                      setNumParcelas(e.target.value);
                      setShowParcelas(false);
                      setParcelas([]);
                    }}
                    min={1}
                    max={120}
                  />
                </div>
                {parseInt(numParcelas, 10) > 1 && (
                  <Button variant="outline" onClick={simularParcelas}>
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Simular Parcelas
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Parcelas Table */}
          {showParcelas && parcelas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parcelas Simuladas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-table-header text-table-header-foreground">
                        <th className="px-3 py-2 text-left rounded-tl-md">#</th>
                        <th className="px-3 py-2 text-left">Valor (R$)</th>
                        <th className="px-3 py-2 text-left">Competência</th>
                        <th className="px-3 py-2 text-left rounded-tr-md">Vencimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcelas.map((p, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-2 font-medium">{p.numero}</td>
                          <td className="px-3 py-2">
                            <Input
                              className="h-8 w-28"
                              value={p.valor}
                              onChange={(e) =>
                                updateParcela(i, 'valor', formatCurrencyInput(e.target.value))
                              }
                              inputMode="numeric"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <Select
                                value={p.competencia_mes}
                                onValueChange={(v) => updateParcela(i, 'competencia_mes', v)}
                              >
                                <SelectTrigger className="h-8 w-16">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 12 }, (_, j) => (
                                    <SelectItem key={j + 1} value={String(j + 1)}>
                                      {String(j + 1).padStart(2, '0')}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                className="h-8 w-20"
                                type="number"
                                value={p.competencia_ano}
                                onChange={(e) => updateParcela(i, 'competencia_ano', e.target.value)}
                                min={1900}
                                max={2100}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="h-8 w-32 text-xs justify-start">
                                  <CalendarIcon className="mr-1 h-3 w-3" />
                                  {formatDateToDisplay(p.vencimento)}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={p.vencimento}
                                  onSelect={(d) => d && updateParcela(i, 'vencimento', d)}
                                  locale={ptBR}
                                  initialFocus
                                  className="p-3 pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button onClick={() => handleSave(false)} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
            {isSingleParcela && (
              <Button
                variant="outline"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="border-success text-success hover:bg-success/10"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Salvar e Pagar
              </Button>
            )}
          </div>
        </div>

        {/* Sidebar: última despesa */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Última Despesa Cadastrada
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ultimaDespesa ? (
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Categoria:</span>{' '}
                    <span className="font-medium">{ultimaDespesa.categoria_nome || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Descrição:</span>{' '}
                    <span className="font-medium">{ultimaDespesa.descricao || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor:</span>{' '}
                    <span className="font-medium text-destructive">
                      {formatCurrency(ultimaDespesa.valor)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data:</span>{' '}
                    <span className="font-medium">{formatIsoDateToDisplay(ultimaDespesa.data)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <span className="font-medium">{ultimaDespesa.paga ? 'Paga' : 'Pendente'}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma despesa cadastrada.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
