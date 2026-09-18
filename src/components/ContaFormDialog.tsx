import { useEffect, useId, useState } from 'react';
import { Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/financial';

export type ContaFormConta = {
  id: string;
  nome: string;
  tipo: string;
  saldo_inicial: number | null;
  data_saldo_inicial: string | null;
};

type ContaFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null cadastra uma conta nova; preenchido edita a conta informada. */
  conta: ContaFormConta | null;
  userId: string;
  onSaved: () => void | Promise<void>;
};

/** Máscara de moeda preservando o sinal, que `formatCurrencyInput` descarta. */
function formatSaldoInput(value: string) {
  const isNegative = value.trim().startsWith('-');
  const formatted = formatCurrencyInput(value);
  if (!formatted) return isNegative ? '-' : '';
  return isNegative ? `-${formatted}` : formatted;
}

function saldoToInput(value: number | null | undefined) {
  if (value == null) return '';
  const formatted = formatCurrencyInput(String(Math.round(Math.abs(value) * 100)));
  return value < 0 ? `-${formatted}` : formatted;
}

export function ContaFormDialog({ open, onOpenChange, conta, userId, onSaved }: ContaFormDialogProps) {
  const nomeId = useId();
  const saldoId = useId();
  const dataSaldoId = useId();

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('conta');
  const [saldoStr, setSaldoStr] = useState('');
  const [dataSaldo, setDataSaldo] = useState('');
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(conta);

  // Reabrir a modal sempre recomeça do registro atual.
  useEffect(() => {
    if (!open) return;
    setNome(conta?.nome ?? '');
    setTipo(conta?.tipo || 'conta');
    setSaldoStr(saldoToInput(conta?.saldo_inicial));
    setDataSaldo(conta?.data_saldo_inicial ?? '');
    setSaving(false);
  }, [open, conta]);

  const handleSave = async () => {
    if (!nome.trim() || !tipo) return;

    setSaving(true);
    const payload = {
      nome: nome.trim(),
      tipo,
      saldo_inicial: parseCurrencyInput(saldoStr),
      data_saldo_inicial: dataSaldo || null,
    };

    const { error } = conta
      ? await supabase.from('contas').update(payload).eq('id', conta.id)
      : await supabase.from('contas').insert({ ...payload, usuario_id: userId });

    if (error) {
      toast.error(conta ? 'Erro ao editar' : 'Erro ao cadastrar conta');
      setSaving(false);
      return;
    }

    toast.success(conta ? 'Conta atualizada!' : 'Conta cadastrada!');
    setSaving(false);
    onOpenChange(false);
    await onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar conta' : 'Cadastrar conta'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Altere os dados da conta. O saldo inicial e a data do saldo são usados no cálculo do saldo atual.'
              : 'Informe os dados da conta ou do cartão de crédito.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={nomeId}>Nome *</Label>
            <Input
              id={nomeId}
              placeholder="Nome da conta"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && nome.trim()) void handleSave();
              }}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conta">Conta</SelectItem>
                <SelectItem value="cartao">Cartão de Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={saldoId}>Saldo inicial</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  id={saldoId}
                  className="pl-10"
                  placeholder="0,00"
                  inputMode="numeric"
                  value={saldoStr}
                  onChange={(event) => setSaldoStr(formatSaldoInput(event.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={dataSaldoId}>Data do saldo</Label>
              <Input
                id={dataSaldoId}
                type="date"
                value={dataSaldo}
                onChange={(event) => setDataSaldo(event.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !nome.trim()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isEditing ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {isEditing ? 'Salvar' : 'Cadastrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
