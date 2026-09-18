import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { createPath, useLocation, useNavigate, useNavigationType, type To } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { dismissOpenOverlays } from '@/lib/overlays';
import { clearStoredTabs, readStoredTabs, writeStoredTabs, type StoredTabs } from '@/lib/tabs-storage';
import {
  MAX_TABS,
  createInitialTabsState,
  getActiveTab,
  locationToPath,
  tabsReducer,
  type Tab,
  type TabsState,
} from '@/lib/tabs-state';

function toPath(to: To) {
  return typeof to === 'string' ? to : createPath(to);
}

/**
 * Um link direto vence a aba ativa salva: ao abrir o app numa URL específica
 * (retorno do Stripe, link de e-mail) essa rota vira a aba ativa, sem descartar
 * as abas restauradas.
 */
function applyEntryPath(stored: StoredTabs, entryPath: string): StoredTabs {
  let paths = stored.paths.slice(0, MAX_TABS);
  let activeIndex = stored.activeIndex;

  const isDeepLink = entryPath !== '' && entryPath !== '/';
  if (isDeepLink) {
    const existingIndex = paths.indexOf(entryPath);
    if (existingIndex >= 0) {
      activeIndex = existingIndex;
    } else {
      if (paths.length >= MAX_TABS) paths = paths.slice(0, MAX_TABS - 1);
      paths = [...paths, entryPath];
      activeIndex = paths.length - 1;
    }
  }

  return { paths, activeIndex };
}

function createStateForUser(userId: string | undefined, entryPath: string): TabsState {
  const initial = createInitialTabsState(entryPath);
  const stored = userId ? readStoredTabs(userId) : null;
  if (!stored) return initial;

  const { paths, activeIndex } = applyEntryPath(stored, entryPath);
  return tabsReducer(initial, { type: 'restore', paths, activeIndex });
}

type NavigateTabOptions = { replace?: boolean; state?: unknown };

type TabsContextValue = {
  /** Falso quando o app é exibido sem abas (assinatura expirada em /planos). */
  enabled: boolean;
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab | null;
  /** Pathname da aba ativa — é o que o menu lateral usa para destacar o item atual. */
  activePathname: string;
  canOpenNewTab: boolean;
  openTab: (path: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  duplicateTab: (id: string) => void;
  activateTab: (id: string) => void;
  navigateActiveTab: (path: string, options?: NavigateTabOptions) => void;
  navigateTab: (id: string, to: To, options?: NavigateTabOptions) => void;
  goTab: (id: string, delta: number) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('useTabs precisa estar dentro de um TabsProvider.');
  return context;
}

/** Disponível para componentes que também rodam fora das abas (ex.: AppSidebar). */
export function useOptionalTabs() {
  return useContext(TabsContext);
}

type TabPanelContextValue = { tabId: string; isActive: boolean };

export const TabPanelContext = createContext<TabPanelContextValue | null>(null);

export function useTabPanel() {
  return useContext(TabPanelContext);
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const { user, loading, subscription } = useAuth();
  const realLocation = useLocation();
  const realNavigate = useNavigate();
  const realNavigationType = useNavigationType();

  // URL com que o documento foi aberto: usada para o link direto vencer a restauração.
  const entryPathRef = useRef(createPath(realLocation));
  // O ProtectedRoute só monta este provider com a sessão pronta, então as abas
  // salvas já entram na inicialização e as páginas não remontam depois.
  const [state, dispatch] = useReducer(tabsReducer, null, () => createStateForUser(user?.id, entryPathRef.current));

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isExpired = subscription?.status === 'expired';
  const enabled = !(isExpired && realLocation.pathname.startsWith('/planos'));

  const activeTab = getActiveTab(state);
  const activePath = activeTab ? locationToPath(activeTab.location) : '/';

  // ── Restauração das abas salvas (usuário que chega depois da montagem) ────
  const restoredForUserRef = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    if (loading || !user) return;
    if (restoredForUserRef.current === user.id) return;
    restoredForUserRef.current = user.id;

    const stored = readStoredTabs(user.id);
    if (!stored) return;

    const { paths, activeIndex } = applyEntryPath(stored, entryPathRef.current);
    dispatch({ type: 'restore', paths, activeIndex });
  }, [loading, user]);

  // ── Persistência (só rotas e aba ativa, nunca o conteúdo dos formulários) ──
  useEffect(() => {
    if (loading || !user) return;
    if (restoredForUserRef.current !== user.id) return;

    const paths = state.tabs.map((tab) => locationToPath(tab.location));
    const activeIndex = Math.max(0, state.tabs.findIndex((tab) => tab.id === state.activeTabId));
    writeStoredTabs(user.id, { paths, activeIndex });
  }, [loading, user, state]);

  // ── Logout: limpa as abas salvas, nunca durante o carregamento inicial ─────
  const previousUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;

    if (user) {
      previousUserIdRef.current = user.id;
      return;
    }

    const previousUserId = previousUserIdRef.current;
    if (!previousUserId) return;

    previousUserIdRef.current = null;
    restoredForUserRef.current = null;
    clearStoredTabs(previousUserId);
    dispatch({ type: 'reset' });
  }, [loading, user]);

  // ── A URL do navegador sempre reflete a aba ativa, sem poluir o histórico ──
  // A sincronia também precisa aceitar mudanças vindas de fora (redirects do
  // ProtectedRoute por assinatura, voltar do navegador): nesse caso a aba ativa
  // adota a URL, em vez de brigar com ela.
  const lastRealPathRef = useRef(createPath(realLocation));
  useEffect(() => {
    if (!activeTab) return;

    const realPath = createPath(realLocation);
    if (realPath === activePath) {
      lastRealPathRef.current = realPath;
      return;
    }

    const changedOutside = realPath !== lastRealPathRef.current;
    if (!enabled || changedOutside) {
      lastRealPathRef.current = realPath;
      dispatch({
        type: 'navigate',
        id: activeTab.id,
        path: realPath,
        state: realLocation.state ?? null,
        // Um <Link> fora das abas (ex.: TrialBanner) empilha histórico na aba;
        // redirects e voltar do navegador substituem a entrada atual.
        replace: realNavigationType !== 'PUSH',
      });
      return;
    }

    lastRealPathRef.current = activePath;
    realNavigate(activePath, { replace: true, state: activeTab.location.state ?? null });
  }, [enabled, activeTab, activePath, realLocation, realNavigate, realNavigationType]);

  const openTab = useCallback((path: string) => {
    if (stateRef.current.tabs.length >= MAX_TABS) {
      toast.error(`Limite de ${MAX_TABS} abas abertas. Feche uma aba para abrir outra.`);
      return;
    }
    dismissOpenOverlays();
    dispatch({ type: 'open', path });
  }, []);

  const closeTab = useCallback((id: string) => {
    dismissOpenOverlays();
    dispatch({ type: 'close', id });
  }, []);

  const closeOtherTabs = useCallback((id: string) => {
    dismissOpenOverlays();
    dispatch({ type: 'closeOthers', id });
  }, []);

  const duplicateTab = useCallback((id: string) => {
    if (stateRef.current.tabs.length >= MAX_TABS) {
      toast.error(`Limite de ${MAX_TABS} abas abertas. Feche uma aba para abrir outra.`);
      return;
    }
    dismissOpenOverlays();
    dispatch({ type: 'duplicate', id });
  }, []);

  const activateTab = useCallback((id: string) => {
    dismissOpenOverlays();
    dispatch({ type: 'activate', id });
  }, []);

  const navigateTab = useCallback((id: string, to: To, options?: NavigateTabOptions) => {
    dispatch({ type: 'navigate', id, path: toPath(to), state: options?.state, replace: options?.replace });
  }, []);

  const navigateActiveTab = useCallback((path: string, options?: NavigateTabOptions) => {
    dispatch({ type: 'navigate', id: stateRef.current.activeTabId, path, state: options?.state, replace: options?.replace });
  }, []);

  const goTab = useCallback((id: string, delta: number) => {
    dispatch({ type: 'go', id, delta });
  }, []);

  const value = useMemo<TabsContextValue>(() => ({
    enabled,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    activePathname: activeTab?.location.pathname ?? realLocation.pathname,
    canOpenNewTab: state.tabs.length < MAX_TABS,
    openTab,
    closeTab,
    closeOtherTabs,
    duplicateTab,
    activateTab,
    navigateActiveTab,
    navigateTab,
    goTab,
  }), [
    enabled, state.tabs, state.activeTabId, activeTab, realLocation.pathname,
    openTab, closeTab, closeOtherTabs, duplicateTab, activateTab, navigateActiveTab, navigateTab, goTab,
  ]);

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}
