import { act, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { BrowserRouter, useLocation, useNavigate, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// O AppLayout/AuthContext reais puxam o cliente Supabase; aqui só precisamos do usuário.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false, subscription: { status: 'active' } }),
}));

// Páginas de verdade não são necessárias: o que importa é o comportamento por aba.
vi.mock('@/routes/appRoutes', () => {
  const Page = ({ name }: { name: string }) => {
    const navigate = useNavigate();
    const location = useLocation();
    return (
      <div data-testid={`page-${name}`}>
        <span data-testid={`path-${name}`}>{location.pathname}</span>
        <StateKeeper name={name} />
        <button type="button" onClick={() => navigate('/editar/9')}>ir para editar ({name})</button>
        <button type="button" onClick={() => navigate(-1)}>voltar ({name})</button>
      </div>
    );
  };

  const routes = [
    { path: '/dashboard', element: <Page name="dashboard" /> },
    { path: '/despesas', element: <Page name="despesas" /> },
    { path: '/editar/:id', element: <Page name="editar" /> },
  ];

  return {
    appRoutes: routes,
    AppRoutes: ({ location }: { location?: Parameters<typeof useRoutes>[1] }) => useRoutes(routes, location),
  };
});

/** Conta quantas vezes montou: se a aba escondida desmontasse, o contador subiria. */
const mountCounts: Record<string, number> = {};
function StateKeeper({ name }: { name: string }) {
  useEffect(() => {
    mountCounts[name] = (mountCounts[name] ?? 0) + 1;
  }, [name]);
  return <span data-testid={`mounts-${name}`}>{mountCounts[name] ?? 0}</span>;
}

const { TabsProvider, useTabs } = await import('@/contexts/TabsContext');
const { TabsHost } = await import('@/components/TabsHost');

function TabsDriver() {
  const { tabs, activeTabId, openTab, activateTab, closeTab } = useTabs();
  return (
    <div>
      <span data-testid="active-tab">{activeTabId}</span>
      <button type="button" onClick={() => openTab('/despesas')}>abrir despesas</button>
      {tabs.map((tab) => (
        <div key={tab.id}>
          <button type="button" onClick={() => activateTab(tab.id)}>ativar {tab.id}</button>
          <button type="button" onClick={() => closeTab(tab.id)}>fechar {tab.id}</button>
        </div>
      ))}
    </div>
  );
}

function renderApp() {
  return render(
    <BrowserRouter>
      <TabsProvider>
        <TabsDriver />
        <TabsHost />
      </TabsProvider>
    </BrowserRouter>,
  );
}

const click = async (label: string) => {
  await act(async () => {
    screen.getByText(label).click();
  });
};

const panelOf = (name: string) => screen.getByTestId(`page-${name}`).closest('[data-tab-id]') as HTMLElement;

describe('TabsHost', () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.keys(mountCounts).forEach((key) => delete mountCounts[key]);
    window.history.replaceState({}, '', '/dashboard');
  });

  it('mantém a aba inativa montada e escondida', async () => {
    renderApp();
    expect(screen.getByTestId('page-dashboard')).toBeInTheDocument();

    await click('abrir despesas');

    // As duas abas seguem montadas; só a inativa fica escondida.
    expect(screen.getByTestId('page-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('page-despesas')).toBeInTheDocument();
    expect(panelOf('dashboard')).toHaveAttribute('hidden');
    expect(panelOf('dashboard').style.display).toBe('none');
    expect(panelOf('despesas')).not.toHaveAttribute('hidden');

    // Voltar para a primeira aba não remonta a página (o estado do formulário sobrevive).
    await click('ativar tab-1');
    expect(screen.getByTestId('mounts-dashboard')).toHaveTextContent('1');
    expect(screen.getByTestId('mounts-despesas')).toHaveTextContent('1');
  });

  it('navega apenas dentro da aba que chamou navigate', async () => {
    renderApp();
    await click('abrir despesas');

    await click('ir para editar (despesas)');

    expect(within(panelOf('editar')).getByTestId('path-editar')).toHaveTextContent('/editar/9');
    expect(screen.getByTestId('path-dashboard')).toHaveTextContent('/dashboard');
    expect(screen.queryByTestId('page-despesas')).not.toBeInTheDocument();
  });

  it('navigate(-1) volta no histórico da própria aba', async () => {
    renderApp();
    await click('abrir despesas');
    await click('ir para editar (despesas)');

    await click('voltar (editar)');

    expect(screen.getByTestId('path-despesas')).toHaveTextContent('/despesas');
    expect(screen.getByTestId('path-dashboard')).toHaveTextContent('/dashboard');
  });

  it('a URL do navegador acompanha a aba ativa', async () => {
    renderApp();
    await click('abrir despesas');
    expect(window.location.pathname).toBe('/despesas');

    await click('ativar tab-1');
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('persiste as rotas das abas no sessionStorage e restaura na montagem', async () => {
    const first = renderApp();
    await click('abrir despesas');

    expect(JSON.parse(sessionStorage.getItem('grana:tabs:user-1')!)).toEqual({
      paths: ['/dashboard', '/despesas'],
      activeIndex: 1,
    });

    first.unmount();
    renderApp();

    expect(screen.getByTestId('page-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('page-despesas')).toBeInTheDocument();
  });

  it('fechar a aba ativa ativa a vizinha', async () => {
    renderApp();
    await click('abrir despesas');

    await click('fechar tab-2');

    expect(screen.queryByTestId('page-despesas')).not.toBeInTheDocument();
    expect(panelOf('dashboard')).not.toHaveAttribute('hidden');
    expect(window.location.pathname).toBe('/dashboard');
  });
});
