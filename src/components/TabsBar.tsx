import { useEffect, useRef, useState } from 'react';
import { Copy, Plus, X, XCircle } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTabs } from '@/contexts/TabsContext';
import { getRouteMeta } from '@/lib/page-titles';
import { isUnsavedFormPath, type Tab } from '@/lib/tabs-state';
import { cn } from '@/lib/utils';

const NEW_TAB_SHORTCUTS = [
  '/nova-despesa',
  '/nova-receita',
  '/nova-transferencia',
  '/despesas',
  '/receitas',
  '/dashboard',
];

export function TabsBar() {
  const { tabs, activeTabId, activateTab, closeTab, closeOtherTabs, duplicateTab, openTab } = useTabs();
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);

  const pendingTab = tabs.find((tab) => tab.id === pendingCloseId) ?? null;

  const requestClose = (tab: Tab) => {
    if (isUnsavedFormPath(tab.location.pathname)) {
      setPendingCloseId(tab.id);
      return;
    }
    closeTab(tab.id);
  };

  const confirmClose = () => {
    if (pendingCloseId) closeTab(pendingCloseId);
    setPendingCloseId(null);
  };

  return (
    <>
      <div className="flex items-center gap-1 border-b border-slate-200/80 bg-slate-50/70 px-2 py-1.5 backdrop-blur md:px-3">
        <div
          role="tablist"
          aria-label="Abas abertas"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              canCloseOthers={tabs.length > 1}
              onActivate={() => activateTab(tab.id)}
              onRequestClose={() => requestClose(tab)}
              onCloseOthers={() => closeOtherTabs(tab.id)}
              onDuplicate={() => duplicateTab(tab.id)}
            />
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Abrir nova aba"
              title="Abrir nova aba"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-muted-foreground shadow-sm transition hover:border-primary/30 hover:text-primary md:h-9 md:w-9"
            >
              <Plus className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Abrir em nova aba
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NEW_TAB_SHORTCUTS.map((path) => {
              const meta = getRouteMeta(path);
              return (
                <DropdownMenuItem key={path} onSelect={() => openTab(path)}>
                  <meta.icon className="mr-2 h-4 w-4" />
                  {meta.title}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={Boolean(pendingTab)} onOpenChange={(open) => !open && setPendingCloseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Fechar {pendingTab ? getRouteMeta(pendingTab.location.pathname).title : 'aba'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              As informações não salvas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter aberta</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>Fechar aba</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type TabItemProps = {
  tab: Tab;
  isActive: boolean;
  canCloseOthers: boolean;
  onActivate: () => void;
  onRequestClose: () => void;
  onCloseOthers: () => void;
  onDuplicate: () => void;
};

function TabItem({ tab, isActive, canCloseOthers, onActivate, onRequestClose, onCloseOthers, onDuplicate }: TabItemProps) {
  const meta = getRouteMeta(tab.location.pathname);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [isActive]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={ref}
          role="tab"
          aria-selected={isActive}
          title={meta.title}
          className={cn(
            'group flex h-8 shrink-0 items-center gap-1 rounded-xl border pl-2.5 pr-1 transition md:h-9',
            isActive
              ? 'border-primary/25 bg-white shadow-sm shadow-primary/10'
              : 'border-transparent hover:border-slate-200 hover:bg-white/70',
          )}
          onAuxClick={(event) => {
            if (event.button !== 1) return;
            event.preventDefault();
            onRequestClose();
          }}
        >
          <button
            type="button"
            onClick={onActivate}
            className={cn(
              'flex min-w-0 items-center gap-2 text-[12.5px] transition',
              isActive ? 'font-semibold text-foreground' : 'text-muted-foreground group-hover:text-foreground',
            )}
          >
            <meta.icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
            <span className="max-w-[110px] truncate md:max-w-[150px]">{meta.title}</span>
          </button>

          <button
            type="button"
            aria-label={`Fechar aba ${meta.title}`}
            onClick={onRequestClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onRequestClose}>
          <X className="mr-2 h-4 w-4" />
          Fechar
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCloseOthers} disabled={!canCloseOthers}>
          <XCircle className="mr-2 h-4 w-4" />
          Fechar outras abas
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicar aba
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
