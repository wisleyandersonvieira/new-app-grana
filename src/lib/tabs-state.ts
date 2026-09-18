import { createPath, parsePath } from 'react-router-dom';

export const MAX_TABS = 10;
export const MAX_TAB_HISTORY = 50;
export const DEFAULT_TAB_PATH = '/dashboard';

export type TabLocation = {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
};

export type Tab = {
  id: string;
  /** Location atual da aba — sempre igual a `history[index]`. */
  location: TabLocation;
  history: TabLocation[];
  index: number;
};

export type TabsState = {
  tabs: Tab[];
  activeTabId: string;
  /** Contador usado para gerar ids de aba e keys de location de forma determinística. */
  seq: number;
};

export type TabsAction =
  | { type: 'open'; path: string; state?: unknown }
  | { type: 'activate'; id: string }
  | { type: 'close'; id: string }
  | { type: 'closeOthers'; id: string }
  | { type: 'duplicate'; id: string }
  | { type: 'navigate'; id: string; path: string; state?: unknown; replace?: boolean }
  | { type: 'go'; id: string; delta: number }
  | { type: 'restore'; paths: string[]; activeIndex: number }
  | { type: 'reset'; path?: string };

/** Rotas de formulário: fechar a aba descarta o que foi digitado. */
export function isUnsavedFormPath(pathname: string) {
  return (
    pathname.startsWith('/nova-')
    || pathname.startsWith('/editar')
    || pathname.startsWith('/cadastrar-metas')
    || pathname.startsWith('/importar-fatura')
  );
}

export function locationToPath(location: TabLocation) {
  return createPath(location);
}

function makeLocation(path: string, state: unknown, key: string): TabLocation {
  const parsed = parsePath(path);
  return {
    pathname: parsed.pathname || '/',
    search: parsed.search ?? '',
    hash: parsed.hash ?? '',
    state: state ?? null,
    key,
  };
}

function makeTab(path: string, state: unknown, seq: number): Tab {
  const location = makeLocation(path, state, `loc-${seq}`);
  return { id: `tab-${seq}`, location, history: [location], index: 0 };
}

function withTab(tabs: Tab[], tab: Tab) {
  return tabs.map((current) => (current.id === tab.id ? tab : current));
}

export function findTab(state: TabsState, id: string) {
  return state.tabs.find((tab) => tab.id === id) ?? null;
}

export function getActiveTab(state: TabsState) {
  return findTab(state, state.activeTabId) ?? state.tabs[0] ?? null;
}

export function canOpenTab(state: TabsState) {
  return state.tabs.length < MAX_TABS;
}

export function createInitialTabsState(path: string = DEFAULT_TAB_PATH): TabsState {
  const seq = 1;
  const tab = makeTab(path, null, seq);
  return { tabs: [tab], activeTabId: tab.id, seq };
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      if (!canOpenTab(state)) return state;
      const seq = state.seq + 1;
      const tab = makeTab(action.path, action.state ?? null, seq);
      return { tabs: [...state.tabs, tab], activeTabId: tab.id, seq };
    }

    case 'activate': {
      if (state.activeTabId === action.id || !findTab(state, action.id)) return state;
      return { ...state, activeTabId: action.id };
    }

    case 'close': {
      const index = state.tabs.findIndex((tab) => tab.id === action.id);
      if (index === -1) return state;

      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      if (tabs.length === 0) {
        const seq = state.seq + 1;
        const tab = makeTab(DEFAULT_TAB_PATH, null, seq);
        return { tabs: [tab], activeTabId: tab.id, seq };
      }

      if (state.activeTabId !== action.id) return { ...state, tabs };

      // Ativa a vizinha: a que assumiu a posição ou, no fim da lista, a anterior.
      const neighbour = tabs[Math.min(index, tabs.length - 1)];
      return { ...state, tabs, activeTabId: neighbour.id };
    }

    case 'closeOthers': {
      const tab = findTab(state, action.id);
      if (!tab) return state;
      return { ...state, tabs: [tab], activeTabId: tab.id };
    }

    case 'duplicate': {
      const source = findTab(state, action.id);
      if (!source || !canOpenTab(state)) return state;

      const seq = state.seq + 1;
      const location = { ...source.location, key: `loc-${seq}` };
      const tab: Tab = { id: `tab-${seq}`, location, history: [location], index: 0 };
      const sourceIndex = state.tabs.findIndex((current) => current.id === action.id);
      const tabs = [...state.tabs];
      tabs.splice(sourceIndex + 1, 0, tab);
      return { tabs, activeTabId: tab.id, seq };
    }

    case 'navigate': {
      const tab = findTab(state, action.id);
      if (!tab) return state;

      const seq = state.seq + 1;
      const location = makeLocation(action.path, action.state ?? null, `loc-${seq}`);
      const isSamePath = locationToPath(tab.location) === locationToPath(location);

      if (action.replace || isSamePath) {
        const history = [...tab.history];
        history[tab.index] = location;
        return { ...state, seq, tabs: withTab(state.tabs, { ...tab, location, history }) };
      }

      let history = [...tab.history.slice(0, tab.index + 1), location];
      if (history.length > MAX_TAB_HISTORY) history = history.slice(history.length - MAX_TAB_HISTORY);
      return { ...state, seq, tabs: withTab(state.tabs, { ...tab, location, history, index: history.length - 1 }) };
    }

    case 'go': {
      const tab = findTab(state, action.id);
      if (!tab) return state;

      const index = tab.index + action.delta;
      if (index < 0 || index >= tab.history.length || action.delta === 0) return state;
      return { ...state, tabs: withTab(state.tabs, { ...tab, index, location: tab.history[index] }) };
    }

    case 'restore': {
      const paths = action.paths
        .filter((path) => typeof path === 'string' && path.startsWith('/'))
        .slice(0, MAX_TABS);
      if (paths.length === 0) return state;

      let seq = state.seq;
      const tabs = paths.map((path) => {
        seq += 1;
        return makeTab(path, null, seq);
      });
      const activeIndex = Math.min(Math.max(action.activeIndex, 0), tabs.length - 1);
      return { tabs, activeTabId: tabs[activeIndex].id, seq };
    }

    case 'reset': {
      const seq = state.seq + 1;
      const tab = makeTab(action.path ?? DEFAULT_TAB_PATH, null, seq);
      return { tabs: [tab], activeTabId: tab.id, seq };
    }

    default:
      return state;
  }
}
