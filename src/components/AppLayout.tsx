import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { TrialBanner } from '@/components/TrialBanner';
import { useAuth } from '@/contexts/AuthContext';

export function AppLayout({ children }: { children: ReactNode }) {
  const { subscription } = useAuth();
  const location = useLocation();

  // When expired and on /planos, render without sidebar (blocked layout)
  const isExpired = subscription?.status === 'expired';
  const isPlansRoute = location.pathname.startsWith('/planos');

  if (isExpired && isPlansRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col ml-[260px]">
        <TrialBanner />
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
