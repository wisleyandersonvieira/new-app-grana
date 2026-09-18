/**
 * Dialog, AlertDialog, Select, Popover e Sheet do Radix são renderizados em portal
 * no body, fora do painel da aba. Ao trocar de aba, o overlay da aba anterior
 * continuaria visível (e, no caso dos modais, travando o resto da tela), então
 * fechamos o que estiver aberto com a mesma tecla que o Radix já escuta.
 */
const OPEN_OVERLAY_SELECTOR = [
  '[data-radix-popper-content-wrapper]',
  '[data-state="open"][role="dialog"]',
  '[data-state="open"][role="menu"]',
  '[data-state="open"][role="listbox"]',
  '[data-state="open"][role="alertdialog"]',
].join(', ');

const MAX_DISMISS_ATTEMPTS = 3;

export function hasOpenOverlay() {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector(OPEN_OVERLAY_SELECTOR));
}

export function dismissOpenOverlays(attempt = 0) {
  if (typeof document === 'undefined' || attempt >= MAX_DISMISS_ATTEMPTS) return;
  if (!hasOpenOverlay()) return;

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  // Camadas aninhadas (ex.: Select dentro de Dialog) fecham uma por vez: o React
  // só aplica o fechamento no commit seguinte, então tentamos de novo no próximo frame.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => dismissOpenOverlays(attempt + 1));
  }
}
