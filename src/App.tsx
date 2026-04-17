import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";
import Cadastro from "./pages/Cadastro";
import Dashboard from "./pages/Dashboard";
import Despesas from "./pages/Despesas";
import NovaDespesaPage from "./pages/NovaDespesa";
import EditarDespesa from "./pages/EditarDespesa";
import Receitas from "./pages/Receitas";
import NovaReceitaPage from "./pages/NovaReceita";
import EditarReceita from "./pages/EditarReceita";
import Contas from "./pages/Contas";
import Categorias from "./pages/Categorias";
import Subcategorias from "./pages/Subcategorias";
import Metas from "./pages/Metas";
import CadastrarMetas from "./pages/CadastrarMetas";
import Faturas from "./pages/Faturas";
import NovaFatura from "./pages/NovaFatura";
import FaturaDetalhe from "./pages/FaturaDetalhe";
import ImportarFatura from "./pages/ImportarFatura";
import Transferencias from "./pages/Transferencias";
import NovaTransferencia from "./pages/NovaTransferencia";
import Bloqueios from "./pages/Bloqueios";
import UsuariosPage from "./pages/Usuarios";
import RelatorioPorCategoria from "./pages/RelatorioPorCategoria";
import RelatorioDetalhado from "./pages/RelatorioDetalhado";
import RelatorioCompleto from "./pages/RelatorioCompleto";
import RelatorioContas from "./pages/RelatorioContas";
import ComparativoMensal from "./pages/ComparativoMensal";
import SaldoDeContas from "./pages/SaldoDeContas";
import Extratos from "./pages/Extratos";
import Planos from "./pages/Planos";
import PlanosSucesso from "./pages/PlanosSucesso";
import MinhaAssinatura from "./pages/MinhaAssinatura";
import MinhaConta from "./pages/MinhaConta";
import AdminConsole from "./pages/AdminConsole";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/despesas" element={<Despesas />} />
                      <Route path="/nova-despesa" element={<NovaDespesaPage />} />
                      <Route path="/editar/:id" element={<EditarDespesa />} />
                      <Route path="/receitas" element={<Receitas />} />
                      <Route path="/nova-receita" element={<NovaReceitaPage />} />
                      <Route path="/editar-receita/:id" element={<EditarReceita />} />
                      <Route path="/contas" element={<Contas />} />
                      <Route path="/categorias" element={<Categorias />} />
                      <Route path="/subcategorias" element={<Subcategorias />} />
                      <Route path="/metas" element={<Metas />} />
                      <Route path="/cadastrar-metas" element={<CadastrarMetas />} />
                      <Route path="/metas/acompanhar" element={<Metas />} />
                      <Route path="/faturas" element={<Faturas />} />
                      <Route path="/nova-fatura" element={<NovaFatura />} />
                      <Route path="/importar-fatura" element={<ImportarFatura />} />
                      <Route path="/fatura/:id" element={<FaturaDetalhe />} />
                      <Route path="/transferencias" element={<Transferencias />} />
                      <Route path="/nova-transferencia" element={<NovaTransferencia />} />
                      <Route path="/bloqueios" element={<Bloqueios />} />
                      <Route path="/usuarios" element={<UsuariosPage />} />
                      <Route path="/relatorios/categoria" element={<RelatorioPorCategoria />} />
                      <Route path="/relatorios/detalhado" element={<RelatorioDetalhado />} />
                      <Route path="/relatorios/completo" element={<RelatorioCompleto />} />
                      <Route path="/relatorios/contas" element={<RelatorioContas />} />
                      <Route path="/relatorios/comparativo" element={<ComparativoMensal />} />
                      <Route path="/relatorios/saldo" element={<SaldoDeContas />} />
                      <Route path="/relatorios/extratos" element={<Extratos />} />
                      <Route path="/planos" element={<Planos />} />
                      <Route path="/planos/sucesso" element={<PlanosSucesso />} />
                      <Route path="/minha-assinatura" element={<MinhaAssinatura />} />
                      <Route path="/minha-conta" element={<MinhaConta />} />
                      <Route path="/admin/dashboard" element={<AdminRoute><AdminConsole /></AdminRoute>} />
                      <Route path="/admin/usuarios" element={<AdminRoute><AdminConsole /></AdminRoute>} />
                      <Route path="/admin/assinaturas" element={<AdminRoute><AdminConsole /></AdminRoute>} />
                      <Route path="/admin/logs" element={<AdminRoute><AdminConsole /></AdminRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
