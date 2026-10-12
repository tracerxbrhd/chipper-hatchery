import type { ApiResult } from '../types';

interface Insets { top: number; bottom: number; left: number; right: number }
interface TelegramError { type?: string; message?: string; parameters?: { code?: string } }
export interface TelegramWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  ready(): void;
  expand(): void;
  onEvent(event: string, callback: () => void): void;
  offEvent(event: string, callback: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
  Serverless?: { call(method: string, input: Record<string, unknown>, cb: (err: TelegramError | null, result?: ApiResult) => void): void };
}
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

export function webApp() { return window.Telegram?.WebApp; }
export function setupTelegram() {
  const app = webApp();
  function update() {
    document.documentElement.dataset.theme = (app?.initData ? app.colorScheme : undefined) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const value = (app?.safeAreaInset?.[side] ?? 0) + (app?.contentSafeAreaInset?.[side] ?? 0);
      document.documentElement.style.setProperty(`--tg-safe-${side}`, `${value}px`);
    }
    try { app?.setHeaderColor?.(app.colorScheme === 'dark' ? '#1e2421' : '#f7f6f2'); } catch { /* Older Telegram clients use their own header. */ }
    try { app?.setBackgroundColor?.(app.colorScheme === 'dark' ? '#1e2421' : '#f7f6f2'); } catch { /* Optional on older clients. */ }
  }
  update();
  app?.ready(); app?.expand();
  const events = ['themeChanged', 'viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged'];
  events.forEach(e => app?.onEvent(e, update));
  return () => events.forEach(e => app?.offEvent(e, update));
}
