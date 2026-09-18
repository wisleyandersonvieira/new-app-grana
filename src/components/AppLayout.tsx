import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import { TabsBar } from '@/components/TabsBar';
import { TrialBanner } from '@/components/TrialBanner';
import { useAuth } from '@/contexts/AuthContext';
import { useTabs } from '@/contexts/TabsContext';
import { getPageTitle } from '@/lib/page-titles';
import { Button } from '@/components/ui/button';

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, subscription, loading, completeOnboarding } = useAuth();
  const location = useLocation();
  const { enabled: tabsEnabled, activePathname } = useTabs();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [autoOnboardingHandledFor, setAutoOnboardingHandledFor] = useState<string | null>(null);
  // Com abas, o título do header mobile acompanha a aba ativa.
  const currentPathname = tabsEnabled ? activePathname : location.pathname;
  const pageTitle = useMemo(() => getPageTitle(currentPathname), [currentPathname]);

  // When expired and on /planos, render without sidebar (blocked layout)
  const isExpired = subscription?.status === 'expired';
  const isPlansRoute = location.pathname.startsWith('/planos');

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPathname]);

  useEffect(() => {
    document.body.classList.toggle('mobile-menu-open', mobileMenuOpen);
    return () => document.body.classList.remove('mobile-menu-open');
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (loading || !profile) return;
    if (autoOnboardingHandledFor === profile.user_id) return;

    setAutoOnboardingHandledFor(profile.user_id);
    if (profile.onboarding_completed === false) {
      setShowOnboarding(true);
    }
  }, [autoOnboardingHandledFor, loading, profile]);

  if (isExpired && isPlansRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen w-full bg-background md:flex">
      <AppSidebar mobileOpen={mobileMenuOpen} onMobileOpenChange={setMobileMenuOpen} />
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] transition-opacity md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="flex min-h-screen flex-1 flex-col md:ml-[260px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-background/92 px-4 backdrop-blur md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Abrir menu"
            className="h-11 w-11 rounded-2xl border border-slate-200 bg-white shadow-sm"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{pageTitle}</p>
            <p className="truncate text-[11px] font-medium text-muted-foreground">Grana</p>
          </div>
        </header>
        <TrialBanner />
        {tabsEnabled && <TabsBar />}
        <main className="relative min-h-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
      <OnboardingTutorial
        open={showOnboarding}
        onClose={async (completed) => {
          setShowOnboarding(false);
          if (completed) await completeOnboarding();
        }}
      />
    </div>
  );
}
