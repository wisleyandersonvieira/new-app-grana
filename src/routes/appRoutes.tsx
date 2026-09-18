import { Navigate, useRoutes, type Location, type RouteObject } from 'react-router-dom';

import { AdminRoute } from '@/components/AdminRoute';
import AdminConsole from '@/pages/AdminConsole';
import Ajuda from '@/pages/Ajuda';
import Bloqueios from '@/pages/Bloqueios';
import CadastrarMetas from '@/pages/CadastrarMetas';
import Categorias from '@/pages/Categorias';
import ComparativoMensal from '@/pages/ComparativoMensal';
import Contas from '@/pages/Contas';
import Dashboard from '@/pages/Dashboard';
import Despesas from '@/pages/Despesas';
import DiagnosticoImportacaoFatura from '@/pages/DiagnosticoImportacaoFatura';
import EditarDespesa from '@/pages/EditarDespesa';
import EditarReceita from '@/pages/EditarReceita';
import Extratos from '@/pages/Extratos';
import FaturaDetalhe from '@/pages/FaturaDetalhe';
import Faturas from '@/pages/Faturas';
import ImportarFatura from '@/pages/ImportarFatura';
import Metas from '@/pages/Metas';
import MinhaAssinatura from '@/pages/MinhaAssinatura';
import MinhaConta from '@/pages/MinhaConta';
import NotFound from '@/pages/NotFound';
import NovaDespesaPage from '@/pages/NovaDespesa';
import NovaFatura from '@/pages/NovaFatura';
import NovaReceitaPage from '@/pages/NovaReceita';
import NovaTransferencia from '@/pages/NovaTransferencia';
import Planos from '@/pages/Planos';
import PlanosSucesso from '@/pages/PlanosSucesso';
import Receitas from '@/pages/Receitas';
import RelatorioCompleto from '@/pages/RelatorioCompleto';
import RelatorioContas from '@/pages/RelatorioContas';
import RelatorioDetalhado from '@/pages/RelatorioDetalhado';
import SaldoDeContas from '@/pages/SaldoDeContas';
import Subcategorias from '@/pages/Subcategorias';
import Transferencias from '@/pages/Transferencias';
import UsuariosPage from '@/pages/Usuarios';

/**
 * Rotas protegidas do app. A mesma tabela é usada pela navegação normal e por
 * cada aba interna, que a renderiza com a sua própria location.
 */
export const appRoutes: RouteObject[] = [
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/despesas', element: <Despesas /> },
  { path: '/nova-despesa', element: <NovaDespesaPage /> },
  { path: '/editar/:id', element: <EditarDespesa /> },
  { path: '/receitas', element: <Receitas /> },
  { path: '/nova-receita', element: <NovaReceitaPage /> },
  { path: '/editar-receita/:id', element: <EditarReceita /> },
  { path: '/contas', element: <Contas /> },
  { path: '/categorias', element: <Categorias /> },
  { path: '/subcategorias', element: <Subcategorias /> },
  { path: '/metas', element: <Metas /> },
  { path: '/cadastrar-metas', element: <CadastrarMetas /> },
  { path: '/metas/acompanhar', element: <Metas /> },
  { path: '/faturas', element: <Faturas /> },
  { path: '/nova-fatura', element: <NovaFatura /> },
  { path: '/importar-fatura', element: <ImportarFatura /> },
  { path: '/importar-fatura/diagnostico', element: <DiagnosticoImportacaoFatura /> },
  { path: '/fatura/:id', element: <FaturaDetalhe /> },
  { path: '/transferencias', element: <Transferencias /> },
  { path: '/nova-transferencia', element: <NovaTransferencia /> },
  { path: '/bloqueios', element: <Bloqueios /> },
  { path: '/usuarios', element: <UsuariosPage /> },
  { path: '/relatorios/detalhado', element: <RelatorioDetalhado /> },
  { path: '/relatorios/completo', element: <RelatorioCompleto /> },
  { path: '/relatorios/contas', element: <RelatorioContas /> },
  { path: '/relatorios/comparativo', element: <ComparativoMensal /> },
  { path: '/relatorios/saldo', element: <SaldoDeContas /> },
  { path: '/relatorios/extratos', element: <Extratos /> },
  { path: '/planos', element: <Planos /> },
  { path: '/planos/sucesso', element: <PlanosSucesso /> },
  { path: '/configuracoes', element: <Navigate to="/minha-conta" replace /> },
  { path: '/minha-assinatura', element: <MinhaAssinatura /> },
  { path: '/minha-conta', element: <MinhaConta /> },
  { path: '/ajuda', element: <Ajuda /> },
  { path: '/admin/dashboard', element: <AdminRoute><AdminConsole /></AdminRoute> },
  { path: '/admin/usuarios', element: <AdminRoute><AdminConsole /></AdminRoute> },
  { path: '/admin/assinaturas', element: <AdminRoute><AdminConsole /></AdminRoute> },
  { path: '/admin/logs', element: <AdminRoute><AdminConsole /></AdminRoute> },
  { path: '*', element: <NotFound /> },
];

/**
 * Renderiza a tabela de rotas. Sem `location`, segue a location do router
 * (navegação sem abas); com `location`, a aba passa a ter a sua própria.
 */
export function AppRoutes({ location }: { location?: Partial<Location> }) {
  return useRoutes(appRoutes, location);
}
