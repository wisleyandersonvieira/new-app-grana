import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, TrendingUp, Save, CheckCircle, FlaskConical } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/lib/financial';
import { isVisivelPara, type Classificacao } from '@/lib/classificacao';

interface Categoria { id: string; nome: string; classificacao: Classificacao; }
interface Subcategoria { id: string; nome: string; categoria_id: string; classificacao: Classificacao; }
interface Conta { id: string; nome: string; data_saldo_inicial: string | null; }
interface ParcelaRow { numero: number; valor: string; competencia_mes: string; competencia_ano: string; vencimento: Date; }

export default function NovaReceitaPage() {
  const { user } = useAuth();
  const [categoriaId, setCategoriaId] = useState('');
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorDisplay, setValorDisplay] = useState('');
  const [dataVencimento, setDataVencimento] = useState<Date | undefined>(undefined);
  const [compMes, setCompMes] = useState(String(new Date().getMonth() + 1));
  const [compAno, setCompAno] = useState(String(new Date().getFullYear()));
  const [contaId, setContaId] = useState('');
  const [numParcelas, setNumParcelas] = useState('1');
  const [parcelas, setParcelas] = useState<ParcelaRow[]>([]);
  const [showParcelas, setShowParcelas] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [bloqueios, setBloqueios] = useState<string[]>([]);
  const [ultimaReceita, setUltimaReceita] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const filteredCategorias = useMemo(() => categorias.filter((c) => isVisivelPara(c.classificacao, 'receita')), [categorias]);
  const filteredSubcategorias = useMemo(
    () => subcategorias.filter((s) => s.categoria_id === categoriaId && isVisivelPara(s.classificacao, 'receita')),
    [subcategorias, categoriaId],
  );

  useEffect(() => { if (user) loadRef(); }, [user]);

  async function loadRef() {
    const [catRes, subRes, contRes, bloqRes, ultRes] = await Promise.all([
      supabase.from('categorias').select('id, nome, classificacao').eq('bloqueada', false).order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id, classificacao').eq('bloqueada', false).order('nome'),
      supabase.from('contas').select('id, nome, data_saldo_inicial').eq('tipo', 'conta').eq('bloqueada', false).order('nome'),
      supabase.from('bloqueios').select('mes_ano').eq('tipo', 'competencia'),
      supabase.from('receitas').select('descricao, valor, data, categoria_id, categorias(nome)').order('created_at', { ascending: false }).limit(1),
    ]);
    setCategorias(catRes.data || []);
    setSubcategorias(subRes.data || []);
    setContas(contRes.data || []);
    setBloqueios((bloqRes.data || []).map((b) => b.mes_ano));
    if (ultRes.data?.[0]) {
      const d = ultRes.data[0] as any;
      setUltimaReceita({ descricao: d.descricao, valor: d.valor, data: d.data, categoria_nome: d.categorias?.nome });
    }
  }

  function simularParcelas() {
    const n = parseInt(numParcelas, 10);
    if (n < 2) { toast.error('Parcelas devem ser maior que 1.'); return; }
    const totalCents = Math.round(parseCurrencyInput(valorDisplay) * 100);
    if (totalCents <= 0) { toast.error('Informe um valor válido.'); return; }
    if (!dataVencimento) { toast.error('Informe a data de vencimento.'); return; }
    const base = Math.floor(totalCents / n);
    const resto = totalCents - base * n;
    const rows: ParcelaRow[] = [];
    for (let i = 0; i < n; i++) {
      const v = (base + (i < resto ? 1 : 0)) / 100;
      const venc = addMonths(dataVencimento, i);
      rows.push({ numero: i + 1, valor: v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), competencia_mes: String(venc.getMonth() + 1), competencia_ano: String(venc.getFullYear()), vencimento: venc });
    }
    setParcelas(rows);
    setShowParcelas(true);
  }

  function updateParcela(i: number, field: keyof ParcelaRow, value: any) {
    setParcelas((prev) => { const c = [...prev]; c[i] = { ...c[i], [field]: value }; return c; });
  }

  function validate(): string | null {
    if (!categoriaId) return 'Selecione uma categoria.';
    if (parseCurrencyInput(valorDisplay) <= 0) return 'Informe um valor válido.';
    if (!dataVencimento) return 'Informe a data de vencimento.';
    if (!contaId) return 'Selecione uma conta.';
    const ano = parseInt(compAno, 10);
    if (ano < 1900 || ano > 2100) return 'Ano deve ser entre 1900 e 2100.';
    const comp = `${compAno}-${compMes.padStart(2, '0')}`;
    if (bloqueios.includes(comp)) return `Competência ${comp} bloqueada.`;
    const conta = contas.find((c) => c.id === contaId);
    if (conta?.data_saldo_inicial && dataVencimento < new Date(conta.data_saldo_inicial + 'T00:00:00')) {
      return `Data anterior ao saldo inicial da conta.`;
    }
    return null;
  }

  async function handleSave(marcarRecebida: boolean) {
    const error = validate();
    if (error) { toast.error(error); return; }
    setSaving(true);
    try {
      const n = parseInt(numParcelas, 10);
      const comp = `${compAno}-${compMes.padStart(2, '0')}`;
      if (n > 1 && showParcelas && parcelas.length > 0) {
        const loteId = crypto.randomUUID();
        const inserts = parcelas.map((p) => ({
          categoria_id: categoriaId, subcategoria_id: subcategoriaId || null, descricao: descricao || null,
          valor: parseCurrencyInput(p.valor), data: format(p.vencimento, 'yyyy-MM-dd'),
          competencia: `${p.competencia_ano}-${p.competencia_mes.padStart(2, '0')}`,
          conta_id: contaId, parcela: p.numero, lote_id: loteId, paga: false, usuario_id: user!.id,
        }));
        const { error } = await supabase.from('receitas').insert(inserts);
        if (error) throw error;
        toast.success(`${parcelas.length} parcelas salvas!`);
      } else {
        const insert = {
          categoria_id: categoriaId, subcategoria_id: subcategoriaId || null, descricao: descricao || null,
          valor: parseCurrencyInput(valorDisplay), data: format(dataVencimento!, 'yyyy-MM-dd'),
          competencia: comp, conta_id: contaId, parcela: 1, lote_id: crypto.randomUUID(),
          paga: marcarRecebida, data_pagamento: marcarRecebida ? format(dataVencimento!, 'yyyy-MM-dd') : null,
          usuario_id: user!.id,
        };
        const { error } = await supabase.from('receitas').insert(insert);
        if (error) throw error;
        toast.success(marcarRecebida ? 'Receita salva e recebida!' : 'Receita salva!');
      }
      setCategoriaId(''); setSubcategoriaId(''); setDescricao(''); setValorDisplay('');
      setDataVencimento(undefined); setNumParcelas('1'); setParcelas([]); setShowParcelas(false);
      const { data } = await supabase.from('receitas').select('descricao, valor, data, categorias(nome)').order('created_at', { ascending: false }).limit(1);
      if (data?.[0]) { const d = data[0] as any; setUltimaReceita({ descricao: d.descricao, valor: d.valor, data: d.data, categoria_nome: d.categorias?.nome }); }
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar.'); } finally { setSaving(false); }
  }

  const isSingle = parseInt(numParcelas, 10) <= 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div><h1 className="text-2xl font-bold">Nova Receita</h1><p className="text-muted-foreground">Cadastre uma nova receita</p></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5 text-success" /> Dados da Receita</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <Select value={categoriaId} onValueChange={(v) => { setCategoriaId(v); setSubcategoriaId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{filteredCategorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subcategoria</Label>
                  <Select value={subcategoriaId} onValueChange={setSubcategoriaId} disabled={!categoriaId}>
                    <SelectTrigger><SelectValue placeholder={categoriaId ? 'Selecione...' : 'Selecione categoria primeiro'} /></SelectTrigger>
                    <SelectContent>{filteredSubcategorias.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição da receita" maxLength={200} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={valorDisplay} onChange={(e) => setValorDisplay(formatCurrencyInput(e.target.value))} placeholder="0,00" inputMode="numeric" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Data de Vencimento *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !dataVencimento && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-4 w-4" />{dataVencimento ? format(dataVencimento, 'dd/MM/yyyy') : 'Selecione a data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dataVencimento} onSelect={setDataVencimento} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Mês Competência</Label>
                  <Select value={compMes} onValueChange={setCompMes}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, '0')}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ano Competência</Label>
                  <Input type="number" value={compAno} onChange={(e) => setCompAno(e.target.value)} min={1900} max={2100} />
                </div>
                <div className="space-y-2">
                  <Label>Conta *</Label>
                  <Select value={contaId} onValueChange={setContaId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 items-end">
                <div className="space-y-2">
                  <Label>Parcelas</Label>
                  <Input type="number" value={numParcelas} onChange={(e) => { setNumParcelas(e.target.value); setShowParcelas(false); setParcelas([]); }} min={1} max={120} />
                </div>
                {parseInt(numParcelas, 10) > 1 && (
                  <Button variant="outline" onClick={simularParcelas}><FlaskConical className="mr-2 h-4 w-4" /> Simular Parcelas</Button>
                )}
              </div>
            </CardContent>
          </Card>
          {showParcelas && parcelas.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Parcelas Simuladas</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-table-header text-table-header-foreground">
                      <th className="px-3 py-2 text-left rounded-tl-md">#</th><th className="px-3 py-2 text-left">Valor (R$)</th>
                      <th className="px-3 py-2 text-left">Competência</th><th className="px-3 py-2 text-left rounded-tr-md">Vencimento</th>
                    </tr></thead>
                    <tbody>{parcelas.map((p, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2 font-medium">{p.numero}</td>
                        <td className="px-3 py-2"><Input className="h-8 w-28" value={p.valor} onChange={(e) => updateParcela(i, 'valor', formatCurrencyInput(e.target.value))} inputMode="numeric" /></td>
                        <td className="px-3 py-2"><div className="flex gap-1">
                          <Select value={p.competencia_mes} onValueChange={(v) => updateParcela(i, 'competencia_mes', v)}>
                            <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
                            <SelectContent>{Array.from({ length: 12 }, (_, j) => <SelectItem key={j + 1} value={String(j + 1)}>{String(j + 1).padStart(2, '0')}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input className="h-8 w-20" type="number" value={p.competencia_ano} onChange={(e) => updateParcela(i, 'competencia_ano', e.target.value)} min={1900} max={2100} />
                        </div></td>
                        <td className="px-3 py-2">
                          <Popover><PopoverTrigger asChild><Button variant="outline" className="h-8 w-32 text-xs justify-start"><CalendarIcon className="mr-1 h-3 w-3" />{format(p.vencimento, 'dd/MM/yyyy')}</Button></PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={p.vencimento} onSelect={(d) => d && updateParcela(i, 'vencimento', d)} locale={ptBR} initialFocus className="p-3 pointer-events-auto" /></PopoverContent></Popover>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="flex gap-3">
            <Button onClick={() => handleSave(false)} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}</Button>
            {isSingle && (
              <Button variant="outline" onClick={() => handleSave(true)} disabled={saving} className="border-success text-success hover:bg-success/10">
                <CheckCircle className="mr-2 h-4 w-4" /> Salvar e Receber
              </Button>
            )}
          </div>
        </div>
        <div>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Última Receita Cadastrada</CardTitle></CardHeader>
            <CardContent>
              {ultimaReceita ? (
                <div className="space-y-2 text-sm">
                  <div><span className="text-muted-foreground">Categoria:</span> <span className="font-medium">{ultimaReceita.categoria_nome || '—'}</span></div>
                  <div><span className="text-muted-foreground">Descrição:</span> <span className="font-medium">{ultimaReceita.descricao || '—'}</span></div>
                  <div><span className="text-muted-foreground">Valor:</span> <span className="font-medium text-success">{formatCurrency(ultimaReceita.valor)}</span></div>
                  <div><span className="text-muted-foreground">Data:</span> <span className="font-medium">{ultimaReceita.data}</span></div>
                </div>
              ) : <p className="text-sm text-muted-foreground">Nenhuma receita cadastrada.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
