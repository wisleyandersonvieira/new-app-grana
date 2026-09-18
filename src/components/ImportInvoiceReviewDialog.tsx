import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/financial';
import type { ImportedInvoiceItem, SupportedBank } from '@/lib/fatura-import/types';
import { isVisivelPara, type Classificacao } from '@/lib/classificacao';

type CategoriaOption = { id: string; nome: string; classificacao: Classificacao };
type SubcategoriaOption = { id: string; nome: string; categoria_id: string; classificacao: Classificacao };
type ReviewInvoiceItem = ImportedInvoiceItem & { valor_input?: string };

interface ImportInvoiceReviewDialogProps {
  open: boolean;
  banco: SupportedBank | null;
  competencia: string;
  vencimento: string;
  items: ReviewInvoiceItem[];
  categories: CategoriaOption[];
  subcategories: SubcategoriaOption[];
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onDescriptionChange: (index: number, descricao: string) => void;
  onPurchaseDateChange: (index: number, dataCompra: string) => void;
  onInstallmentsChange: (index: number, parcelas: string) => void;
  onValueChange: (index: number, valor: string) => void;
  onCategoryChange: (index: number, categoriaId: string) => void;
  onSubcategoryChange: (index: number, subcategoriaId: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onConfirm: () => void;
}

export function ImportInvoiceReviewDialog({
  open,
  banco,
  competencia,
  vencimento,
  items,
  categories,
  subcategories,
  loading,
  onOpenChange,
  onDescriptionChange,
  onPurchaseDateChange,
  onInstallmentsChange,
  onValueChange,
  onCategoryChange,
  onSubcategoryChange,
  onAddItem,
  onRemoveItem,
  onConfirm,
}: ImportInvoiceReviewDialogProps) {
  // Fatura de cartão: apenas categorias e subcategorias visíveis para despesa.
  const visibleCategories = categories.filter((categoria) => isVisivelPara(categoria.classificacao, 'despesa'));
  const total = items.reduce((sum, item) => sum + item.valor, 0);
  const pendingCount = items.filter((item) => !item.categoria_id || !item.subcategoria_id).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Revisar importação da fatura</DialogTitle>
          <DialogDescription>
            Confira as linhas extraídas do PDF e selecione categoria e subcategoria antes de concluir a importação.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {banco && <Badge variant="outline">Banco: {banco.toUpperCase()}</Badge>}
            <Badge variant="outline">Competência: {competencia}</Badge>
            <Badge variant="outline">Vencimento: {vencimento}</Badge>
            <Badge variant="outline">Lançamentos: {items.length}</Badge>
            <Badge variant="outline">Total: {formatCurrency(total)}</Badge>
            {pendingCount > 0 && <Badge variant="outline">Pendentes: {pendingCount}</Badge>}
          </div>

          <Button type="button" variant="outline" onClick={onAddItem} disabled={loading}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar linha
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[1240px] text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="px-3 py-2">Histórico</th>
                <th className="px-3 py-2">Compra</th>
                <th className="px-3 py-2">Parcelas</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Subcategoria</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const filteredSubcategories = subcategories.filter((subcategoria) => (
                  subcategoria.categoria_id === item.categoria_id && isVisivelPara(subcategoria.classificacao, 'despesa')
                ));
                const needsReview = !item.categoria_id || !item.subcategoria_id;

                return (
                  <tr key={`${item.descricao_normalizada}-${index}`} className={needsReview ? 'border-b bg-muted/40 align-top' : 'border-b align-top'}>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <Input
                          value={item.descricao_original ?? ''}
                          onChange={(event) => onDescriptionChange(index, event.target.value)}
                          placeholder="Descreva o lançamento"
                          disabled={loading}
                        />
                        <div className="flex flex-wrap gap-2">
                          {item.sugestao_origem && <Badge variant="outline">Sugestão</Badge>}
                          {item.recorrente && <Badge variant="outline">Recorrente</Badge>}
                          {needsReview && <Badge variant="outline">Revisar</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        type="date"
                        value={item.data_compra ?? ''}
                        onChange={(event) => onPurchaseDateChange(index, event.target.value)}
                        disabled={loading}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        value={item.parcelas ?? ''}
                        onChange={(event) => onInstallmentsChange(index, event.target.value)}
                        placeholder="Ex.: 1/3"
                        disabled={loading}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        inputMode="decimal"
                        value={item.valor_input ?? ''}
                        onChange={(event) => onValueChange(index, event.target.value)}
                        placeholder="0,00"
                        disabled={loading}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Select value={item.categoria_id ?? ''} onValueChange={(value) => onCategoryChange(index, value)}>
                        <SelectTrigger className="h-9 w-[180px]">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {visibleCategories.map((categoria) => (
                            <SelectItem key={categoria.id} value={categoria.id}>
                              {categoria.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={item.subcategoria_id ?? ''}
                        onValueChange={(value) => onSubcategoryChange(index, value)}
                        disabled={!item.categoria_id}
                      >
                        <SelectTrigger className="h-9 w-[200px]">
                          <SelectValue placeholder="Subcategoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredSubcategories.map((subcategoria) => (
                            <SelectItem key={subcategoria.id} value={subcategoria.id}>
                              {subcategoria.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 w-9 p-0"
                        onClick={() => onRemoveItem(index)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Excluir linha</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={loading || items.length === 0}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar importação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
