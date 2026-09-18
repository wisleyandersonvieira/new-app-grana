import { useEffect, useRef } from 'react';

import { useTabPanel } from '@/contexts/TabsContext';

/**
 * Executa o callback quando a aba que contém o componente volta a ficar ativa.
 * Não dispara na montagem (a tela já carrega os dados sozinha) nem fora das abas.
 * Use em listagens e relatórios; nunca em telas de formulário, para não perder o
 * que foi digitado.
 */
export function useOnTabActivate(callback: () => void) {
  const panel = useTabPanel();
  const isActive = panel?.isActive ?? true;

  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current) callbackRef.current();
    wasActiveRef.current = isActive;
  }, [isActive]);
}
