import { useState } from 'react';
import {
  LayoutDashboard, TrendingDown, TrendingUp, Wallet, Tags, Target,
  CreditCard, ArrowLeftRight, LogOut, DollarSign, ChevronRight,
  PlusCircle, List, BarChart3, FileText, ClipboardList, Users,
  CalendarOff, Layers, Settings, Receipt,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SubItem { title: string; url: string; icon: React.ElementType; }
interface MenuItem { title: string; icon: React.ElementType; url?: string; children?: SubItem[]; }

const menuItems: MenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard' },
  {
    title: 'Lançamentos', icon: Receipt,
    children: [
      { title: 'Nova Despesa', url: '/nova-despesa', icon: PlusCircle },
      { title: 'Nova Receita', url: '/nova-receita', icon: PlusCircle },
      { title: 'Despesas', url: '/despesas', icon: TrendingDown },
      { title: 'Receitas', url: '/receitas', icon: TrendingUp },
    ],
  },
  {
    title: 'Cartão de Crédito', icon: CreditCard,
    children: [
      { title: 'Nova Fatura', url: '/nova-fatura', icon: PlusCircle },
      { title: 'Faturas', url: '/faturas', icon: List },
    ],
  },
  {
    title: 'Transferências', icon: ArrowLeftRight,
    children: [
      { title: 'Nova Transferência', url: '/nova-transferencia', icon: PlusCircle },
      { title: 'Transferências', url: '/transferencias', icon: List },
    ],
  },
  {
    title: 'Relatórios', icon: BarChart3,
    children: [
      { title: 'Por Categoria', url: '/relatorios/categoria', icon: FileText },
      { title: 'Detalhado', url: '/relatorios/detalhado', icon: FileText },
      { title: 'Completo', url: '/relatorios/completo', icon: FileText },
      { title: 'Comparativo Mensal', url: '/relatorios/comparativo', icon: BarChart3 },
      { title: 'Saldo de Contas', url: '/relatorios/saldo', icon: Wallet },
      { title: 'Extratos', url: '/relatorios/extratos', icon: ClipboardList },
    ],
  },
  {
    title: 'Metas', icon: Target,
    children: [
      { title: 'Cadastrar Metas', url: '/cadastrar-metas', icon: PlusCircle },
      { title: 'Acompanhar Metas', url: '/metas', icon: Target },
    ],
  },
  {
    title: 'Cadastros', icon: Layers,
    children: [
      { title: 'Categorias', url: '/categorias', icon: Tags },
      { title: 'Subcategorias', url: '/subcategorias', icon: Tags },
      { title: 'Contas', url: '/contas', icon: Wallet },
    ],
  },
  {
    title: 'Configurações', icon: Settings,
    children: [
      { title: 'Minha Assinatura', url: '/minha-assinatura', icon: CreditCard },
      { title: 'Bloqueio de Datas', url: '/bloqueios', icon: CalendarOff },
      { title: 'Usuários', url: '/usuarios', icon: Users },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    menuItems.forEach((item) => {
      if (item.children?.some((child) => location.pathname === child.url)) {
        initial[item.title] = true;
      }
    });
    return initial;
  });

  const toggleMenu = (title: string) => {
    setOpenMenus((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const isChildActive = (children?: SubItem[]) =>
    children?.some((child) => location.pathname === child.url) ?? false;

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo area */}
      <div className="flex items-center gap-3 px-6 py-7">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-accent shadow-lg shadow-sidebar-primary/30">
          <DollarSign className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="text-lg font-bold text-sidebar-foreground tracking-tight">
            Grana
          </span>
          <p className="text-[11px] text-sidebar-foreground/40 font-medium -mt-0.5">
            Gestão Financeira
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-sidebar-border/60" />

      {/* Menu */}
      <ScrollArea className="flex-1 px-3 pt-4">
        <nav className="flex flex-col gap-0.5">
          {menuItems.map((item) => {
            if (item.url) {
              const active = location.pathname === item.url;
              return (
                <NavLink
                  key={item.title}
                  to={item.url}
                  end
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                    active
                      ? 'bg-sidebar-primary text-white shadow-md shadow-sidebar-primary/20'
                      : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                  activeClassName=""
                >
                  <item.icon className={cn(
                    'h-[17px] w-[17px] shrink-0 transition-colors',
                    active ? 'text-white' : 'text-sidebar-foreground/45 group-hover:text-sidebar-foreground/70'
                  )} />
                  <span>{item.title}</span>
                </NavLink>
              );
            }

            const isOpen = openMenus[item.title] ?? false;
            const hasActiveChild = isChildActive(item.children);

            return (
              <div key={item.title}>
                <button
                  onClick={() => toggleMenu(item.title)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                    hasActiveChild
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )}
                >
                  <item.icon className={cn(
                    'h-[17px] w-[17px] shrink-0 transition-colors',
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
                  <div className="ml-[22px] mt-0.5 flex flex-col gap-px border-l border-sidebar-border/50 pl-3 py-0.5">
                    {item.children!.map((child) => {
                      const childActive = location.pathname === child.url;
                      return (
                        <NavLink
                          key={child.url}
                          to={child.url}
                          className={cn(
                            'group/child flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[12.5px] transition-all duration-150',
                            childActive
                              ? 'bg-sidebar-primary/15 text-sidebar-primary font-semibold'
                              : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/50',
                          )}
                          activeClassName=""
                        >
                          <child.icon className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            childActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/35'
                          )} />
                          <span>{child.title}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="mx-5 h-px bg-sidebar-border/60" />
      <div className="px-4 py-4">
        {profile && (
          <div className="mb-3 flex items-center gap-3 px-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sidebar-primary to-accent text-[13px] font-bold text-white uppercase shadow-sm">
              {profile.nome?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-sidebar-foreground">
                {profile.nome}
              </p>
              <p className="text-[11px] text-sidebar-foreground/40 font-medium">
                {profile.is_admin ? 'Administrador' : 'Usuário'}
              </p>
            </div>
          </div>
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
