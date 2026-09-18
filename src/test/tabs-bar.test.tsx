import { act, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false, subscription: { status: 'active' } }),
}));

const { TabsProvider, useTabs } = await import('@/contexts/TabsContext');
const { TabsBar } = await import('@/components/TabsBar');

function Driver() {
  const { openTab, tabs } = useTabs();
  return (
    <div>
      <span data-testid="tab-count">{tabs.length}</span>
      <button type="button" onClick={() => openTab('/nova-despesa')}>abrir nova despesa</button>
      <button type="button" onClick={() => openTab('/despesas')}>abrir despesas</button>
    </div>
  );
}

function renderBar() {
  return render(
    <BrowserRouter>
      <TabsProvider>
        <Driver />
        <TabsBar />
      </TabsProvider>
    </BrowserRouter>,
  );
}

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
  });
};

describe('TabsBar', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/dashboard');
  });

  it('mostra uma aba por rota aberta, com o título da página', async () => {
    renderBar();
    expect(screen.getByRole('tab', { name: /Dashboard/ })).toBeInTheDocument();

    await click(screen.getByText('abrir despesas'));

    expect(screen.getByRole('tab', { name: /Despesas/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Despesas/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Dashboard/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('fecha direto uma aba de listagem', async () => {
    renderBar();
    await click(screen.getByText('abrir despesas'));

    await click(screen.getByLabelText('Fechar aba Despesas'));

    expect(screen.getByTestId('tab-count')).toHaveTextContent('1');
    expect(screen.queryByRole('tab', { name: /Despesas/ })).not.toBeInTheDocument();
  });

  it('pede confirmação antes de fechar uma aba de formulário', async () => {
    renderBar();
    await click(screen.getByText('abrir nova despesa'));

    await click(screen.getByLabelText('Fechar aba Nova Despesa'));

    // A aba continua aberta enquanto a confirmação não é respondida.
    expect(screen.getByText('As informações não salvas serão perdidas.')).toBeInTheDocument();
    expect(screen.getByTestId('tab-count')).toHaveTextContent('2');

    await click(screen.getByRole('button', { name: 'Manter aberta' }));
    expect(screen.getByTestId('tab-count')).toHaveTextContent('2');

    await click(screen.getByLabelText('Fechar aba Nova Despesa'));
    await click(screen.getByRole('button', { name: 'Fechar aba' }));

    expect(screen.getByTestId('tab-count')).toHaveTextContent('1');
    expect(screen.queryByRole('tab', { name: /Nova Despesa/ })).not.toBeInTheDocument();
  });

});
