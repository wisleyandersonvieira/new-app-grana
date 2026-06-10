import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';

const allowedRoutesWhenBlocked = ['/configuracoes', '/minha-assinatura', '/ajuda', '/minha-conta'];

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, subscription } = useAuth();
  const location = useLocation();
  const toastShownRef = useRef<string | null>(null);

  // Show contextual toasts for subscription issues
  useEffect(() => {
    if (!subscription) return;
    const key = `${subscription.status}-${subscription.message || ''}`;
    if (toastShownRef.current === key) return;

    if (subscription.is_subscription_blocked && subscription.message) {
      toast.warning(subscription.message, { duration: 8000 });
      toastShownRef.current = key;
    } else if (subscription.status === 'past_due' && subscription.message) {
      toast.warning(subscription.message, { duration: 8000 });
      toastShownRef.current = key;
    } else if (subscription.status === 'canceled' && subscription.message) {
      toast.info(subscription.message, { duration: 8000 });
      toastShownRef.current = key;
    }
  }, [subscription]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Routes exempt from subscription verification
  const exemptRoutes = ['/planos', '/planos/sucesso', '/minha-assinatura', '/minha-conta', '/ajuda', '/configuracoes', '/admin/dashboard', '/admin/usuarios', '/admin/assinaturas', '/admin/logs'];
  const isExempt = exemptRoutes.some(r => location.pathname === r || location.pathname.startsWith('/planos'));

  if (subscription?.is_subscription_blocked) {
    const canChoosePlan = subscription.subscription_block_reason === 'missing_subscription' && location.pathname.startsWith('/planos');
    const isAllowedWhileBlocked = allowedRoutesWhenBlocked.some((route) => (
      location.pathname === route || location.pathname.startsWith(`${route}/`)
    ));

    if (!isAllowedWhileBlocked && !canChoosePlan) {
      return <Navigate to="/minha-assinatura" replace state={{ from: location }} />;
    }
  }

  if (subscription && !isExempt) {
    if (subscription.status === 'admin_free') return <>{children}</>;
    if (subscription.status === 'trial') return <>{children}</>;
    if (subscription.status === 'active') return <>{children}</>;
    if (subscription.status === 'canceled' && subscription.subscribed) return <>{children}</>;

    // Expired or past_due without grace → redirect to plans
    return <Navigate to="/planos" replace />;
  }

  return <>{children}</>;
}
