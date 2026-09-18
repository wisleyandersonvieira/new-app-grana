import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  UNSAFE_NavigationContext,
  createPath,
  parsePath,
  type Navigator,
  type To,
} from 'react-router-dom';

import { TabPanelContext, useTabs } from '@/contexts/TabsContext';
import { AppRoutes } from '@/routes/appRoutes';
import type { Tab } from '@/lib/tabs-state';
import { cn } from '@/lib/utils';

const PANEL_CLASS = 'mobile-content absolute inset-0 overflow-auto px-4 py-5 sm:px-6 md:p-8';

/**
 * Renderiza todas as abas abertas ao mesmo tempo. As inativas ficam escondidas,
 * porém montadas, para preservar formulários, filtros e rolagem.
 */
export function TabsHost() {
  const { enabled, tabs, activeTabId } = useTabs();

  // Sem abas (assinatura expirada em /planos) o AppLayout renderiza só os children,
  // então a página aparece exatamente como antes, sem container próprio.
  if (!enabled) return <AppRoutes />;

  return (
    <>
      {tabs.map((tab) => (
        <TabPanel key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
      ))}
    </>
  );
}

function TabPanel({ tab, isActive }: { tab: Tab; isActive: boolean }) {
  const { navigateTab, goTab } = useTabs();
  const parentNavigation = useContext(UNSAFE_NavigationContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const wasActiveRef = useRef(isActive);

  // Navigator próprio da aba: useNavigate(), navigate(-1), <Link> e <NavLink>
  // dentro da página passam a mexer apenas nesta aba, com histórico próprio.
  const navigator = useMemo<Navigator>(() => ({
    createHref: (to: To) => (typeof to === 'string' ? to : createPath(to)),
    encodeLocation: (to: To) => {
      const path = typeof to === 'string' ? parsePath(to) : to;
      return { pathname: path.pathname ?? '/', search: path.search ?? '', hash: path.hash ?? '' };
    },
    push: (to: To, state?: unknown) => navigateTab(tab.id, to, { state }),
    replace: (to: To, state?: unknown) => navigateTab(tab.id, to, { state, replace: true }),
    go: (delta: number) => goTab(tab.id, delta),
  }), [tab.id, navigateTab, goTab]);

  const navigationValue = useMemo(
    () => ({ ...parentNavigation, navigator }),
    [parentNavigation, navigator],
  );

  const panelValue = useMemo(() => ({ tabId: tab.id, isActive }), [tab.id, isActive]);

  useLayoutEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!isActive || wasActive) return;

    const container = containerRef.current;
    if (container) container.scrollTop = scrollTopRef.current;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    // ResponsiveContainer do Recharts mede o container ao voltar a ficar visível;
    // o evento de resize garante o recálculo de gráficos montados em aba escondida.
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(frame);
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      hidden={!isActive}
      aria-hidden={!isActive}
      // Sem classe de display no painel: `hidden` (atributo + estilo) é o que decide.
      className={cn(PANEL_CLASS, !isActive && 'pointer-events-none')}
      style={isActive ? undefined : { display: 'none' }}
      onScroll={(event) => {
        scrollTopRef.current = event.currentTarget.scrollTop;
      }}
      data-tab-id={tab.id}
    >
      <UNSAFE_NavigationContext.Provider value={navigationValue}>
        <TabPanelContext.Provider value={panelValue}>
          <AppRoutes location={tab.location} />
        </TabPanelContext.Provider>
      </UNSAFE_NavigationContext.Provider>
    </div>
  );
}
