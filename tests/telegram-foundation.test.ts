import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeInsets, setSceneGestures, setupTelegram, stableViewportHeight, type TelegramEventHandler, type TelegramWebApp } from '../src/api/telegram';

class TestElement { editing = false; matches() { return this.editing; } }

function host(overrides: Partial<TelegramWebApp> = {}) {
  const properties = new Map<string, string>();
  const listeners = new Map<string, TelegramEventHandler>();
  const query = Object.assign(new EventTarget(), { matches: false });
  const visualViewport = Object.assign(new EventTarget(), { height: 640 });
  const root = { dataset: {} as Record<string, string>, style: { setProperty: (key: string, value: string) => properties.set(key, value) } };
  const document = Object.assign(new EventTarget(), { documentElement: root, activeElement: new TestElement() });
  const app: TelegramWebApp = {
    initData: 'synthetic-launch', colorScheme: 'light', viewportStableHeight: 640,
    isVerticalSwipesEnabled: true,
    safeAreaInset: { top: 20, bottom: 16, left: 0, right: 0 },
    contentSafeAreaInset: { top: 44, bottom: 12, left: 0, right: 0 },
    ready: vi.fn(), expand: vi.fn(),
    onEvent: vi.fn((name, callback) => { listeners.set(name, callback); }),
    offEvent: vi.fn((name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); }),
    disableVerticalSwipes: vi.fn(), enableVerticalSwipes: vi.fn(),
    setHeaderColor: vi.fn(), setBackgroundColor: vi.fn(), setBottomBarColor: vi.fn(),
    ...overrides,
  };
  const window = Object.assign(new EventTarget(), {
    innerHeight: 667, Telegram: { WebApp: app }, visualViewport,
    matchMedia: () => query, setTimeout, clearTimeout,
  });
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('HTMLElement', TestElement);
  return { app, root, properties, listeners, query, visualViewport, document, window };
}

afterEach(() => vi.unstubAllGlobals());

describe('Telegram scene foundation', () => {
  it('takes the largest edge exclusion, without duplicate Telegram padding', () => {
    expect(safeInsets({ top: 24, bottom: 30 }, { top: 50, bottom: 12 })).toEqual({ top: 50, bottom: 30, left: 0, right: 0 });
    expect(safeInsets({ top: NaN, bottom: -10 }, { right: Infinity, left: 8 })).toEqual({ top: 0, bottom: 0, left: 8, right: 0 });
  });

  it('falls back from an unavailable stable height to the browser viewport', () => {
    expect(stableViewportHeight(600, 667)).toBe(600);
    expect(stableViewportHeight(NaN, 667)).toBe(667);
    expect(stableViewportHeight(0, 0)).toBe(568);
  });

  it('anchors the dock to stable Telegram height and responds to theme/inset events', () => {
    const h = host(); const cleanup = setupTelegram();
    expect(h.app.ready).toHaveBeenCalledOnce(); expect(h.app.expand).toHaveBeenCalledOnce();
    expect(h.app.disableVerticalSwipes).toHaveBeenCalledOnce();
    expect(h.properties.get('--app-height')).toBe('640px');
    expect(h.properties.get('--tg-safe-top')).toBe('44px');
    expect(h.properties.get('--tg-safe-bottom')).toBe('16px');
    h.app.viewportStableHeight = 400;
    h.listeners.get('viewportChanged')?.({ isStateStable: false });
    expect(h.properties.get('--app-height')).toBe('640px');
    h.listeners.get('viewportChanged')?.({ isStateStable: true });
    expect(h.properties.get('--app-height')).toBe('400px');
    h.app.colorScheme = 'dark'; h.listeners.get('themeChanged')?.();
    expect(h.root.dataset.theme).toBe('dark');
    expect(h.app.setBottomBarColor).toHaveBeenLastCalledWith('#202220');
    cleanup();
    expect(h.listeners.size).toBe(0);
    expect(h.app.enableVerticalSwipes).toHaveBeenCalledOnce();
  });

  it('resizes for the keyboard only while a field is focused', () => {
    const h = host(); const cleanup = setupTelegram();
    h.visualViewport.height = 350; h.visualViewport.dispatchEvent(new Event('resize'));
    expect(h.properties.get('--app-height')).toBe('640px');
    h.document.activeElement.editing = true; h.visualViewport.dispatchEvent(new Event('resize'));
    expect(h.properties.get('--app-height')).toBe('350px');
    h.document.activeElement.editing = false; h.window.dispatchEvent(new Event('resize'));
    expect(h.properties.get('--app-height')).toBe('640px');
    cleanup();
  });

  it('supports WebViews without optional swipe and bottom-bar methods', () => {
    const h = host({ disableVerticalSwipes: undefined, enableVerticalSwipes: undefined, setBottomBarColor: undefined, viewportStableHeight: undefined });
    const cleanup = setupTelegram();
    expect(h.properties.get('--app-height')).toBe('667px');
    expect(() => { setSceneGestures(true); setSceneGestures(false); cleanup(); }).not.toThrow();
  });

  it('does not invoke APIs advertised as unsupported by the installed Telegram version', () => {
    const h = host({ isVersionAtLeast: () => false }); const cleanup = setupTelegram();
    expect(h.app.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(h.app.setBottomBarColor).not.toHaveBeenCalled();
    setSceneGestures(false); cleanup();
    expect(h.app.enableVerticalSwipes).not.toHaveBeenCalled();
  });

  it('keeps native swipe state disabled if it was already disabled before mounting', () => {
    const h = host({ isVerticalSwipesEnabled: false }); const cleanup = setupTelegram();
    cleanup(); expect(h.app.enableVerticalSwipes).not.toHaveBeenCalled();
    h.app.disableVerticalSwipes = () => { throw new Error('old host'); };
    expect(() => setSceneGestures(true)).not.toThrow();
  });

  it('removes browser and Telegram listeners when the app is unmounted', () => {
    const h = host(); const cleanup = setupTelegram();
    cleanup();
    h.properties.clear(); h.window.dispatchEvent(new Event('resize')); h.visualViewport.dispatchEvent(new Event('resize'));
    h.query.dispatchEvent(new Event('change'));
    expect(h.properties.size).toBe(0);
    expect(h.app.offEvent).toHaveBeenCalledTimes(7);
  });

  it('pauses decorative animations on native deactivation and restores them on activation', () => {
    const h = host(); const cleanup = setupTelegram();
    expect(h.root.dataset.active).toBe('true');
    h.listeners.get('deactivated')?.(); expect(h.root.dataset.active).toBe('false');
    h.listeners.get('activated')?.(); expect(h.root.dataset.active).toBe('true');
    cleanup();
  });
});
