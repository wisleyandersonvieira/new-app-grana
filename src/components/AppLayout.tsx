import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { TrialBanner } from '@/components/TrialBanner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/despesas': 'Despesas',
  '/nova-despesa': 'Nova Despesa',
  '/receitas': 'Receitas',
  '/nova-receita': 'Nova Receita',
  '/contas': 'Contas',
  '/categorias': 'Categorias',
  '/subcategorias': 'Subcategorias',
  '/metas': 'Metas',
  '/cadastrar-metas': 'Cadastrar Metas',
  '/faturas': 'Faturas',
  '/nova-fatura': 'Nova Fatura',
  '/importar-fatura': 'Importar Fatura',
  '/transferencias': 'Transferências',
  '/nova-transferencia': 'Nova Transferência',
  '/bloqueios': 'Bloqueios',
  '/usuarios': 'Usuários',
  '/relatorios/contas': 'Relatório de Contas',
  '/relatorios/detalhado': 'Relatório Detalhado',
  '/relatorios/completo': 'Relatório Completo',
  '/relatorios/comparativo': 'Comparativo Mensal',
  '/relatorios/saldo': 'Saldo de Contas',
  '/relatorios/extratos': 'Extratos',
  '/planos': 'Planos',
  '/minha-assinatura': 'Assinatura',
  '/minha-conta': 'Minha Conta',
  '/admin/dashboard': 'Administração',
  '/admin/usuarios': 'Usuários',
  '/admin/assinaturas': 'Assinaturas',
  '/admin/logs': 'Logs',
};

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/editar-receita')) return 'Editar Receita';
  if (pathname.startsWith('/editar')) return 'Editar Despesa';
  if (pathname.startsWith('/fatura/')) return 'Detalhe da Fatura';
  return pageTitles[pathname] ?? 'Grana';
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { subscription } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pageTitle = useMemo(() => getPageTitle(location.pathname), [location.pathname]);

  // When expired and on /planos, render without sidebar (blocked layout)
  const isExpired = subscription?.status === 'expired';
  const isPlansRoute = location.pathname.startsWith('/planos');

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('mobile-menu-open', mobileMenuOpen);
    return () => document.body.classList.remove('mobile-menu-open');
  }, [mobileMenuOpen]);

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
        <main className="mobile-content flex-1 overflow-auto px-4 py-5 sm:px-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
