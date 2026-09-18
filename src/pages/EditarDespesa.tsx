import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Save, TrendingDown, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/financial';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isVisivelPara, type Classificacao } from '@/lib/classificacao';

export default function EditarDespesa() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [categoriaId, setCategoriaId] = useState('');
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorDisplay, setValorDisplay] = useState('');
  const [dataVencimento, setDataVencimento] = useState<Date | undefined>(undefined);
  const [compMes, setCompMes] = useState('');
  const [compAno, setCompAno] = useState('');
  const [contaId, setContaId] = useState('');
  const [dataCadastro, setDataCadastro] = useState('');
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockMsg, setBlockMsg] = useState('');
  const [isCartao, setIsCartao] = useState(false);

  const [categorias, setCategorias] = useState<{ id: string; nome: string; classificacao: Classificacao }[]>([]);
  const [subcategorias, setSubcategorias] = useState<{ id: string; nome: string; categoria_id: string; classificacao: Classificacao }[]>([]);
  // Categoria/subcategoria originais do lançamento: continuam disponíveis mesmo que a classificação atual não seja compatível.
  const [originalCategoriaId, setOriginalCategoriaId] = useState('');
  const [originalSubcategoriaId, setOriginalSubcategoriaId] = useState('');
  const [contas, setContas] = useState<{ id: string; nome: string; data_saldo_inicial: string | null }[]>([]);
  const [bloqueios, setBloqueios] = useState<string[]>([]);

  const filteredCategorias = useMemo(
    () => categorias.filter((c) => isVisivelPara(c.classificacao, 'despesa') || c.id === categoriaId || c.id === originalCategoriaId),
    [categorias, categoriaId, originalCategoriaId],
  );

  const filteredSubs = useMemo(
    () => subcategorias.filter((s) => (
      s.categoria_id === categoriaId
      && (isVisivelPara(s.classificacao, 'despesa') || s.id === subcategoriaId || s.id === originalSubcategoriaId)
    )),
    [subcategorias, categoriaId, subcategoriaId, originalSubcategoriaId],
  );

  useEffect(() => {
    if (!user || !id) return;
    loadData();
  }, [user, id]);

  async function loadData() {
    const [catRes, subRes, contRes, bloqRes, despRes] = await Promise.all([
      supabase.from('categorias').select('id, nome, classificacao').order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id, classificacao').order('nome'),
      supabase.from('contas').select('id, nome, data_saldo_inicial, tipo').eq('bloqueada', false).order('nome'),
      supabase.from('bloqueios').select('mes_ano, tipo'),
      supabase.from('despesas').select('*, contas(tipo)').eq('id', id!).single(),
    ]);

    setCategorias(catRes.data || []);
    setSubcategorias(subRes.data || []);
    setContas((contRes.data || []).filter((c: any) => c.tipo === 'conta').map((c: any) => ({ id: c.id, nome: c.nome, data_saldo_inicial: c.data_saldo_inicial })));

    const compBloqueios = (bloqRes.data || []).filter((b) => b.tipo === 'competencia').map((b) => b.mes_ano);
    const pagtoBloqueios = (bloqRes.data || []).filter((b) => b.tipo === 'pagamento').map((b) => b.mes_ano);
    setBloqueios(compBloqueios);

    if (despRes.data) {
      const d = despRes.data as any;

      // Check cartão
      if (d.contas?.tipo === 'cartao') {
        setIsCartao(true);
        toast.error('Despesas de Cartão de Crédito devem ser editadas pelo menu Faturas.');
        navigate('/faturas');
        return;
      }

      setCategoriaId(d.categoria_id || '');
      setSubcategoriaId(d.subcategoria_id || '');
      setOriginalCategoriaId(d.categoria_id || '');
      setOriginalSubcategoriaId(d.subcategoria_id || '');
      setDescricao(d.descricao || '');
      const valStr = (d.valor as number).toFixed(2).replace('.', ',');
      setValorDisplay(valStr);
      if (d.data) setDataVencimento(new Date(d.data + 'T00:00:00'));
      if (d.competencia) {
        const [y, m] = d.competencia.split('-');
        setCompMes(String(parseInt(m, 10)));
        setCompAno(y);
      }
      setContaId(d.conta_id || '');
      setDataCadastro(d.created_at ? new Date(d.created_at).toLocaleString('pt-BR') : '');

      // Check blocking
      if (d.competencia && compBloqueios.includes(d.competencia)) {
        setBlocked(true);
        setBlockMsg('Esta despesa pertence a uma competência bloqueada e não pode ser alterada.');
      }
      if (d.data_pagamento) {
        const pgtoComp = d.data_pagamento.substring(0, 7);
        if (pagtoBloqueios.includes(pgtoComp)) {
          setBlocked(true);
          setBlockMsg('O mês de pagamento desta despesa está bloqueado.');
        }
      }
    } else {
      toast.error('Despesa não encontrada.');
      navigate('/despesas');
    }
  }

  async function handleSave() {
    if (!categoriaId) { toast.error('Selecione uma categoria.'); return; }
    if (parseCurrencyInput(valorDisplay) <= 0) { toast.error('Informe um valor válido.'); return; }
    if (!dataVencimento) { toast.error('Informe a data de vencimento.'); return; }
    if (!contaId) { toast.error('Selecione uma conta.'); return; }
    const ano = parseInt(compAno, 10);
    if (ano < 1900 || ano > 2100) { toast.error('Ano deve ser entre 1900 e 2100.'); return; }
    const comp = `${compAno}-${compMes.padStart(2, '0')}`;
    if (bloqueios.includes(comp)) { toast.error('Competência bloqueada.'); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from('despesas').update({
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId || null,
        descricao: descricao || null,
        valor: parseCurrencyInput(valorDisplay),
        data: format(dataVencimento, 'yyyy-MM-dd'),
        competencia: comp,
        conta_id: contaId,
      }).eq('id', id!);

      if (error) throw error;
      toast.success('Despesa atualizada!');

      // Navigate back
      const from = (location.state as any)?.from || '/despesas';
      navigate(from);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar.');
    } finally {
      setSaving(false);
    }
  }

  if (isCartao) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div><h1 className="text-2xl font-bold">Editar Despesa</h1></div>

      {blocked && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{blockMsg}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingDown className="h-5 w-5 text-destructive" /> Dados da Despesa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={categoriaId} onValueChange={(v) => { setCategoriaId(v); setSubcategoriaId(''); }} disabled={blocked}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{filteredCategorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subcategoria</Label>
              <Select value={subcategoriaId} onValueChange={setSubcategoriaId} disabled={blocked || !categoriaId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{filteredSubs.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={blocked} maxLength={200} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                <Input className="pl-10" value={valorDisplay} onChange={(e) => setValorDisplay(formatCurrencyInput(e.target.value))} disabled={blocked} inputMode="numeric" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data de Vencimento *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !dataVencimento && 'text-muted-foreground')} disabled={blocked}>
                    <CalendarIcon className="mr-2 h-4 w-4" />{dataVencimento ? format(dataVencimento, 'dd/MM/yyyy') : 'Selecione'}
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
              <Label>Mês</Label>
              <Select value={compMes} onValueChange={setCompMes} disabled={blocked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, '0')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ano</Label>
              <Input type="number" value={compAno} onChange={(e) => setCompAno(e.target.value)} disabled={blocked} min={1900} max={2100} />
            </div>
            <div className="space-y-2">
              <Label>Conta *</Label>
              <Select value={contaId} onValueChange={setContaId} disabled={blocked}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {dataCadastro && (
            <div className="text-xs text-muted-foreground">Data de cadastro: {dataCadastro}</div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || blocked}>
          <Save className="mr-2 h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
      </div>
    </div>
  );
}
