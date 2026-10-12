import type { ApiResult, Method } from '../types';
import { createGameService } from '../../tgcloud/lib/service.js';

// This module is dynamically imported only in Vite DEV. It is never bundled for production.
type Row = { revision: number; state: Record<string, unknown> };
const storageKey = 'chipper-explicit-development-v1';
const store = {
  async read() { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) as Row : null; },
  async create(_id: string, state: Record<string, unknown>) { if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify({ revision: 0, state })); },
  async compareAndSwap(_id: string, expected: number, state: Record<string, unknown>) {
    const raw = localStorage.getItem(storageKey);
    if (!raw || (JSON.parse(raw) as Row).revision !== expected) return false;
    localStorage.setItem(storageKey, JSON.stringify({ revision: expected + 1, state })); return true;
  },
};
const service = createGameService({ store, now: () => Date.now(), random: () => Math.random(), id: () => crypto.randomUUID() });
export async function callMock(method: Method, params: Record<string, unknown>): Promise<ApiResult> {
  if (!import.meta.env.DEV) throw new Error('Development adapter cannot run in production');
  if (!navigator.onLine) return { ok: false, error: { code: 'NETWORK', message: 'Нет сети. Повторите действие после подключения.', retryable: true } };
  await new Promise(resolve => setTimeout(resolve, 90));
  return await service.call(method, params, { initData: { user: { id: 101 } } }) as ApiResult;
}
