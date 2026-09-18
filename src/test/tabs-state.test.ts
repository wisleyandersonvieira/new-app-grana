import { describe, expect, it } from 'vitest';
import {
  MAX_TABS,
  canOpenTab,
  createInitialTabsState,
  getActiveTab,
  isUnsavedFormPath,
  locationToPath,
  tabsReducer,
  type TabsAction,
  type TabsState,
} from '@/lib/tabs-state';

function run(state: TabsState, ...actions: TabsAction[]) {
  return actions.reduce(tabsReducer, state);
}

const activePath = (state: TabsState) => locationToPath(getActiveTab(state)!.location);
const paths = (state: TabsState) => state.tabs.map((tab) => locationToPath(tab.location));

describe('tabs-state', () => {
  it('começa com uma aba única na rota informada', () => {
    const state = createInitialTabsState('/despesas');
    expect(state.tabs).toHaveLength(1);
    expect(activePath(state)).toBe('/despesas');
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });

  it('abre novas abas no fim da lista e já ativa a nova', () => {
    const state = run(createInitialTabsState(), { type: 'open', path: '/nova-despesa' }, { type: 'open', path: '/nova-receita' });

    expect(paths(state)).toEqual(['/dashboard', '/nova-despesa', '/nova-receita']);
    expect(activePath(state)).toBe('/nova-receita');
  });

  it('preserva search e hash na location da aba', () => {
    const state = run(createInitialTabsState(), { type: 'open', path: '/planos/sucesso?session_id=abc#topo' });
    const tab = getActiveTab(state)!;

    expect(tab.location.pathname).toBe('/planos/sucesso');
    expect(tab.location.search).toBe('?session_id=abc');
    expect(tab.location.hash).toBe('#topo');
    expect(locationToPath(tab.location)).toBe('/planos/sucesso?session_id=abc#topo');
  });

  it('gera ids e keys distintos para cada aba', () => {
    const state = run(createInitialTabsState(), { type: 'open', path: '/despesas' }, { type: 'open', path: '/despesas' });
    const ids = state.tabs.map((tab) => tab.id);
    const keys = state.tabs.map((tab) => tab.location.key);

    expect(new Set(ids).size).toBe(3);
    expect(new Set(keys).size).toBe(3);
  });

  it('respeita o limite de abas', () => {
    let state = createInitialTabsState();
    for (let index = 1; index < MAX_TABS; index++) {
      state = tabsReducer(state, { type: 'open', path: `/despesas?p=${index}` });
    }

    expect(state.tabs).toHaveLength(MAX_TABS);
    expect(canOpenTab(state)).toBe(false);

    const overflow = tabsReducer(state, { type: 'open', path: '/receitas' });
    expect(overflow).toBe(state);
    expect(overflow.tabs).toHaveLength(MAX_TABS);
  });

  it('ativa a aba pedida', () => {
    const state = run(createInitialTabsState(), { type: 'open', path: '/despesas' }, { type: 'open', path: '/receitas' });
    const activated = tabsReducer(state, { type: 'activate', id: state.tabs[0].id });

    expect(activePath(activated)).toBe('/dashboard');
    expect(tabsReducer(activated, { type: 'activate', id: 'inexistente' })).toBe(activated);
  });

  it('ao fechar a aba ativa, ativa a vizinha da direita', () => {
    const state = run(
      createInitialTabsState(),
      { type: 'open', path: '/despesas' },
      { type: 'open', path: '/receitas' },
      { type: 'activate', id: 'tab-2' },
    );

    const closed = tabsReducer(state, { type: 'close', id: 'tab-2' });

    expect(paths(closed)).toEqual(['/dashboard', '/receitas']);
    expect(activePath(closed)).toBe('/receitas');
  });

  it('ao fechar a última aba da lista, ativa a anterior', () => {
    const state = run(createInitialTabsState(), { type: 'open', path: '/despesas' }, { type: 'open', path: '/receitas' });
    const closed = tabsReducer(state, { type: 'close', id: 'tab-3' });

    expect(paths(closed)).toEqual(['/dashboard', '/despesas']);
    expect(activePath(closed)).toBe('/despesas');
  });

  it('fechar uma aba inativa não muda a aba ativa', () => {
    const state = run(createInitialTabsState(), { type: 'open', path: '/despesas' }, { type: 'open', path: '/receitas' });
    const closed = tabsReducer(state, { type: 'close', id: 'tab-2' });

    expect(paths(closed)).toEqual(['/dashboard', '/receitas']);
    expect(activePath(closed)).toBe('/receitas');
  });

  it('fechar a única aba abre uma nova no Dashboard', () => {
    const state = createInitialTabsState('/nova-despesa');
    const closed = tabsReducer(state, { type: 'close', id: state.tabs[0].id });

    expect(closed.tabs).toHaveLength(1);
    expect(activePath(closed)).toBe('/dashboard');
    expect(closed.tabs[0].id).not.toBe(state.tabs[0].id);
  });

  it('fecha as outras abas mantendo a escolhida', () => {
    const state = run(createInitialTabsState(), { type: 'open', path: '/despesas' }, { type: 'open', path: '/receitas' });
    const closed = tabsReducer(state, { type: 'closeOthers', id: 'tab-2' });

    expect(paths(closed)).toEqual(['/despesas']);
    expect(activePath(closed)).toBe('/despesas');
  });

  it('duplica a aba logo depois da original, sem herdar o histórico', () => {
    const state = run(
      createInitialTabsState(),
      { type: 'open', path: '/despesas' },
      { type: 'navigate', id: 'tab-2', path: '/editar/1' },
      { type: 'open', path: '/receitas' },
    );

    const duplicated = tabsReducer(state, { type: 'duplicate', id: 'tab-2' });

    expect(paths(duplicated)).toEqual(['/dashboard', '/editar/1', '/editar/1', '/receitas']);
    expect(activePath(duplicated)).toBe('/editar/1');

    const copy = duplicated.tabs[2];
    expect(copy.history).toHaveLength(1);
    expect(copy.id).not.toBe('tab-2');
    expect(copy.location.key).not.toBe(state.tabs[1].location.key);
  });

  it('navega só na aba indicada, empilhando histórico', () => {
    const state = run(
      createInitialTabsState(),
      { type: 'open', path: '/despesas' },
      { type: 'navigate', id: 'tab-2', path: '/editar/7' },
    );

    expect(paths(state)).toEqual(['/dashboard', '/editar/7']);

    const tab = state.tabs[1];
    expect(tab.history.map(locationToPath)).toEqual(['/despesas', '/editar/7']);
    expect(tab.index).toBe(1);
    expect(state.tabs[0].history).toHaveLength(1);
  });

  it('navegar com replace troca a entrada atual do histórico', () => {
    const state = run(
      createInitialTabsState('/despesas'),
      { type: 'navigate', id: 'tab-1', path: '/editar/7' },
      { type: 'navigate', id: 'tab-1', path: '/receitas', replace: true },
    );

    const tab = state.tabs[0];
    expect(tab.history.map(locationToPath)).toEqual(['/despesas', '/receitas']);
    expect(tab.index).toBe(1);
  });

  it('não empilha a mesma rota duas vezes seguidas', () => {
    const state = run(
      createInitialTabsState('/despesas'),
      { type: 'navigate', id: 'tab-1', path: '/despesas' },
    );

    expect(state.tabs[0].history).toHaveLength(1);
  });

  it('volta e avança no histórico da própria aba', () => {
    let state = run(
      createInitialTabsState('/despesas'),
      { type: 'navigate', id: 'tab-1', path: '/editar/7' },
    );

    state = tabsReducer(state, { type: 'go', id: 'tab-1', delta: -1 });
    expect(activePath(state)).toBe('/despesas');
    expect(state.tabs[0].index).toBe(0);

    state = tabsReducer(state, { type: 'go', id: 'tab-1', delta: 1 });
    expect(activePath(state)).toBe('/editar/7');

    // Fora dos limites do histórico da aba: nada acontece.
    expect(tabsReducer(state, { type: 'go', id: 'tab-1', delta: 1 })).toBe(state);
    expect(tabsReducer(state, { type: 'go', id: 'tab-1', delta: -5 })).toBe(state);
  });

  it('navegar depois de voltar descarta o trecho à frente do histórico', () => {
    let state = run(
      createInitialTabsState('/despesas'),
      { type: 'navigate', id: 'tab-1', path: '/editar/7' },
      { type: 'go', id: 'tab-1', delta: -1 },
    );

    state = tabsReducer(state, { type: 'navigate', id: 'tab-1', path: '/receitas' });

    expect(state.tabs[0].history.map(locationToPath)).toEqual(['/despesas', '/receitas']);
    expect(state.tabs[0].index).toBe(1);
  });

  it('restaura abas salvas e ativa a indicada', () => {
    const state = tabsReducer(createInitialTabsState(), {
      type: 'restore',
      paths: ['/dashboard', '/nova-despesa', '/receitas'],
      activeIndex: 1,
    });

    expect(paths(state)).toEqual(['/dashboard', '/nova-despesa', '/receitas']);
    expect(activePath(state)).toBe('/nova-despesa');
  });

  it('restauração ignora entradas inválidas, aplica o limite e trava o índice ativo', () => {
    const state = tabsReducer(createInitialTabsState(), {
      type: 'restore',
      paths: ['não-é-rota', '/despesas', ...Array.from({ length: MAX_TABS + 5 }, (_, i) => `/receitas?p=${i}`)],
      activeIndex: 99,
    });

    expect(state.tabs).toHaveLength(MAX_TABS);
    expect(paths(state)[0]).toBe('/despesas');
    expect(activePath(state)).toBe(paths(state)[MAX_TABS - 1]);

    const empty = tabsReducer(createInitialTabsState(), { type: 'restore', paths: [], activeIndex: 0 });
    expect(empty.tabs).toHaveLength(1);
  });

  it('reset volta para uma aba única no Dashboard', () => {
    const state = run(createInitialTabsState(), { type: 'open', path: '/despesas' }, { type: 'open', path: '/receitas' });
    const reset = tabsReducer(state, { type: 'reset' });

    expect(paths(reset)).toEqual(['/dashboard']);
  });

  it('reconhece rotas de formulário', () => {
    expect(isUnsavedFormPath('/nova-despesa')).toBe(true);
    expect(isUnsavedFormPath('/nova-receita')).toBe(true);
    expect(isUnsavedFormPath('/nova-transferencia')).toBe(true);
    expect(isUnsavedFormPath('/editar/12')).toBe(true);
    expect(isUnsavedFormPath('/editar-receita/12')).toBe(true);
    expect(isUnsavedFormPath('/cadastrar-metas')).toBe(true);
    expect(isUnsavedFormPath('/importar-fatura')).toBe(true);
    expect(isUnsavedFormPath('/despesas')).toBe(false);
    expect(isUnsavedFormPath('/dashboard')).toBe(false);
  });
});
