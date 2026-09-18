import { useState, type MouseEvent } from 'react';
import {
  LayoutDashboard, TrendingDown, TrendingUp, Wallet, Tags, Target,
  CreditCard, ArrowLeftRight, LogOut, DollarSign, ChevronRight,
  PlusCircle, List, BarChart3, FileText, ClipboardList, Users,
  CalendarOff, Layers, Settings, Receipt, Shield, ScrollText, UserCog,
  Sparkles, UserCircle2, X, HelpCircle, ExternalLink,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { useOptionalTabs } from '@/contexts/TabsContext';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SubItem { title: string; url: string; icon: React.ElementType; }
interface MenuItem { title: string; icon: React.ElementType; url?: string; children?: SubItem[]; adminOnly?: boolean; tourKey?: string; }

const menuItems: MenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard', tourKey: 'dashboard' },
  {
    title: 'Lançamentos', icon: Receipt, tourKey: 'lancamentos',
    children: [
      { title: 'Nova Despesa', url: '/nova-despesa', icon: PlusCircle },
      { title: 'Nova Receita', url: '/nova-receita', icon: PlusCircle },
      { title: 'Despesas', url: '/despesas', icon: TrendingDown },
      { title: 'Receitas', url: '/receitas', icon: TrendingUp },
    ],
  },
  {
    title: 'Cartão de Crédito', icon: CreditCard, tourKey: 'cartao-credito',
    children: [
      { title: 'Nova Fatura', url: '/nova-fatura', icon: PlusCircle },
      { title: 'Importar Fatura', url: '/importar-fatura', icon: Sparkles },
      { title: 'Faturas', url: '/faturas', icon: List },
    ],
  },
  {
    title: 'Transferências', icon: ArrowLeftRight, tourKey: 'transferencias',
    children: [
      { title: 'Nova Transferência', url: '/nova-transferencia', icon: PlusCircle },
      { title: 'Transferências', url: '/transferencias', icon: List },
    ],
  },
  {
    title: 'Relatórios', icon: BarChart3, tourKey: 'relatorios',
    children: [
      { title: 'Relatório de Contas', url: '/relatorios/contas', icon: FileText },
      { title: 'Detalhado', url: '/relatorios/detalhado', icon: FileText },
      { title: 'Completo', url: '/relatorios/completo', icon: FileText },
      { title: 'Comparativo Mensal', url: '/relatorios/comparativo', icon: BarChart3 },
      { title: 'Saldo de Contas', url: '/relatorios/saldo', icon: Wallet },
      { title: 'Extratos', url: '/relatorios/extratos', icon: ClipboardList },
    ],
  },
  {
    title: 'Metas', icon: Target, tourKey: 'metas',
    children: [
      { title: 'Cadastrar Metas', url: '/cadastrar-metas', icon: PlusCircle },
      { title: 'Acompanhar Metas', url: '/metas', icon: Target },
    ],
  },
  {
    title: 'Cadastros', icon: Layers, tourKey: 'cadastros',
    children: [
      { title: 'Categorias', url: '/categorias', icon: Tags },
      { title: 'Subcategorias', url: '/subcategorias', icon: Tags },
      { title: 'Contas', url: '/contas', icon: Wallet },
    ],
  },
  {
    title: 'Configurações', icon: Settings, tourKey: 'configuracoes',
    children: [
      { title: 'Minha Assinatura', url: '/minha-assinatura', icon: CreditCard },
      { title: 'Minha Conta', url: '/minha-conta', icon: UserCircle2 },
      { title: 'Bloqueio de Datas', url: '/bloqueios', icon: CalendarOff },
      { title: 'Ajuda', url: '/ajuda', icon: HelpCircle },
    ],
  },
  {
    title: 'Administração', icon: Shield, adminOnly: true,
    children: [
      { title: 'Dashboard Admin', url: '/admin/dashboard', icon: Sparkles },
      { title: 'Usuários', url: '/admin/usuarios', icon: Users },
      { title: 'Assinaturas', url: '/admin/assinaturas', icon: UserCog },
      { title: 'Logs', url: '/admin/logs', icon: ScrollText },
    ],
  },
];

type AppSidebarProps = {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
};

export function AppSidebar({ mobileOpen = false, onMobileOpenChange }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = useOptionalTabs();
  const { profile, signOut, subscription } = useAuth();

  // O menu fica fora dos painéis das abas: navegar por ele muda a aba ativa,
  // e Ctrl/Cmd + clique (ou botão do meio) abre uma aba interna nova.
  const tabsEnabled = Boolean(tabs?.enabled);
  const currentPathname = tabsEnabled ? tabs!.activePathname : location.pathname;

  const goTo = (url: string) => {
    if (tabsEnabled) tabs!.navigateActiveTab(url);
    else navigate(url);
  };

  const openInNewTab = (url: string) => {
    if (tabsEnabled) tabs!.openTab(url);
    else navigate(url);
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>, url: string) => {
    // Nunca abrimos aba do navegador: a sessão vive em sessionStorage e exigiria novo login.
    event.preventDefault();
    if (event.metaKey || event.ctrlKey || event.shiftKey) openInNewTab(url);
    else goTo(url);
  };

  const handleLinkAuxClick = (event: MouseEvent<HTMLAnchorElement>, url: string) => {
    if (event.button !== 1) return;
    event.preventDefault();
    openInNewTab(url);
  };
  const isSubscriptionBlocked = Boolean(subscription?.is_subscription_blocked);
  const allowedBlockedUrls = new Set(['/minha-assinatura', '/minha-conta', '/ajuda']);
  const visibleItems = menuItems
    .filter((item) => !item.adminOnly || profile?.is_admin)
    .map((item) => {
      if (!isSubscriptionBlocked) return item;
      if (item.title !== 'Configurações') return null;
      return {
        ...item,
        children: item.children?.filter((child) => allowedBlockedUrls.has(child.url)),
      };
    })
    .filter((item): item is MenuItem => Boolean(item));

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    visibleItems.forEach((item) => {
      if (item.children?.some((child) => currentPathname === child.url)) {
        initial[item.title] = true;
      }
    });
    return initial;
  });

  const toggleMenu = (title: string) => {
    setOpenMenus((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const isChildActive = (children?: SubItem[]) =>
    children?.some((child) => currentPathname === child.url) ?? false;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-[100svh] w-[min(86vw,320px)] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl shadow-slate-950/30 transition-transform duration-300 ease-out md:h-screen md:w-[260px] md:translate-x-0 md:shadow-none',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex items-center gap-3 px-5 py-5 md:px-6 md:py-7">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-accent shadow-lg shadow-sidebar-primary/30">
          <DollarSign className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-lg font-bold text-sidebar-foreground tracking-tight">Grana</span>
          <p className="text-[11px] text-sidebar-foreground/40 font-medium -mt-0.5">Gestão Financeira</p>
        </div>
        <button
          type="button"
          aria-label="Fechar menu"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          onClick={() => onMobileOpenChange?.(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-5 h-px bg-sidebar-border/60" />

      <ScrollArea className="flex-1 px-3 pt-4">
        <nav className="flex flex-col gap-0.5">
          {visibleItems.map((item) => {
            if (item.url) {
              const active = currentPathname === item.url;
              const url = item.url;
              return (
                <a
                  key={item.title}
                  href={url}
                  onClick={(event) => handleLinkClick(event, url)}
                  onAuxClick={(event) => handleLinkAuxClick(event, url)}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-150 md:rounded-lg md:px-3 md:py-2.5 md:text-[13px]',
                    active
                      ? 'bg-sidebar-primary text-white shadow-md shadow-sidebar-primary/20'
                      : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                  data-tour={item.tourKey}
                >
                  <item.icon className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors md:h-[17px] md:w-[17px]',
                    active ? 'text-white' : 'text-sidebar-foreground/45 group-hover:text-sidebar-foreground/70'
                  )} />
                  <span>{item.title}</span>
                </a>
              );
            }

            const isOpen = openMenus[item.title] ?? false;
            const hasActiveChild = isChildActive(item.children);

            return (
              <div key={item.title}>
                <button
                  onClick={() => toggleMenu(item.title)}
                  data-tour={item.tourKey}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-150 md:rounded-lg md:px-3 md:py-2.5 md:text-[13px]',
                    hasActiveChild
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )}
                >
                  <item.icon className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors md:h-[17px] md:w-[17px]',
                    hasActiveChild ? 'text-sidebar-primary' : 'text-sidebar-foreground/45 group-hover:text-sidebar-foreground/70'
                  )} />
                  <span className="flex-1 text-left">{item.title}</span>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-sidebar-foreground/30',
                      isOpen && 'rotate-90',
                    )}
                  />
                </button>

                <div
                  className={cn(
                    'overflow-hidden transition-all duration-200 ease-out',
                    isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
                  )}
                >
                  <div className="ml-[23px] mt-1 flex flex-col gap-1 border-l border-sidebar-border/50 py-1 pl-3 md:mt-0.5 md:gap-px md:py-0.5">
                    {item.children!.map((child) => {
                      const childActive = currentPathname === child.url;
                      return (
                        <div key={child.url} className="group/child relative flex items-center">
                          <a
                            href={child.url}
                            onClick={(event) => handleLinkClick(event, child.url)}
                            onAuxClick={(event) => handleLinkAuxClick(event, child.url)}
                            className={cn(
                              'flex flex-1 items-center gap-2.5 rounded-md px-2.5 py-[7px] pr-8 text-[12.5px] transition-all duration-150',
                              'md:text-[12.5px]',
                              childActive
                                ? 'bg-sidebar-primary/15 text-sidebar-primary font-semibold'
                                : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/50',
                            )}
                          >
                            <child.icon className={cn(
                              'h-4 w-4 shrink-0 md:h-3.5 md:w-3.5',
                              childActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/35'
                            )} />
                            <span>{child.title}</span>
                          </a>
                          {tabsEnabled && (
                            <button
                              type="button"
                              aria-label={`Abrir ${child.title} em nova aba`}
                              title="Abrir em nova aba"
                              onClick={() => openInNewTab(child.url)}
                              className="absolute right-1 flex h-6 w-6 items-center justify-center rounded-md text-sidebar-foreground/40 opacity-0 transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/child:opacity-100"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="mx-5 h-px bg-sidebar-border/60" />
      <div className="px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {profile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-sidebar-border/60 bg-sidebar-accent/60 px-3 py-3.5 text-left transition hover:bg-sidebar-accent md:rounded-xl md:py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sidebar-primary to-accent text-[13px] font-bold text-white uppercase shadow-sm">
                  {profile.nome?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-sidebar-foreground">
                    {profile.nome || 'Usuário'}
                  </p>
                  <p className="truncate text-[11px] text-sidebar-foreground/45 font-medium">
                    {profile.is_admin ? 'Administrador' : 'Minha conta'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-sidebar-foreground/35" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
              <DropdownMenuItem onClick={() => goTo('/minha-conta')}>
                <UserCircle2 className="mr-2 h-4 w-4" />
                Minha Conta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => goTo('/minha-assinatura')}>
                <CreditCard className="mr-2 h-4 w-4" />
                Assinatura
              </DropdownMenuItem>
              {profile.is_admin && (
                <DropdownMenuItem onClick={() => goTo('/admin/dashboard')}>
                  <Shield className="mr-2 h-4 w-4" />
                  Administração
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150 text-sidebar-foreground/50 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-[17px] w-[17px] shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
