import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, CreditCard, XCircle } from 'lucide-react';

export function TrialBanner() {
  const { subscription } = useAuth();

  if (!subscription) return null;

  // No banner for admin_free or active users
  if (subscription.status === 'admin_free' || subscription.status === 'active') return null;

  // Trial banner
  if (subscription.status === 'trial') {
    const daysLeft = subscription.days_left ?? 0;
    const isUrgent = daysLeft <= 1;

    return (
      <div
        className={`px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium ${
          isUrgent
            ? 'bg-destructive/10 text-destructive border-b border-destructive/20'
            : 'bg-[hsl(45,100%,90%)] text-[hsl(35,80%,30%)] border-b border-[hsl(45,80%,80%)]'
        }`}
      >
        {isUrgent ? (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        ) : (
          <Clock className="w-4 h-4 shrink-0" />
        )}
        <span>
          {isUrgent
            ? 'Seu teste gratuito expira amanhã! '
            : `Você está no período de teste gratuito. Restam ${daysLeft} dia(s). `}
        </span>
        <Link
          to="/planos"
          className={`underline font-semibold ${
            isUrgent ? 'text-destructive' : 'text-[hsl(35,80%,25%)]'
          }`}
        >
          {isUrgent ? 'Assine agora para não perder acesso' : 'Escolher um plano'}
        </Link>
      </div>
    );
  }

  // Past due banner (within grace period)
  if (subscription.status === 'past_due' && subscription.subscribed) {
    return (
      <div className="px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium bg-[hsl(30,100%,92%)] text-[hsl(25,80%,30%)] border-b border-[hsl(30,80%,80%)]">
        <CreditCard className="w-4 h-4 shrink-0" />
        <span>⚠️ Tivemos um problema com seu pagamento. </span>
        <Link to="/planos" className="underline font-semibold text-[hsl(25,80%,25%)]">
          Atualize seus dados de pagamento
        </Link>
      </div>
    );
  }

  // Canceled banner (still in paid period)
  if (subscription.status === 'canceled' && subscription.subscribed) {
    const endDate = subscription.subscription_end
      ? new Date(subscription.subscription_end).toLocaleDateString('pt-BR')
      : '';
    return (
      <div className="px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium bg-muted text-muted-foreground border-b border-border">
        <XCircle className="w-4 h-4 shrink-0" />
        <span>Sua assinatura foi cancelada. Acesso disponível até {endDate}. </span>
        <Link to="/planos" className="underline font-semibold text-foreground">
          Reativar assinatura
        </Link>
      </div>
    );
  }

  // Expired banner (shown on /planos page since other routes redirect there)
  if (subscription.status === 'expired') {
    return (
      <div className="px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium bg-destructive/10 text-destructive border-b border-destructive/20">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>❌ Sua assinatura expirou. Escolha um plano para continuar usando o Grana.</span>
      </div>
    );
  }

  return null;
}
