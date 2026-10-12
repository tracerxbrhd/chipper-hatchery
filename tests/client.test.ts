import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, getAuthKey } from '../src/api/client';

afterEach(() => { vi.unstubAllGlobals(); });
describe('official Telegram adapter', () => {
  it('C14 has no browser authorization or query/localStorage fallback', async () => {
    vi.stubGlobal('window', {});
    expect(getAuthKey()).toBe('outside'); expect((await call('bootstrap')).ok).toBe(false);
  });
  it('uses documented Serverless callback and sends only parameters', async () => {
    const endpoint = vi.fn((_method, _params, callback) => callback(null, { ok: true, state: { revision: 1 } }));
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'signed-A', Serverless: { call: endpoint } } }, setTimeout, clearTimeout });
    const r = await call('bootstrap'); expect(r.ok).toBe(true); expect(endpoint.mock.calls[0].slice(0, 2)).toEqual(['bootstrap', {}]);
  });
  it('U06 discards a late response from a previous identity', async () => {
    const app = { initData: 'signed-A', Serverless: { call: (_method: string, _params: object, callback: (err: null, result: object) => void) => { app.initData = 'signed-B'; callback(null, { ok: true, state: { player: { telegramId: '101' } } }); } } };
    vi.stubGlobal('window', { Telegram: { WebApp: app }, setTimeout, clearTimeout });
    const r = await call('getHome'); expect(r).toMatchObject({ ok: false, error: { code: 'AUTH_CHANGED', retryable: false } });
  });
  it('maps invalid Telegram launch to a clear non-retryable error', async () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'expired', Serverless: { call: (_m: string, _p: object, cb: (err: object) => void) => cb({ type: 'UNAUTHORIZED' }) } } }, setTimeout, clearTimeout });
    expect(await call('bootstrap')).toMatchObject({ ok: false, error: { code: 'AUTH_REQUIRED', retryable: false } });
  });
});
