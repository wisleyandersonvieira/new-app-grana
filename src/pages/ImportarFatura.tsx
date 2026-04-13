import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, FileUp, Sparkles, ShieldCheck, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/financial';
import { importInvoicePdfPreview } from '@/lib/fatura-import/service';

type CartaoOption = { id: string; nome: string };

export default function ImportarFatura() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cartoes, setCartoes] = useState<CartaoOption[]>([]);
  const [cartaoId, setCartaoId] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('contas')
      .select('id, nome')
      .eq('usuario_id', user.id)
      .eq('tipo', 'cartao')
      .eq('bloqueada', false)
      .order('nome')
      .then(({ data }) => {
        if (data) setCartoes(data);
      });
  }, [user]);

  const competencia = useMemo(() => `${ano}-${mes.padStart(2, '0')}`, [ano, mes]);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 3 + i);

  const handleImport = async () => {
    if (!user || !cartaoId || !vencimento || !competencia || !file) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf') || file.type && file.type !== 'application/pdf') {
      toast.error('Envie um arquivo PDF válido.');
      return;
    }

    setLoading(true);

    const { data: existingInvoice } = await supabase
      .from('faturas_cartao')
      .select('id')
      .eq('usuario_id', user.id)
      .eq('conta_id', cartaoId)
      .eq('mes_ano', competencia)
      .maybeSingle();

    if (existingInvoice) {
      toast.error('Já existe uma fatura para este cartão e competência.');
      setLoading(false);
      return;
    }

    try {
      const preview = await importInvoicePdfPreview({
        userId: user.id,
        cartaoId,
        competencia,
        file,
      });

      const totalImportado = preview.itens.reduce((sum, item) => sum + item.valor, 0);
      const sugestoesAplicadas = preview.itens.filter((item) => item.categoria_id && item.subcategoria_id).length;

      const { data: fatura, error: faturaError } = await supabase
        .from('faturas_cartao')
        .insert({
          conta_id: cartaoId,
          data_vencimento: vencimento,
          mes_ano: competencia,
          usuario_id: user.id,
          valor_total: totalImportado,
          observacao: `Importada automaticamente via PDF (${preview.banco.toUpperCase()}).`,
        })
        .select('id')
        .single();

      if (faturaError || !fatura) throw faturaError ?? new Error('Não foi possível criar a fatura.');

      const rows = preview.itens.map((item) => ({
        fatura_id: fatura.id,
        usuario_id: user.id,
        descricao: item.descricao_original,
        descricao_original: item.descricao_original,
        descricao_normalizada: item.descricao_normalizada,
        valor: item.valor,
        categoria_id: item.categoria_id,
        subcategoria_id: item.subcategoria_id,
        categoria_sugerida_id: item.categoria_sugerida_id,
        subcategoria_sugerida_id: item.subcategoria_sugerida_id,
        parcelas: item.parcelas,
        data: vencimento,
        data_compra: item.data_compra,
        competencia,
        banco_origem: item.banco_origem,
        observacao_parser: item.observacao_parser,
        sugestao_origem: item.sugestao_origem,
        sugestao_confianca: item.sugestao_confianca,
        recorrente: item.recorrente,
        importado_pdf: true,
      }));

      const { error: itemsError } = await supabase.from('itens_fatura').insert(rows);
      if (itemsError) throw itemsError;

      await supabase.from('importacoes_fatura_pdf').insert({
        usuario_id: user.id,
        cartao_id: cartaoId,
        fatura_id: fatura.id,
        banco_origem: preview.banco,
        nome_arquivo: file.name,
        competencia,
        vencimento,
        total_itens_extraidos: preview.itens.length,
        total_importado: totalImportado,
        itens_sugeridos: sugestoesAplicadas,
        status: 'sucesso',
      });

      toast.success(`Fatura importada com sucesso. ${preview.itens.length} lançamentos encontrados e ${sugestoesAplicadas} itens sugeridos automaticamente.`);
      navigate(`/fatura/${fatura.id}`);
    } catch (error) {
      await supabase.from('importacoes_fatura_pdf').insert({
        usuario_id: user.id,
        cartao_id: cartaoId,
        banco_origem: null,
        nome_arquivo: file.name,
        competencia,
        vencimento,
        status: 'erro',
        mensagem_erro: error instanceof Error ? error.message : 'Erro desconhecido ao importar fatura.',
      });
      toast.error(error instanceof Error ? error.message : 'Erro ao importar fatura.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar Fatura PDF</h1>
          <p className="text-muted-foreground">Envie a fatura do cartão e deixe o sistema montar os lançamentos automaticamente.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/faturas')}>Voltar</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10">
                <Upload className="h-4 w-4 text-accent" />
              </div>
              Dados da importação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Cartão *</label>
                <Select value={cartaoId} onValueChange={setCartaoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                  <SelectContent>
                    {cartoes.map((cartao) => <SelectItem key={cartao.id} value={cartao.id}>{cartao.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Vencimento *</label>
                <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Competência *</label>
                <div className="flex gap-2">
                  <Select value={mes} onValueChange={setMes}>
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={ano} onValueChange={setAno}>
                    <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Arquivo PDF *</label>
                <Input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <FileUp className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Leitura automática com revisão assistida</p>
                  <p className="text-sm text-muted-foreground">
                    O sistema identifica o banco, extrai os lançamentos, detecta parcelas e sugere categoria e subcategoria com base no seu próprio histórico.
                  </p>
                  {file && (
                    <div className="pt-2">
                      <Badge variant="outline">{file.name}</Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={handleImport} disabled={loading}>
                <Sparkles className="mr-2 h-4 w-4" /> Importar Fatura
              </Button>
              <Button variant="outline" onClick={() => navigate('/faturas')}>Cancelar</Button>
              <Button variant="ghost" onClick={() => navigate('/nova-fatura')}>Voltar</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-white/55">Layouts iniciais</p>
                  <p className="text-xl font-semibold">Itaú e Sicoob</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge className="bg-white/10 text-white hover:bg-white/10">Parser expansível</Badge>
                <Badge className="bg-white/10 text-white hover:bg-white/10">Detecção de parcelas</Badge>
                <Badge className="bg-white/10 text-white hover:bg-white/10">Aprendizado contínuo</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium">Fluxo pensado para revisão rápida</p>
                  <p className="text-sm text-muted-foreground">Depois da importação você revisa só o que realmente precisa.</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                  <span>Banco identificado automaticamente</span>
                  <span className="font-medium text-foreground">Sim</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                  <span>Categorização por histórico</span>
                  <span className="font-medium text-foreground">Ativa</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                  <span>Total revisado pelo usuário</span>
                  <span className="font-medium text-foreground">Sempre editável</span>
                </div>
                <div className="rounded-xl bg-muted/40 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Resumo esperado</p>
                  <p className="mt-1 font-medium text-foreground">Banco identificado, quantidade de itens importados, total {formatCurrency(0)} e sugestões aplicadas.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
