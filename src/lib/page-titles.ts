import {
  ArrowLeftRight, BarChart3, CalendarOff, ClipboardList, CreditCard, FileText, HelpCircle,
  LayoutDashboard, List, Pencil, PlusCircle, Receipt, ScrollText, Shield, Sparkles, Tags,
  Target, TrendingDown, TrendingUp, UserCircle2, UserCog, Users, Wallet,
} from 'lucide-react';

type RouteMeta = { title: string; icon: React.ElementType };

/** Título e ícone por rota. Os ícones acompanham os usados no AppSidebar. */
export const routeMeta: Record<string, RouteMeta> = {
  '/dashboard': { title: 'Dashboard', icon: LayoutDashboard },
  '/despesas': { title: 'Despesas', icon: TrendingDown },
  '/nova-despesa': { title: 'Nova Despesa', icon: PlusCircle },
  '/receitas': { title: 'Receitas', icon: TrendingUp },
  '/nova-receita': { title: 'Nova Receita', icon: PlusCircle },
  '/contas': { title: 'Contas', icon: Wallet },
  '/categorias': { title: 'Categorias', icon: Tags },
  '/subcategorias': { title: 'Subcategorias', icon: Tags },
  '/metas': { title: 'Metas', icon: Target },
  '/metas/acompanhar': { title: 'Acompanhar Metas', icon: Target },
  '/cadastrar-metas': { title: 'Cadastrar Metas', icon: PlusCircle },
  '/faturas': { title: 'Faturas', icon: List },
  '/nova-fatura': { title: 'Nova Fatura', icon: PlusCircle },
  '/importar-fatura': { title: 'Importar Fatura', icon: Sparkles },
  '/importar-fatura/diagnostico': { title: 'Diagnóstico da Importação', icon: Sparkles },
  '/transferencias': { title: 'Transferências', icon: ArrowLeftRight },
  '/nova-transferencia': { title: 'Nova Transferência', icon: PlusCircle },
  '/bloqueios': { title: 'Bloqueios', icon: CalendarOff },
  '/usuarios': { title: 'Usuários', icon: Users },
  '/relatorios/contas': { title: 'Relatório de Contas', icon: FileText },
  '/relatorios/detalhado': { title: 'Relatório Detalhado', icon: FileText },
  '/relatorios/completo': { title: 'Relatório Completo', icon: FileText },
  '/relatorios/comparativo': { title: 'Comparativo Mensal', icon: BarChart3 },
  '/relatorios/saldo': { title: 'Saldo de Contas', icon: Wallet },
  '/relatorios/extratos': { title: 'Extratos', icon: ClipboardList },
  '/planos': { title: 'Planos', icon: CreditCard },
  '/planos/sucesso': { title: 'Pagamento Confirmado', icon: CreditCard },
  '/minha-assinatura': { title: 'Assinatura', icon: CreditCard },
  '/minha-conta': { title: 'Minha Conta', icon: UserCircle2 },
  '/ajuda': { title: 'Central de Ajuda', icon: HelpCircle },
  '/admin/dashboard': { title: 'Administração', icon: Shield },
  '/admin/usuarios': { title: 'Usuários', icon: Users },
  '/admin/assinaturas': { title: 'Assinaturas', icon: UserCog },
  '/admin/logs': { title: 'Logs', icon: ScrollText },
};

/** Mantido para compatibilidade com quem só precisa do título. */
export const pageTitles: Record<string, string> = Object.fromEntries(
  Object.entries(routeMeta).map(([path, meta]) => [path, meta.title]),
);

const dynamicRouteMeta: Array<{ matches: (pathname: string) => boolean; meta: RouteMeta }> = [
  { matches: (p) => p.startsWith('/editar-receita'), meta: { title: 'Editar Receita', icon: Pencil } },
  { matches: (p) => p.startsWith('/editar'), meta: { title: 'Editar Despesa', icon: Pencil } },
  { matches: (p) => p.startsWith('/fatura/'), meta: { title: 'Detalhe da Fatura', icon: Receipt } },
];

export function getRouteMeta(pathname: string): RouteMeta {
  const exact = routeMeta[pathname];
  if (exact) return exact;

  const dynamic = dynamicRouteMeta.find((entry) => entry.matches(pathname));
  if (dynamic) return dynamic.meta;

  return { title: 'Grana', icon: FileText };
}

export function getPageTitle(pathname: string) {
  return getRouteMeta(pathname).title;
}

export function getPageIcon(pathname: string) {
  return getRouteMeta(pathname).icon;
}
