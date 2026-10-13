import type { ApiResult, Method } from '../types';
import { setupTelegram, webApp } from './telegram';

export const isDevMock = import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === 'true';
export const initTelegram = setupTelegram;
export function getAuthKey(): string {
  if (isDevMock) return 'development-only';
  const app = webApp();
  // The opaque signed launch payload is only an identity boundary, never authorization.
  return app?.initData && app.Serverless ? app.initData : 'outside';
}
export function subscribeAuthChange(callback: () => void) {
  let previous = getAuthKey();
  const check = () => { const current = getAuthKey(); if (current !== previous) { previous = current; callback(); } };
  const timer = window.setInterval(check, 250);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
}
export async function call(method: Method, params: Record<string, unknown> = {}): Promise<ApiResult> {
  if (isDevMock) {
    const mock = await import('./devMock');
    return mock.callMock(method, params);
  }
  const app = webApp();
  if (!app?.initData || !app.Serverless) return { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Откройте Chipper внутри Telegram.', retryable: false } };
  const identity = getAuthKey();
  return new Promise(resolve => {
    let done = false;
    const finish = (response: ApiResult) => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve(getAuthKey() === identity ? response : { ok: false, error: { code: 'AUTH_CHANGED', message: 'Аккаунт изменился. Откройте игру заново.', retryable: false } });
    };
    const timer = window.setTimeout(() => finish({ ok: false, error: { code: 'NETWORK', message: 'Ответ задерживается. Можно безопасно повторить запрос.', retryable: true } }), 15000);
    try {
      app.Serverless!.call(method, params, (err, result) => {
        if (err) {
          const unauthorized = err.type === 'UNAUTHORIZED';
          finish({ ok: false, error: { code: unauthorized ? 'AUTH_REQUIRED' : (err.parameters?.code ?? 'NETWORK'), message: unauthorized ? 'Запуск Telegram устарел. Переоткройте игру в боте.' : 'Не удалось связаться с игрой. Попробуйте ещё раз.', retryable: !unauthorized } });
        } else if (result && typeof result.ok === 'boolean') finish(result);
        else finish({ ok: false, error: { code: 'SERVER', message: 'Не удалось прочитать ответ игры.', retryable: true } });
      });
    } catch { finish({ ok: false, error: { code: 'NETWORK', message: 'Связь прервалась. Повторите действие.', retryable: true } }); }
  });
}

let audioContext: AudioContext | null = null;
export function playFeedback(kind: string, sound = false, haptics = true) {
  if ((typeof document !== 'undefined' && document.hidden) || webApp()?.isActive === false) return;
  if (haptics) { try { webApp()?.HapticFeedback?.impactOccurred(kind === 'play' ? 'medium' : 'light'); } catch { /* Haptics are optional. */ } }
  if (!sound) return;
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(kind === 'hatch' ? 880 : 660, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(990, audioContext.currentTime + .12);
    gain.gain.setValueAtTime(.04, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .18);
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .2);
  } catch { /* Silent fallback when WebView blocks Web Audio. */ }
}
