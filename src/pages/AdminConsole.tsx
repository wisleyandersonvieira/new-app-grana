import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUpDown, Ban, CheckCircle2, Loader2, RefreshCcw, Search, ShieldCheck, ShieldOff, UserCog, UserRoundCheck, UserRoundX } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate, formatDateTime, getAccountStatusMeta, getStatusMeta } from '@/lib/account';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

type DashboardMetrics = {
  totalUsers: number;
  activeUsers: number;
  trialUsers: number;
  subscribedUsers: number;
  expiredUsers: number;
  canceledUsers: number;
  monthlyRecurringRevenue: number;
  newUsersLast30Days: number;
};

type AdminUser = {
  user_id: string;
  nome: string | null;
  email: string;
  telefone?: string | null;
  empresa?: string | null;
  role?: string | null;
  is_admin: boolean | null;
  status: string | null;
  access_blocked?: boolean | null;
  created_at: string | null;
  last_login_at?: string | null;
  ultimo_acesso?: string | null;
  assinatura?: {
    plano?: string | null;
    status?: string | null;
    current_period_end?: string | null;
    data_expiracao?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    valor?: number | null;
    frequencia?: string | null;
    trial_fim?: string | null;
    cancel_at_period_end?: boolean | null;
    payment_brand?: string | null;
    payment_last4?: string | null;
    payment_exp_month?: number | null;
    payment_exp_year?: number | null;
  } | null;
};

type UserDetail = {
  profile: AdminUser & { internal_notes?: string | null };
  auth: {
    id: string;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
  };
  subscription: AdminUser['assinatura'];
  cachedSubscription?: {
    plan_name?: string | null;
    status?: string | null;
  } | null;
  invoices: Array<{
    stripe_invoice_id: string;
    status: string | null;
    amount_paid: number | null;
    amount_due: number | null;
    hosted_invoice_url: string | null;
    invoice_pdf: string | null;
    created_at: string | null;
    paid_at: string | null;
  }>;
  paymentMethods: Array<{
    stripe_payment_method_id: string;
    brand: string | null;
    last4: string | null;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean | null;
  }>;
  logs: Array<{
    id: string;
    acao: string;
    created_at: string | null;
    detalhes: Record<string, unknown>;
  }>;
};

const metricCards = [
  { key: 'totalUsers', label: 'Usuários cadastrados' },
  { key: 'activeUsers', label: 'Usuários ativos' },
  { key: 'trialUsers', label: 'Em teste grátis' },
  { key: 'subscribedUsers', label: 'Assinaturas ativas' },
  { key: 'expiredUsers', label: 'Assinaturas vencidas' },
  { key: 'canceledUsers', label: 'Cancelados' },
  { key: 'monthlyRecurringRevenue', label: 'Receita recorrente mensal estimada', currency: true },
  { key: 'newUsersLast30Days', label: 'Novos usuários em 30 dias' },
] as const;

const sectionTitles: Record<string, { title: string; description: string }> = {
  '/admin/dashboard': { title: 'Dashboard Admin', description: 'Visão consolidada da base de usuários, assinatura e receita.' },
  '/admin/usuarios': { title: 'Usuários', description: 'Filtre, audite e administre contas com segurança.' },
  '/admin/assinaturas': { title: 'Assinaturas', description: 'Acompanhe status, trial, vencimentos e pagamento.' },
  '/admin/logs': { title: 'Logs administrativos', description: 'Linha do tempo com ações internas e eventos sincronizados.' },
};

export default function AdminConsole() {
  const location = useLocation();
  const section = sectionTitles[location.pathname] || sectionTitles['/admin/dashboard'];

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    plano: 'todos',
    assinatura: 'todos',
    periodo: 'todos',
    trial: 'todos',
  });
  const [sortBy, setSortBy] = useState<'nome' | 'created_at' | 'status' | 'last_login_at'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const invokeManageUsers = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-users', { body });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Falha na operação administrativa.');
    return data;
  };

  const load = async () => {
    setLoading(true);
    try {
      const [dashboard, list] = await Promise.all([
        invokeManageUsers({ action: 'dashboard' }) as Promise<DashboardMetrics>,
        invokeManageUsers({ action: 'list' }) as Promise<AdminUser[]>,
      ]);
      setMetrics(dashboard);
      setUsers(list);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openUserDetail = async (userId: string, forceSync = false) => {
    setDetailLoading(true);
    setOpen(true);
    try {
      const detail = await invokeManageUsers({ action: 'detail', user_id: userId, force_sync: forceSync }) as UserDetail;
      setSelectedUser(detail);
      setNotes(detail.profile.internal_notes || '');
    } catch (error: any) {
      toast.error(error.message);
      setOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const result = users.filter((user) => {
      const searchMatch = !search || [user.nome, user.email].some((value) => value?.toLowerCase().includes(search));
      const planMatch = filters.plano === 'todos' || (user.assinatura?.plano || 'sem-plano') === filters.plano;
      const subscriptionMatch = filters.assinatura === 'todos' || (user.assinatura?.status || 'sem') === filters.assinatura;
      const trialMatch = filters.trial === 'todos' || (filters.trial === 'sim' ? user.assinatura?.status === 'trial' : user.assinatura?.status !== 'trial');
      const periodMatch = filters.periodo === 'todos'
        || (filters.periodo === '30' && user.created_at && new Date(user.created_at).getTime() >= thirtyDaysAgo)
        || (filters.periodo === '90' && user.created_at && new Date(user.created_at).getTime() >= now - (90 * 24 * 60 * 60 * 1000));

      return searchMatch && planMatch && subscriptionMatch && trialMatch && periodMatch;
    });

    const sorted = [...result].sort((left, right) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      const leftValue = sortBy === 'nome'
        ? left.nome || ''
        : sortBy === 'status'
          ? left.assinatura?.status || left.status || ''
          : sortBy === 'last_login_at'
            ? left.last_login_at || left.ultimo_acesso || ''
            : left.created_at || '';
      const rightValue = sortBy === 'nome'
        ? right.nome || ''
        : sortBy === 'status'
          ? right.assinatura?.status || right.status || ''
          : sortBy === 'last_login_at'
            ? right.last_login_at || right.ultimo_acesso || ''
            : right.created_at || '';

      return String(leftValue).localeCompare(String(rightValue)) * direction;
    });

    if (location.pathname === '/admin/assinaturas') {
      return sorted.filter((user) => user.assinatura);
    }

    return sorted;
  }, [filters, location.pathname, sortBy, sortDirection, users]);

  const adminLogs = useMemo(
    () => filteredUsers.flatMap((user) =>
      user.assinatura
        ? [{
            id: `${user.user_id}-${user.assinatura.stripe_subscription_id || 'sub'}`,
            usuario: user.nome || user.email,
            email: user.email,
            acao: user.assinatura.status || 'sem status',
            created_at: user.assinatura.current_period_end || user.assinatura.data_expiracao || user.created_at,
          }]
        : []),
    [filteredUsers]
  );

  const runAction = async (action: 'update' | 'sync_stripe', payload: Record<string, unknown>, successMessage: string) => {
    setSavingAction(action);
    try {
      await invokeManageUsers(payload);
      toast.success(successMessage);
      await Promise.all([load(), selectedUser ? openUserDetail(selectedUser.profile.user_id) : Promise.resolve()]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{section.title}</h1>
          <p>{section.description}</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Atualizar dados
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <Card key={card.key} className="stat-card border-none">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="mt-3 text-3xl font-bold tracking-tight">
              {'currency' in card && card.currency
                  ? formatCurrency(metrics?.[card.key] as number | null)
                  : metrics?.[card.key]?.toLocaleString('pt-BR') || '0'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {location.pathname !== '/admin/logs' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filtro inteligente</CardTitle>
          </CardHeader>
          <CardContent className="filter-bar">
            <div className="min-w-[220px] flex-1 space-y-2">
              <Label>Buscar por nome ou e-mail</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={filters.search}
                  onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                  placeholder="Digite nome ou e-mail"
                />
              </div>
            </div>
            <div className="min-w-[160px] space-y-2">
              <Label>Plano</Label>
              <Select value={filters.plano} onValueChange={(value) => setFilters((current) => ({ ...current, plano: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Plano Mensal">Mensal</SelectItem>
                  <SelectItem value="Plano Anual">Anual</SelectItem>
                  <SelectItem value="sem-plano">Sem plano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px] space-y-2">
              <Label>Status da assinatura</Label>
              <Select value={filters.assinatura} onValueChange={(value) => setFilters((current) => ({ ...current, assinatura: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="trial">Teste</SelectItem>
                  <SelectItem value="past_due">Past due</SelectItem>
                  <SelectItem value="canceled">Cancelada</SelectItem>
                  <SelectItem value="expired">Expirada</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="sem">Sem assinatura</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px] space-y-2">
              <Label>Cadastro</Label>
              <Select value={filters.periodo} onValueChange={(value) => setFilters((current) => ({ ...current, periodo: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px] space-y-2">
              <Label>Em teste</Label>
              <Select value={filters.trial} onValueChange={(value) => setFilters((current) => ({ ...current, trial: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="sim">Somente trial</SelectItem>
                  <SelectItem value="nao">Excluir trial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {location.pathname === '/admin/logs' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Eventos e auditoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedUser?.logs?.length ? selectedUser.logs.map((log) => (
              <div key={log.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{log.acao.split('_').join(' ')}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200">Detalhe aberto</Badge>
                </div>
              </div>
            )) : (
              adminLogs.map((log) => (
                <div key={log.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{log.usuario}</p>
                      <p className="text-xs text-muted-foreground">{log.email}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusMeta(log.acao).className}>{getStatusMeta(log.acao).label}</Badge>
                      <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              {location.pathname === '/admin/assinaturas' ? 'Base de assinaturas' : 'Base de usuários'}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={(value: 'nome' | 'created_at' | 'status' | 'last_login_at') => setSortBy(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Cadastro</SelectItem>
                  <SelectItem value="nome">Nome</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="last_login_at">Último acesso</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}>
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="table-zebra w-full text-sm">
                <thead>
                  <tr className="bg-[hsl(var(--table-header))] text-[hsl(var(--table-header-fg))]">
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">E-mail</th>
                    <th className="px-4 py-3 text-left">Status conta</th>
                    <th className="px-4 py-3 text-left">Cadastro</th>
                    <th className="px-4 py-3 text-left">Plano</th>
                    <th className="px-4 py-3 text-left">Assinatura</th>
                    <th className="px-4 py-3 text-left">Vencimento / renovação</th>
                    <th className="px-4 py-3 text-left">Stripe customer</th>
                    <th className="px-4 py-3 text-left">Último acesso</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const accountMeta = getAccountStatusMeta(user.status, user.access_blocked);
                    const subscriptionMeta = getStatusMeta(user.assinatura?.status);
                    return (
                      <tr key={user.user_id} className="border-b">
                        <td className="px-4 py-3 font-medium">{user.nome || 'Sem nome'}</td>
                        <td className="px-4 py-3">{user.email}</td>
                        <td className="px-4 py-3">
                          <Badge className={accountMeta.className}>{accountMeta.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(user.created_at)}</td>
                        <td className="px-4 py-3">{user.assinatura?.plano || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge className={subscriptionMeta.className}>{subscriptionMeta.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(user.assinatura?.current_period_end || user.assinatura?.data_expiracao)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{user.assinatura?.stripe_customer_id || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(user.last_login_at || user.ultimo_acesso)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => void openUserDetail(user.user_id)}>
                            Ver detalhes
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Detalhes do usuário</DialogTitle>
          </DialogHeader>

          {detailLoading || !selectedUser ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Dados do usuário</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div><p className="text-xs text-muted-foreground">Nome</p><p className="font-medium">{selectedUser.profile.nome || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">E-mail</p><p className="font-medium">{selectedUser.profile.email}</p></div>
                    <div><p className="text-xs text-muted-foreground">Telefone</p><p className="font-medium">{selectedUser.profile.telefone || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Empresa</p><p className="font-medium">{selectedUser.profile.empresa || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Cadastro</p><p className="font-medium">{formatDateTime(selectedUser.profile.created_at)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Último login</p><p className="font-medium">{formatDateTime(selectedUser.auth.last_sign_in_at || selectedUser.profile.last_login_at || selectedUser.profile.ultimo_acesso)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Status da conta</p><Badge className={getAccountStatusMeta(selectedUser.profile.status, selectedUser.profile.access_blocked).className}>{getAccountStatusMeta(selectedUser.profile.status, selectedUser.profile.access_blocked).label}</Badge></div>
                    <div><p className="text-xs text-muted-foreground">Tipo de usuário</p><p className="font-medium">{selectedUser.profile.is_admin ? 'Administrador' : 'Usuário'}</p></div>
                    <div><p className="text-xs text-muted-foreground">ID interno</p><p className="font-mono text-xs">{selectedUser.auth.id}</p></div>
                    <div><p className="text-xs text-muted-foreground">Stripe customer</p><p className="font-mono text-xs">{selectedUser.subscription?.stripe_customer_id || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Stripe subscription</p><p className="font-mono text-xs">{selectedUser.subscription?.stripe_subscription_id || '—'}</p></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Dados da assinatura</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div><p className="text-xs text-muted-foreground">Plano contratado</p><p className="font-medium">{selectedUser.subscription?.plano || selectedUser.cachedSubscription?.plan_name || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Status</p><Badge className={getStatusMeta(selectedUser.subscription?.status).className}>{getStatusMeta(selectedUser.subscription?.status).label}</Badge></div>
                    <div><p className="text-xs text-muted-foreground">Início</p><p className="font-medium">{formatDate(selectedUser.subscription?.current_period_end)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Próxima renovação</p><p className="font-medium">{formatDate(selectedUser.subscription?.current_period_end || selectedUser.subscription?.data_expiracao)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Frequência</p><p className="font-medium">{selectedUser.subscription?.frequencia || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Valor</p><p className="font-medium">{formatCurrency(selectedUser.subscription?.valor)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Em teste</p><p className="font-medium">{selectedUser.subscription?.status === 'trial' ? `Sim, até ${formatDate(selectedUser.subscription?.trial_fim)}` : 'Não'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Cancelamento agendado</p><p className="font-medium">{selectedUser.subscription?.cancel_at_period_end ? 'Sim' : 'Não'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Cartão principal</p><p className="font-medium capitalize">{selectedUser.paymentMethods[0]?.brand || selectedUser.subscription?.payment_brand || 'Não cadastrado'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Final do cartão</p><p className="font-medium">{selectedUser.paymentMethods[0]?.last4 || selectedUser.subscription?.payment_last4 || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Validade</p><p className="font-medium">{selectedUser.paymentMethods[0] ? `${String(selectedUser.paymentMethods[0].exp_month || '').padStart(2, '0')}/${selectedUser.paymentMethods[0].exp_year || '—'}` : '—'}</p></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Histórico e auditoria</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUser.logs.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhum log administrativo registrado.</div>
                    ) : (
                      selectedUser.logs.map((log) => (
                        <div key={log.id} className="rounded-xl border p-4">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold">{log.acao.split('_').join(' ')}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Ações administrativas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button className="w-full justify-start" variant="outline" onClick={() => void runAction('update', {
                      action: 'update',
                      user_id: selectedUser.profile.user_id,
                      status: 'active',
                      access_blocked: false,
                    }, 'Usuário ativado e liberado.')}>
                      <UserRoundCheck className="mr-2 h-4 w-4" />
                      Ativar usuário
                    </Button>
                    <Button className="w-full justify-start" variant="outline" onClick={() => void runAction('update', {
                      action: 'update',
                      user_id: selectedUser.profile.user_id,
                      status: 'inactive',
                      access_blocked: true,
                    }, 'Usuário desativado.')}>
                      <UserRoundX className="mr-2 h-4 w-4" />
                      Desativar usuário
                    </Button>
                    <Button className="w-full justify-start" variant="outline" onClick={() => void runAction('update', {
                      action: 'update',
                      user_id: selectedUser.profile.user_id,
                      is_admin: true,
                    }, 'Permissão de admin concedida.')}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Marcar como admin
                    </Button>
                    <Button className="w-full justify-start" variant="outline" onClick={() => void runAction('update', {
                      action: 'update',
                      user_id: selectedUser.profile.user_id,
                      is_admin: false,
                      role: 'user',
                    }, 'Permissão de admin removida.')}>
                      <ShieldOff className="mr-2 h-4 w-4" />
                      Remover admin
                    </Button>
                    <Button className="w-full justify-start" variant="outline" onClick={() => void runAction('update', {
                      action: 'update',
                      user_id: selectedUser.profile.user_id,
                      access_blocked: false,
                      status: 'active',
                    }, 'Acesso liberado manualmente.')}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Liberar acesso manualmente
                    </Button>
                    <Button className="w-full justify-start" variant="outline" onClick={() => void runAction('update', {
                      action: 'update',
                      user_id: selectedUser.profile.user_id,
                      access_blocked: true,
                    }, 'Acesso bloqueado manualmente.')}>
                      <Ban className="mr-2 h-4 w-4" />
                      Bloquear acesso manualmente
                    </Button>
                    <Button className="w-full justify-start" onClick={() => void runAction('sync_stripe', {
                      action: 'sync_stripe',
                      user_id: selectedUser.profile.user_id,
                    }, 'Dados sincronizados com a Stripe.')}>
                      {savingAction === 'sync_stripe' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                      Sincronizar com Stripe
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Observações internas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      rows={5}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notas internas visíveis apenas para administradores"
                    />
                    <Button className="w-full" onClick={() => void runAction('update', {
                      action: 'update',
                      user_id: selectedUser.profile.user_id,
                      internal_notes: notes,
                    }, 'Observações salvas.')}>
                      <UserCog className="mr-2 h-4 w-4" />
                      Salvar observações
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Faturas recentes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUser.invoices.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Sem invoices sincronizadas.</div>
                    ) : (
                      selectedUser.invoices.map((invoice) => (
                        <div key={invoice.stripe_invoice_id} className="rounded-xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{formatDate(invoice.paid_at || invoice.created_at)}</p>
                              <p className="text-xs text-muted-foreground">{formatCurrency(invoice.amount_paid ?? invoice.amount_due)}</p>
                            </div>
                            <Badge className={getStatusMeta(invoice.status).className}>{getStatusMeta(invoice.status).label}</Badge>
                          </div>
                          <div className="mt-3 flex gap-2">
                            {invoice.hosted_invoice_url && (
                              <Button size="sm" variant="outline" onClick={() => window.open(invoice.hosted_invoice_url!, '_blank', 'noopener,noreferrer')}>
                                Ver
                              </Button>
                            )}
                            {invoice.invoice_pdf && (
                              <Button size="sm" variant="ghost" onClick={() => window.open(invoice.invoice_pdf!, '_blank', 'noopener,noreferrer')}>
                                Baixar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
