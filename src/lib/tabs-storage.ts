/**
 * Persistência das abas internas: guardamos só as rotas e qual é a ativa,
 * nunca o conteúdo dos formulários. A chave é por usuário e vive no
 * sessionStorage, o mesmo escopo da sessão do Supabase.
 */
const STORAGE_PREFIX = 'grana:tabs:';

export type StoredTabs = { paths: string[]; activeIndex: number };

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readStoredTabs(userId: string): StoredTabs | null {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredTabs> | null;
    if (!parsed || !Array.isArray(parsed.paths)) return null;

    const paths = parsed.paths.filter((path): path is string => typeof path === 'string' && path.startsWith('/'));
    if (paths.length === 0) return null;

    const activeIndex = Number.isInteger(parsed.activeIndex) ? Number(parsed.activeIndex) : 0;
    return { paths, activeIndex };
  } catch {
    return null;
  }
}

export function writeStoredTabs(userId: string, value: StoredTabs) {
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(value));
  } catch {
    // sessionStorage indisponível (modo privado, cota cheia): as abas só não persistem.
  }
}

export function clearStoredTabs(userId: string | null | undefined) {
  if (!userId) return;
  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch {
    // nada a fazer
  }
}
