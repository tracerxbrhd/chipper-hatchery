import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardSvg, launchIntent } from '../src/social/share';
import { PREVIEW_CHICKS } from '../src/chicks/previewFixtures';

afterEach(() => vi.unstubAllGlobals());
describe('original bird sharing and launch intent', () => {
  it('renders the saved current-stage genes and escapes owner-provided name/url', () => {
    const chick = { ...PREVIEW_CHICKS[0], name: '<script>alert(1)</script>', stage: 'baby' as const };
    const svg = cardSvg(chick, 'https://t.me/chipperhatcherybot?startapp=c_test&bad="x"');
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&amp;bad=&quot;x&quot;');
    expect(svg).toContain('Птенец');
    expect(svg).not.toContain('Подросток');
    expect(svg).not.toContain('receipts');
    expect(svg).not.toContain('telegramId');
    expect(svg).toContain('viewBox="0 0 320 320"');
  });
  it('retains invite/profile/chick intent independently of onboarding and rejects malformed links', () => {
    const token = 'a'.repeat(64);
    vi.stubGlobal('window', { Telegram: { WebApp: { initDataUnsafe: { start_param: `i_${token}` } } } });
    vi.stubGlobal('location', { search: '' });
    expect(launchIntent()).toEqual({ kind: 'invite', token });
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search: `?tgWebAppStartParam=c_${token}_11111111-1111-4111-8111-111111111111` });
    expect(launchIntent()).toEqual({ kind: 'chick', token, chickId: '11111111-1111-4111-8111-111111111111' });
    for (const value of ['bogus', 'x_a', 'c_a', 'i_a_extra', '<script>', 'i_' + 'a'.repeat(513)]) {
      vi.stubGlobal('location', { search: `?tgWebAppStartParam=${encodeURIComponent(value)}` });
      expect(launchIntent()).toBeNull();
    }
  });
});
