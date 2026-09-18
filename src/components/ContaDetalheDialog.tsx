import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';

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
import { supabase } from '@/integrations/supabase/client';
import { formatDateTime } from '@/lib/account';
import { formatCurrency } from '@/lib/financial';

export type ContaDetalhe = {
  id: string;
  nome: string;
  tipo: string;
  saldo_inicial: number | null;
  data_saldo_inicial: string | null;
  bloqueada: boolean | null;
  created_at: string | null;
  usuario_id: string;
};

type ContaDetalheDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conta: ContaDetalhe | null;
  saldoAtual: number | null;
  ultimaMovimentacao: string | null;
  getTipoLabel: (tipo: string) => string;
  formatIsoDate: (date: string | null) => string;
  onEdit: () => void;
};

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

export function ContaDetalheDialog({
  open,
  onOpenChange,
  conta,
  saldoAtual,
  ultimaMovimentacao,
  getTipoLabel,
  formatIsoDate,
  onEdit,
}: ContaDetalheDialogProps) {
  // Não existe coluna created_by: a conta pertence a usuario_id, então o nome
  // vem do profile desse usuário (e-mail como reserva).
  const [cadastradoPor, setCadastradoPor] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !conta) return;

    let active = true;
    setCadastradoPor(null);

    void supabase
      .from('profiles')
      .select('nome, email')
      .eq('user_id', conta.usuario_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setCadastradoPor(data?.nome?.trim() || data?.email?.trim() || null);
      });

    return () => {
      active = false;
    };
  }, [open, conta]);

  if (!conta) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{conta.nome}</DialogTitle>
          <DialogDescription>Detalhes da conta, somente leitura.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nome">{conta.nome}</Campo>
          <Campo label="Tipo">{getTipoLabel(conta.tipo)}</Campo>

          <Campo label="Status">
            {conta.bloqueada ? (
              <Badge variant="destructive" className="h-5 rounded-full px-2 text-[11px]">Bloqueada</Badge>
            ) : (
              <Badge variant="default" className="h-5 rounded-full bg-green-600 px-2 text-[11px]">Ativa</Badge>
            )}
          </Campo>
          <Campo label="Data do cadastro">{formatDateTime(conta.created_at)}</Campo>

          <Campo label="Cadastrado por">{cadastradoPor ?? '—'}</Campo>
          <Campo label="Saldo inicial">{formatCurrency(conta.saldo_inicial ?? 0)}</Campo>

          <Campo label="Data do saldo inicial">{formatIsoDate(conta.data_saldo_inicial)}</Campo>
          <Campo label="Saldo atual">
            <span className={saldoAtual != null && saldoAtual < 0 ? 'text-red-600' : undefined}>
              {saldoAtual == null ? '—' : formatCurrency(saldoAtual)}
            </span>
          </Campo>

          <Campo label="Última movimentação">{formatIsoDate(ultimaMovimentacao)}</Campo>
        </div>

        <DialogFooter>
          <Button type="button" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
