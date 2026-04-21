import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, Copy, FileSearch, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { extractPdfText } from '@/lib/fatura-import/pdf-text';
import { identifyBankFromText, parseStatementText } from '@/lib/fatura-import/service';
import { debugItauParsing, type ItauDebugResult } from '@/lib/fatura-import/parsers/itau-helpers';
import type { ParsedStatementItem, SupportedBank } from '@/lib/fatura-import/types';

type DiagnosticState = {
  bank: SupportedBank | null;
  extractedText: string;
  parsedItems: ParsedStatementItem[];
  itauDebug: ItauDebugResult | null;
};

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function DiagnosticoImportacaoFatura() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [mes, setMes] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticState | null>(null);

  const competencia = useMemo(() => `${ano}-${mes}`, [ano, mes]);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast.error('Selecione um PDF para analisar.');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Envie um arquivo PDF válido.');
      return;
    }

    setLoading(true);
    try {
      const extracted = await extractPdfText(file);
      const extractedText = extracted.text;
      const bank = identifyBankFromText(extractedText);
      const parsedItems = bank ? parseStatementText(extractedText, { competencia, pdfLayout: extracted }) : [];
      const itauDebug = bank === 'itau' ? debugItauParsing(extractedText, { competencia }) : null;

      setResult({
        bank,
        extractedText,
        parsedItems,
        itauDebug,
      });

      toast.success(`Diagnóstico concluído${bank ? ` para ${bank.toUpperCase()}` : ''}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao diagnosticar o PDF.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const parsedItemsJson = result ? formatJson(result.parsedItems) : '';
  const itauClassificationsJson = result?.itauDebug ? formatJson(result.itauDebug.classifications) : '';
  const itauItemsJson = result?.itauDebug ? formatJson(result.itauDebug.parsedItems) : '';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Diagnóstico da Importação</h1>
          <p className="text-muted-foreground">
            Abra o PDF aqui no app e me envie o log extraído. Isso mostra exatamente onde o parser está perdendo linhas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/importar-fatura')}>
            Voltar para importação
          </Button>
          <Button variant="outline" onClick={() => navigate('/faturas')}>
            Faturas
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/10">
                <Bug className="h-4 w-4 text-accent" />
              </div>
              Executar diagnóstico
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-medium">Arquivo PDF</label>
              <Input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Mês da competência</label>
                <Input value={mes} onChange={(event) => setMes(event.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="03" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Ano da competência</label>
                <Input value={ano} onChange={(event) => setAno(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2026" />
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Upload className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Saída pronta para me mostrar</p>
                  <p className="text-sm text-muted-foreground">
                    A tela gera o texto bruto, as linhas preprocessadas, os blocos do Itaú e o JSON das transações finais.
                  </p>
                  {file && <Badge variant="outline">{file.name}</Badge>}
                </div>
              </div>
            </div>

            <Button onClick={handleAnalyze} disabled={loading}>
              <FileSearch className="mr-2 h-4 w-4" />
              {loading ? 'Analisando PDF...' : 'Gerar diagnóstico'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">Competência: {competencia}</Badge>
              <Badge variant="outline">Banco: {result?.bank?.toUpperCase() ?? 'não identificado'}</Badge>
              <Badge variant="outline">Itens finais: {result?.parsedItems.length ?? 0}</Badge>
              {result?.itauDebug && <Badge variant="outline">Linhas fonte: {result.itauDebug.totalSourceLines}</Badge>}
              {result?.itauDebug && <Badge variant="outline">Blocos Itaú: {result.itauDebug.afterPreprocessLines}</Badge>}
            </div>
            <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Se o total continuar baixo, me envie primeiro o conteúdo das abas `Linhas Itaú` e `Itens finais`.
            </div>
          </CardContent>
        </Card>
      </div>

      {result && (
        <Tabs defaultValue="raw" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/70 p-1">
            <TabsTrigger value="raw">Texto bruto</TabsTrigger>
            <TabsTrigger value="items">Itens finais</TabsTrigger>
            {result.itauDebug && <TabsTrigger value="itau-lines">Linhas Itaú</TabsTrigger>}
            {result.itauDebug && <TabsTrigger value="itau-classifications">Classificações</TabsTrigger>}
          </TabsList>

          <TabsContent value="raw" className="space-y-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Texto extraído do PDF</CardTitle>
                <Button variant="outline" size="sm" onClick={() => copyText('texto bruto', result.extractedText)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar
                </Button>
              </CardHeader>
              <CardContent>
                <Textarea value={result.extractedText} readOnly className="min-h-[420px] font-mono text-xs" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="items" className="space-y-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Transações finais parseadas</CardTitle>
                <Button variant="outline" size="sm" onClick={() => copyText('itens finais', parsedItemsJson)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar JSON
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea value={parsedItemsJson} readOnly className="min-h-[320px] font-mono text-xs" />
                <div className="max-h-[360px] overflow-auto rounded-lg border">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left">
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Descrição</th>
                        <th className="px-3 py-2">Parcelas</th>
                        <th className="px-3 py-2">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.parsedItems.map((item, index) => (
                        <tr key={`${item.descricao_normalizada}-${index}`} className="border-b align-top">
                          <td className="px-3 py-2">{item.data_compra ?? '-'}</td>
                          <td className="px-3 py-2">{item.descricao_original}</td>
                          <td className="px-3 py-2">{item.parcelas ?? '-'}</td>
                          <td className="px-3 py-2">{item.valor.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {result.itauDebug && (
            <TabsContent value="itau-lines" className="space-y-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Linhas e blocos do Itaú</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyText(
                      'linhas do Itaú',
                      [
                        '### sourceLines',
                        ...result.itauDebug!.sourceLines,
                        '',
                        '### preprocessedLines',
                        ...result.itauDebug!.preprocessedLines,
                        '',
                        '### parsedItems',
                        itauItemsJson,
                      ].join('\n'),
                    )}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar tudo
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Linhas fonte</p>
                      <Textarea value={result.itauDebug.sourceLines.join('\n')} readOnly className="min-h-[320px] font-mono text-xs" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Linhas após preprocessamento</p>
                      <Textarea value={result.itauDebug.preprocessedLines.join('\n')} readOnly className="min-h-[320px] font-mono text-xs" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {result.itauDebug && (
            <TabsContent value="itau-classifications" className="space-y-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Classificações linha a linha</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => copyText('classificações', itauClassificationsJson)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar JSON
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.itauDebug.classificationCounts).map(([key, value]) => (
                      <Badge key={key} variant="outline">{key}: {value}</Badge>
                    ))}
                  </div>
                  <Textarea value={itauClassificationsJson} readOnly className="min-h-[320px] font-mono text-xs" />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
