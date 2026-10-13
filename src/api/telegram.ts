import type { ApiResult } from '../types';

export interface Insets { top: number; bottom: number; left: number; right: number }
interface TelegramError { type?: string; message?: string; parameters?: { code?: string } }
export interface TelegramEventData { isStateStable?: boolean }
export type TelegramEventHandler = (data?: TelegramEventData) => void;
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { first_name?: string; last_name?: string; username?: string } };
  colorScheme: 'light' | 'dark';
  version?: string;
  platform?: string;
  viewportHeight?: number;
  viewportStableHeight?: number;
  isActive?: boolean;
  isVerticalSwipesEnabled?: boolean;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  ready(): void;
  expand(): void;
  onEvent(event: string, callback: TelegramEventHandler): void;
  offEvent(event: string, callback: TelegramEventHandler): void;
  isVersionAtLeast?(version: string): boolean;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  showConfirm?(message: string, callback: (confirmed: boolean) => void): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
  Serverless?: { call(method: string, input: Record<string, unknown>, cb: (err: TelegramError | null, result?: ApiResult) => void): void };
}
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

export function webApp() { return window.Telegram?.WebApp; }

const sides = ['top', 'bottom', 'left', 'right'] as const;
const positive = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

/** Both Telegram inset objects measure exclusions from the viewport edges. */
export function safeInsets(safe?: Partial<Insets>, content?: Partial<Insets>): Insets {
  return Object.fromEntries(sides.map(side => [side, Math.max(positive(safe?.[side]), positive(content?.[side]))])) as unknown as Insets;
}

/** Ignore an intermediate drag height; dock anchoring uses the last stable size. */
export function stableViewportHeight(appHeight: number | undefined, fallback: number): number {
  return positive(appHeight) || positive(fallback) || 568;
}

function supports(app: TelegramWebApp, version: string) {
  try { return !app.isVersionAtLeast || app.isVersionAtLeast(version); } catch { return false; }
}

/** Limit native collapse gestures to non-scene routes; never intercept the system header. */
export function setSceneGestures(fixed: boolean) {
  const app = webApp();
  if (!app || !supports(app, '7.7')) return;
  try {
    if (fixed) app.disableVerticalSwipes?.();
    else app.enableVerticalSwipes?.();
  } catch { /* Older WebViews retain their normal native gestures. */ }
}

export function setupTelegram() {
  const app = webApp();
  const root = document.documentElement;
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const priorSwipes = app?.isVerticalSwipesEnabled;
  let stableHeight = stableViewportHeight(app?.viewportStableHeight, window.innerHeight);
  let blurTimer = 0;

  function updateHeight(data?: TelegramEventData | Event) {
    if (!data || !('isStateStable' in data) || data.isStateStable !== false) stableHeight = stableViewportHeight(app?.viewportStableHeight, window.innerHeight);
    const active = document.activeElement;
    const keyboardInput = active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]');
    const visualHeight = positive(window.visualViewport?.height);
    // Resize only while editing; browser chrome motion must not move the dock.
    const height = keyboardInput && visualHeight > 0 ? Math.min(stableHeight, visualHeight) : stableHeight;
    root.style.setProperty('--app-height', `${height}px`);
    root.dataset.compact = height <= 640 ? 'true' : 'false';
  }

  function updateAppearance() {
    const theme = app?.initData ? app.colorScheme : systemTheme.matches ? 'dark' : 'light';
    root.dataset.theme = theme;
    const insets = safeInsets(app?.safeAreaInset, app?.contentSafeAreaInset);
    sides.forEach(side => root.style.setProperty(`--tg-safe-${side}`, `${insets[side]}px`));
    const color = theme === 'dark' ? '#202220' : '#f5f3ed';
    try { app?.setHeaderColor?.(color); } catch { /* Optional platform styling. */ }
    try { app?.setBackgroundColor?.(color); } catch { /* Optional platform styling. */ }
    try { if (app && supports(app, '7.10')) app.setBottomBarColor?.(color); } catch { /* Older clients have their own bottom bar. */ }
  }

  function update(data?: TelegramEventData) { updateAppearance(); updateHeight(data); }
  function activated() { root.dataset.active = document.hidden ? 'false' : 'true'; }
  function deactivated() { root.dataset.active = 'false'; }
  function visibilityChanged() { root.dataset.active = document.hidden || app?.isActive === false ? 'false' : 'true'; }
  function focusChanged() {
    window.clearTimeout(blurTimer);
    blurTimer = window.setTimeout(updateHeight, 0);
  }
  update();
  visibilityChanged();
  try { app?.ready(); app?.expand(); } catch { /* Browser preview has no native host. */ }
  setSceneGestures(true);
  const events = ['themeChanged', 'viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged'];
  events.forEach(event => app?.onEvent(event, update));
  app?.onEvent('activated', activated);
  app?.onEvent('deactivated', deactivated);
  systemTheme.addEventListener?.('change', updateAppearance);
  window.addEventListener('resize', updateHeight);
  window.visualViewport?.addEventListener('resize', updateHeight);
  document.addEventListener('focusin', focusChanged);
  document.addEventListener('focusout', focusChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  return () => {
    events.forEach(event => app?.offEvent(event, update));
    app?.offEvent('activated', activated);
    app?.offEvent('deactivated', deactivated);
    systemTheme.removeEventListener?.('change', updateAppearance);
    window.removeEventListener('resize', updateHeight);
    window.visualViewport?.removeEventListener('resize', updateHeight);
    document.removeEventListener('focusin', focusChanged);
    document.removeEventListener('focusout', focusChanged);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.clearTimeout(blurTimer);
    if (priorSwipes !== false) setSceneGestures(false);
  };
}
