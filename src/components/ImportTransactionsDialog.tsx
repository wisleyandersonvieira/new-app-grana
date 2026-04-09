import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ImportReferenceItem,
  ImportSubcategoryItem,
  validateTransactionImportRows,
  parseTransactionImportRows,
} from '@/lib/import';

interface ImportTransactionsDialogProps {
  kind: 'receitas' | 'despesas';
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ImportReferenceItem[];
  subcategories: ImportSubcategoryItem[];
  accounts: ImportReferenceItem[];
  onImported: () => Promise<void> | void;
}

interface ImportPreview {
  fileName: string;
  totalRows: number;
  validRows: number;
  errors: string[];
  rows: Array<{
    data: string;
    valor: number;
    descricao: string | null;
    competencia: string | null;
    dataPagamento: string | null;
    paga: boolean;
    categoriaId: string;
    subcategoriaId: string | null;
    contaId: string;
  }>;
}

export function ImportTransactionsDialog({
  kind,
  userId,
  open,
  onOpenChange,
  categories,
  subcategories,
  accounts,
  onImported,
}: ImportTransactionsDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [importing, setImporting] = useState(false);

  const isReceita = kind === 'receitas';

  async function handleFileSelected(file: File) {
    setLoadingFile(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

      if (rawRows.length === 0) {
        setPreview(null);
        toast.error('A planilha está vazia.');
        return;
      }

      const parsed = parseTransactionImportRows(rawRows);
      const validated = validateTransactionImportRows(parsed.rows, categories, subcategories, accounts);
      const errors = [...parsed.errors, ...validated.errors];

      setPreview({
        fileName: file.name,
        totalRows: rawRows.length,
        validRows: validated.rows.length,
        errors,
        rows: validated.rows.map((row) => ({
          data: row.data,
          valor: row.valor,
          descricao: row.descricao,
          competencia: row.competencia,
          dataPagamento: row.dataPagamento,
          paga: row.paga,
          categoriaId: row.categoriaId,
          subcategoriaId: row.subcategoriaId,
          contaId: row.contaId,
        })),
      });
    } catch (error: any) {
      setPreview(null);
      toast.error(error?.message || 'Não foi possível ler a planilha.');
    } finally {
      setLoadingFile(false);
    }
  }

  async function handleImport() {
    if (!preview || preview.rows.length === 0) return;

    setImporting(true);
    try {
      const payload = preview.rows.map((row) => ({
        categoria_id: row.categoriaId,
        subcategoria_id: row.subcategoriaId,
        descricao: row.descricao,
        valor: row.valor,
        data: row.data,
        competencia: row.competencia ?? row.data.slice(0, 7),
        conta_id: row.contaId,
        parcela: 1,
        lote_id: crypto.randomUUID(),
        paga: row.paga,
        data_pagamento: row.paga ? row.dataPagamento ?? row.data : null,
        usuario_id: userId,
      }));

      const { error } = await supabase.from(kind).insert(payload);
      if (error) throw error;

      toast.success(`${payload.length} ${isReceita ? 'receita(s)' : 'despesa(s)'} importada(s) com sucesso.`);
      setPreview(null);
      onOpenChange(false);
      await onImported();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao importar dados.');
    } finally {
      setImporting(false);
    }
  }

  function resetState(nextOpen: boolean) {
    if (!nextOpen) {
      setPreview(null);
      setLoadingFile(false);
      setImporting(false);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={resetState}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar {isReceita ? 'Receitas' : 'Despesas'}</DialogTitle>
          <DialogDescription>
            Use uma planilha `xlsx`, `xls` ou `csv` com as colunas `data`, `valor`, `categoria` e `conta`.
            As colunas `subcategoria`, `descricao`, `competencia`, `paga` e `data pagamento` são opcionais.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-dashed p-4">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFileSelected(file);
              event.target.value = '';
            }}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Arquivo para importação</p>
              <p className="text-sm text-muted-foreground">
                Nomes de categoria, subcategoria e conta precisam existir no seu cadastro.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={loadingFile || importing}>
              {loadingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Escolher arquivo
            </Button>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-4 text-sm">
          <p className="font-medium">Modelo aceito</p>
          <p className="mt-1 text-muted-foreground">
            Exemplo: `data`, `valor`, `categoria`, `subcategoria`, `descricao`, `competencia`, `conta`, `paga`, `data pagamento`.
          </p>
        </div>

        {preview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border p-3">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">{preview.fileName}</p>
                <p className="text-muted-foreground">
                  {preview.validRows} de {preview.totalRows} linha(s) pronta(s) para importação
                </p>
              </div>
            </div>

            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Pendências encontradas</p>
                <div className="mt-2 max-h-40 overflow-auto space-y-1 text-muted-foreground">
                  {preview.errors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => resetState(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleImport()} disabled={!preview || preview.rows.length === 0 || importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
