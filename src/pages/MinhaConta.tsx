import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2, PencilLine, RefreshCcw, ShieldCheck, User2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate, formatDateTime, getAccountStatusMeta, getDaysLeft, getStatusMeta } from '@/lib/account';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

type AccountPayload = {
  profile: {
    user_id: string;
    nome: string | null;
    email: string | null;
    telefone?: string | null;
    empresa?: string | null;
    created_at: string | null;
    status: string | null;
    role?: string | null;
    access_blocked?: boolean | null;
    last_login_at?: string | null;
    ultimo_acesso?: string | null;
  };
  auth: {
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
  };
  subscription: {
    plano?: string | null;
    status?: string | null;
    valor?: number | null;
    moeda?: string | null;
    frequencia?: string | null;
    trial_fim?: string | null;
    current_period_end?: string | null;
    data_expiracao?: string | null;
    cancel_at_period_end?: boolean | null;
    payment_brand?: string | null;
    payment_last4?: string | null;
    payment_exp_month?: number | null;
    payment_exp_year?: number | null;
  } | null;
  paymentMethods: Array<{
    stripe_payment_method_id: string;
    type: string | null;
    brand: string | null;
    last4: string | null;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean | null;
  }>;
  invoices: Array<{
    stripe_invoice_id: string;
    created_at: string | null;
    amount_paid: number | null;
    amount_due: number | null;
    status: string | null;
    invoice_pdf: string | null;
    hosted_invoice_url: string | null;
    paid_at: string | null;
  }>;
  logs: Array<{
    id: string;
    acao: string;
    created_at: string | null;
    detalhes: Record<string, unknown>;
  }>;
};

const initialForm = { nome: '', telefone: '', empresa: '', password: '' };

export default function MinhaConta() {
  const { user, refreshSubscription } = useAuth();
  const [data, setData] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initialForm);

  const loadAccount = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('account-data');
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Não foi possível carregar a conta.');
      setLoading(false);
      return;
    }
    setData(data);
    setForm({
      nome: data.profile.nome || '',
      telefone: data.profile.telefone || '',
      empresa: data.profile.empresa || '',
      password: '',
    });
    setLoading(false);
  };

  useEffect(() => {
    void loadAccount();
  }, []);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving('profile');
    const { error } = await supabase
      .from('profiles')
      .update({
        nome: form.nome,
        telefone: form.telefone || null,
        empresa: form.empresa || null,
      })
      .eq('user_id', user.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Dados atualizados.');
      setEditing(false);
      await loadAccount();
    }
    setSaving(null);
  };

  const handleChangePassword = async () => {
    if (!form.password) {
      toast.error('Digite uma nova senha.');
      return;
    }
    setSaving('password');
    const { error } = await supabase.auth.updateUser({ password: form.password });
    if (error) toast.error(error.message);
    else {
      toast.success('Senha atualizada com sucesso.');
      setForm((current) => ({ ...current, password: '' }));
    }
    setSaving(null);
  };

  const handlePortal = async () => {
    setSaving('portal');
    const { data, error } = await supabase.functions.invoke('customer-portal');
    if (error || data?.error || !data?.url) toast.error(data?.error || error?.message || 'Não foi possível abrir o portal.');
    else window.open(data.url, '_blank', 'noopener,noreferrer');
    setSaving(null);
  };

  const handleCancelSubscription = async () => {
    setSaving('cancel');
    const { data, error } = await supabase.functions.invoke('cancel-subscription');
    if (error || data?.error) toast.error(data?.error || error?.message || 'Não foi possível cancelar.');
    else {
      toast.success('Assinatura configurada para cancelar no fim do período.');
      await Promise.all([loadAccount(), refreshSubscription()]);
    }
    setSaving(null);
  };

  const handleResumeSubscription = async () => {
    setSaving('resume');
    const { data, error } = await supabase.functions.invoke('resume-subscription');
    if (error || data?.error) toast.error(data?.error || error?.message || 'Não foi possível reativar.');
    else {
      toast.success('Assinatura reativada.');
      await Promise.all([loadAccount(), refreshSubscription()]);
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const accountMeta = getAccountStatusMeta(data.profile.status, data.profile.access_blocked);
  const subscriptionMeta = getStatusMeta(data.subscription?.status);
  const trialDays = getDaysLeft(data.subscription?.trial_fim);
  const defaultPaymentMethod = data.paymentMethods.find((item) => item.is_default) || data.paymentMethods[0];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Minha Conta</h1>
          <p>Gerencie seus dados, segurança, assinatura e pagamentos em um só lugar.</p>
        </div>
        <Button variant="outline" onClick={() => void loadAccount()} disabled={loading}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden border-none bg-[linear-gradient(135deg,hsl(var(--card))_0%,hsl(var(--card))_55%,hsl(var(--primary)/0.08)_100%)] shadow-[var(--card-shadow)]">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">{data.profile.nome || 'Minha Conta'}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{data.profile.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={accountMeta.className}>{accountMeta.label}</Badge>
                <Badge className={subscriptionMeta.className}>{subscriptionMeta.label}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Plano</p>
              <p className="mt-2 text-lg font-semibold">{data.subscription?.plano || 'Sem assinatura ativa'}</p>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Próxima cobrança</p>
              <p className="mt-2 text-lg font-semibold">{formatDate(data.subscription?.current_period_end || data.subscription?.data_expiracao)}</p>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Valor</p>
              <p className="mt-2 text-lg font-semibold">
                {formatCurrency(data.subscription?.valor, (data.subscription?.moeda || 'BRL').toUpperCase())}
              </p>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Último acesso</p>
              <p className="mt-2 text-lg font-semibold">{formatDateTime(data.auth.last_sign_in_at || data.profile.last_login_at || data.profile.ultimo_acesso)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[var(--card-shadow)]">
          <CardHeader>
            <CardTitle className="text-lg">Resumo de cobrança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {defaultPaymentMethod ? (
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Cartão principal
                </div>
                <p className="mt-2 text-base font-semibold capitalize">
                  {defaultPaymentMethod.brand || 'Cartão'} final {defaultPaymentMethod.last4 || '—'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Validade {String(defaultPaymentMethod.exp_month || '').padStart(2, '0')}/{defaultPaymentMethod.exp_year || '—'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum cartão principal cadastrado no momento.
              </div>
            )}

            {data.subscription?.status === 'trial' && (
              <div className="rounded-xl bg-amber-50 p-4 text-amber-900">
                <p className="text-sm font-semibold">Teste grátis ativo</p>
                <p className="text-sm">Restam {trialDays ?? 0} dia(s) até {formatDate(data.subscription?.trial_fim)}.</p>
              </div>
            )}

            {data.subscription?.cancel_at_period_end && (
              <div className="rounded-xl bg-red-50 p-4 text-red-900">
                <p className="text-sm font-semibold">Cancelamento agendado</p>
                <p className="text-sm">Sua assinatura será encerrada ao final do período atual.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Dados pessoais</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditing((current) => !current)}>
                <PencilLine className="mr-2 h-4 w-4" />
                {editing ? 'Cancelar' : 'Editar'}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.nome} disabled={!editing} onChange={(e) => setForm((c) => ({ ...c, nome: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={data.profile.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.telefone} disabled={!editing} onChange={(e) => setForm((c) => ({ ...c, telefone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input value={form.empresa} disabled={!editing} onChange={(e) => setForm((c) => ({ ...c, empresa: e.target.value }))} />
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Cadastro</p>
                <p className="mt-2 text-sm font-semibold">{formatDateTime(data.profile.created_at)}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tipo de conta</p>
                <p className="mt-2 text-sm font-semibold">{data.profile.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
              </div>

              {editing && (
                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={() => void handleSaveProfile()} disabled={saving === 'profile'}>
                    {saving === 'profile' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Salvar alterações
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Segurança</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    E-mail confirmado
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {data.auth.email_confirmed_at ? `Confirmado em ${formatDateTime(data.auth.email_confirmed_at)}` : 'Confirmação pendente.'}
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <User2 className="h-4 w-4 text-primary" />
                    Sessão atual
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Último acesso em {formatDateTime(data.auth.last_sign_in_at || data.profile.last_login_at || data.profile.ultimo_acesso)}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <Label>Nova senha</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
                    placeholder="Digite uma nova senha segura"
                  />
                </div>
                <Button onClick={() => void handleChangePassword()} disabled={saving === 'password'}>
                  {saving === 'password' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Alterar senha
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assinatura e pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano atual</p>
                  <p className="mt-2 text-base font-semibold">{data.subscription?.plano || 'Sem plano ativo'}</p>
                  <p className="text-sm text-muted-foreground">
                    {data.subscription?.frequencia ? `Cobrança ${data.subscription.frequencia}` : 'Sem recorrência configurada'}
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Próxima cobrança / expiração</p>
                  <p className="mt-2 text-base font-semibold">
                    {formatDate(data.subscription?.current_period_end || data.subscription?.data_expiracao)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {data.subscription?.cancel_at_period_end ? 'Cancelamento ao fim do período.' : 'Renovação automática ativa.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => void handlePortal()} disabled={saving === 'portal'}>
                  {saving === 'portal' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                  Atualizar forma de pagamento
                </Button>
                <Button variant="outline" onClick={() => void handlePortal()} disabled={saving === 'portal'}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Trocar plano
                </Button>
                {!data.subscription?.cancel_at_period_end ? (
                  <Button variant="destructive" onClick={() => void handleCancelSubscription()} disabled={saving === 'cancel'}>
                    {saving === 'cancel' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                    Cancelar assinatura
                  </Button>
                ) : (
                  <Button onClick={() => void handleResumeSubscription()} disabled={saving === 'resume'}>
                    {saving === 'resume' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Reativar assinatura
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Faturas e cobranças</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.invoices.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Ainda não existem faturas sincronizadas com a Stripe.
                </div>
              ) : (
                data.invoices.map((invoice) => {
                  const statusMeta = getStatusMeta(invoice.status);
                  return (
                    <div key={invoice.stripe_invoice_id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{formatDate(invoice.paid_at || invoice.created_at)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(invoice.amount_paid ?? invoice.amount_due)}
                          </p>
                        </div>
                        <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                      </div>
                      <div className="mt-3 flex gap-2">
                        {invoice.hosted_invoice_url && (
                          <Button size="sm" variant="outline" onClick={() => window.open(invoice.hosted_invoice_url!, '_blank', 'noopener,noreferrer')}>
                            Ver fatura
                          </Button>
                        )}
                        {invoice.invoice_pdf && (
                          <Button size="sm" variant="ghost" onClick={() => window.open(invoice.invoice_pdf!, '_blank', 'noopener,noreferrer')}>
                            Baixar comprovante
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico resumido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.logs.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhum evento administrativo registrado para sua conta.
                </div>
              ) : (
                data.logs.map((log) => (
                  <div key={log.id} className="rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {log.acao.includes('failed') ? (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      ) : log.acao.includes('cancel') ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {log.acao.split('_').join(' ')}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
