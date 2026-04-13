import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/financial';
import type { ImportedInvoiceItem, SupportedBank } from '@/lib/fatura-import/types';

type CategoriaOption = { id: string; nome: string };
type SubcategoriaOption = { id: string; nome: string; categoria_id: string };

interface ImportInvoiceReviewDialogProps {
  open: boolean;
  banco: SupportedBank | null;
  competencia: string;
  vencimento: string;
  items: ImportedInvoiceItem[];
  categories: CategoriaOption[];
  subcategories: SubcategoriaOption[];
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryChange: (index: number, categoriaId: string) => void;
  onSubcategoryChange: (index: number, subcategoriaId: string) => void;
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
  onCategoryChange,
  onSubcategoryChange,
  onConfirm,
}: ImportInvoiceReviewDialogProps) {
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

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {banco && <Badge variant="outline">Banco: {banco.toUpperCase()}</Badge>}
          <Badge variant="outline">Competência: {competencia}</Badge>
          <Badge variant="outline">Vencimento: {vencimento}</Badge>
          <Badge variant="outline">Lançamentos: {items.length}</Badge>
          <Badge variant="outline">Total: {formatCurrency(total)}</Badge>
          {pendingCount > 0 && <Badge variant="outline">Pendentes: {pendingCount}</Badge>}
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Compra</th>
                <th className="px-3 py-2">Parcelas</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Subcategoria</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const filteredSubcategories = subcategories.filter((subcategoria) => subcategoria.categoria_id === item.categoria_id);
                const needsReview = !item.categoria_id || !item.subcategoria_id;

                return (
                  <tr key={`${item.descricao_normalizada}-${index}`} className={needsReview ? 'border-b bg-muted/40 align-top' : 'border-b align-top'}>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{item.descricao_original}</p>
                        <div className="flex flex-wrap gap-2">
                          {item.sugestao_origem && <Badge variant="outline">Sugestão</Badge>}
                          {item.recorrente && <Badge variant="outline">Recorrente</Badge>}
                          {needsReview && <Badge variant="outline">Revisar</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{item.data_compra ?? '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground">{item.parcelas ?? '—'}</td>
                    <td className="px-3 py-3 font-medium">{formatCurrency(item.valor)}</td>
                    <td className="px-3 py-3">
                      <Select value={item.categoria_id ?? ''} onValueChange={(value) => onCategoryChange(index, value)}>
                        <SelectTrigger className="h-9 w-[180px]">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((categoria) => (
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={loading || items.length === 0}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar importação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
