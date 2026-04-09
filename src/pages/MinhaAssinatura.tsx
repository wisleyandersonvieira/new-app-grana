import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Crown, Clock, AlertTriangle, XCircle, CreditCard,
  Calendar, Loader2, ExternalLink, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  trial: { label: 'Período de Teste', color: 'bg-[hsl(45,100%,90%)] text-[hsl(35,80%,30%)]', icon: Clock },
  active: { label: 'Ativa', color: 'bg-green-100 text-green-800', icon: Crown },
  past_due: { label: 'Pagamento Pendente', color: 'bg-[hsl(30,100%,92%)] text-[hsl(25,80%,30%)]', icon: AlertTriangle },
  canceled: { label: 'Cancelada', color: 'bg-muted text-muted-foreground', icon: XCircle },
  expired: { label: 'Expirada', color: 'bg-destructive/10 text-destructive', icon: XCircle },
  admin_free: { label: 'Acesso Administrativo', color: 'bg-primary/10 text-primary', icon: Crown },
};

const PLAN_LABELS: Record<string, string> = {
  mensal: 'Mensal — R$ 29,00/mês',
  anual: 'Anual — R$ 290,00/ano',
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

export default function MinhaAssinatura() {
  const { subscription, profile, refreshSubscription } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  const status = subscription?.status ?? 'expired';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.expired;
  const StatusIcon = config.icon;

  const handleCancel = async () => {
    setLoading('cancel');
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Assinatura cancelada. Acesso disponível até ${formatDate(data.access_until)}.`);
      await refreshSubscription();
    } catch (err: any) {
      toast.error('Erro ao cancelar: ' + (err.message || 'Tente novamente'));
    } finally {
      setLoading(null);
    }
  };

  const handleCustomerPortal = async () => {
    setLoading('portal');
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (err: any) {
      toast.error('Erro ao abrir portal: ' + (err.message || 'Tente novamente'));
    } finally {
      setLoading(null);
    }
  };

  const handleRefresh = async () => {
    setLoading('refresh');
    await refreshSubscription();
    setLoading(null);
    toast.success('Status atualizado');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Minha Assinatura</h1>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading === 'refresh'}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading === 'refresh' ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Status Card */}
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Status da Assinatura</CardTitle>
            <Badge className={`${config.color} gap-1.5`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {config.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Trial info */}
          {status === 'trial' && subscription?.days_left !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(45,100%,95%)]">
              <Clock className="w-5 h-5 text-[hsl(35,80%,40%)]" />
              <div>
                <p className="text-sm font-medium text-[hsl(35,80%,25%)]">
                  Restam {subscription.days_left} dia(s) de teste
                </p>
                <p className="text-xs text-[hsl(35,80%,40%)]">
                  Expira em {formatDate(subscription.trial_end)}
                </p>
              </div>
            </div>
          )}

          {/* Plan & Billing details */}
          {(status === 'active' || status === 'canceled' || status === 'past_due') && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Plano</p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {PLAN_LABELS[subscription?.plano ?? ''] || subscription?.plano || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    {status === 'canceled' ? 'Acesso até' : 'Próxima cobrança'}
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {formatDate(subscription?.subscription_end)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Membro desde</p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {profile?.created_at ? formatDate(profile.created_at) : '—'}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Message */}
          {subscription?.message && (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground italic">{subscription.message}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Trial actions */}
          {status === 'trial' && (
            <Button className="w-full" onClick={() => navigate('/planos')}>
              <Crown className="w-4 h-4 mr-2" />
              Escolher um plano
            </Button>
          )}

          {/* Active actions */}
          {status === 'active' && (
            <>
              <Button variant="outline" className="w-full" onClick={handleCustomerPortal} disabled={!!loading}>
                {loading === 'portal' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Alterar plano (mensal ↔ anual)
              </Button>
              <Button variant="outline" className="w-full" onClick={handleCustomerPortal} disabled={!!loading}>
                {loading === 'portal' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                Atualizar cartão
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10">
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancelar assinatura
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza? Você perderá acesso ao Grana após{' '}
                      <strong>{formatDate(subscription?.subscription_end)}</strong> (fim do período atual).
                      Essa ação pode ser revertida antes dessa data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Manter assinatura</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancel}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={loading === 'cancel'}
                    >
                      {loading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Confirmar cancelamento
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {/* Past Due actions */}
          {status === 'past_due' && (
            <Button className="w-full" onClick={handleCustomerPortal} disabled={!!loading}>
              {loading === 'portal' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
              Atualizar forma de pagamento
            </Button>
          )}

          {/* Canceled actions */}
          {status === 'canceled' && (
            <Button className="w-full" onClick={() => navigate('/planos')}>
              <Crown className="w-4 h-4 mr-2" />
              Reativar assinatura
            </Button>
          )}

          {/* Expired actions */}
          {status === 'expired' && (
            <Button className="w-full" onClick={() => navigate('/planos')}>
              <Crown className="w-4 h-4 mr-2" />
              Assinar novamente
            </Button>
          )}

          {/* Admin free */}
          {status === 'admin_free' && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Acesso liberado pelo administrador. Nenhuma ação necessária.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
