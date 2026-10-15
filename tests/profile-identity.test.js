import { describe, expect, it } from 'vitest';
import { refreshProfileIdentity, sanitizeTelegramName, sanitizeTelegramPhotoUrl, verifiedProfileIdentity } from '../tgcloud/lib/profileIdentity.js';

const timestamp = 1791800000000;
const signed = user => ({ initData: { user: { id: 101, ...user } } });

describe('private verified Telegram identity', () => {
  it('uses only the verified context and clears absent optional fields on a fresh launch', () => {
    const state = { player: { telegramId: '101', displayName: 'Имя в Chipper' } };
    const context = signed({ first_name: 'Захар', last_name: 'Тест', username: 'Zahar_test', photo_url: 'https://t.me/i/userpic/320/test.jpeg' });
    expect(refreshProfileIdentity(state, context, timestamp)).toBe(true);
    expect(state.player.telegramIdentity).toEqual({ firstName: 'Захар', lastName: 'Тест', username: 'Zahar_test', photoUrl: 'https://t.me/i/userpic/320/test.jpeg', verifiedAt: timestamp });
    expect(refreshProfileIdentity(state, context, timestamp + 10)).toBe(false);
    expect(state.player.telegramIdentity.verifiedAt).toBe(timestamp);
    expect(refreshProfileIdentity(state, signed({ first_name: 'Новое имя' }), timestamp + 20)).toBe(true);
    expect(state.player.telegramIdentity).toEqual({ firstName: 'Новое имя', lastName: '', username: null, photoUrl: null, verifiedAt: timestamp + 20 });
    expect(state.player.displayName).toBe('Имя в Chipper');
  });

  it('never reads unsafe hints, receiver, client-shaped values or a foreign owner', () => {
    const state = { player: { telegramId: '101' } };
    const forged = { initDataUnsafe: { user: { id: 101, first_name: 'Подмена' } }, user: { id: 101, first_name: 'Подмена' } };
    expect(verifiedProfileIdentity(forged, timestamp)).toBeNull();
    expect(refreshProfileIdentity(state, forged, timestamp)).toBe(false);
    expect(refreshProfileIdentity(state, signed({ id: 202, first_name: 'Чужой' }), timestamp)).toBe(false);
    expect(state.player).not.toHaveProperty('telegramIdentity');
    for (const id of [0, -1, null, {}, '01', '101x', Number.MAX_SAFE_INTEGER + 1]) expect(verifiedProfileIdentity(signed({ id }), timestamp)).toBeNull();
    expect(verifiedProfileIdentity(signed({ id: '101' }), timestamp)).not.toBeNull();
  });

  it('bounds Unicode names and metadata without breaking emoji or exposing controls', () => {
    expect(sanitizeTelegramName('  За\u0000хар\u202e  Тест  ')).toBe('Захар Тест');
    expect(Array.from(sanitizeTelegramName('🐥'.repeat(100)))).toHaveLength(80);
    const result = verifiedProfileIdentity(signed({ first_name: '<script>Тест</script>', last_name: {}, username: 'javascript:alert(1)' }), timestamp);
    expect(result.firstName).toBe('<script>Тест</script>'); // React renders text, never HTML.
    expect(result.lastName).toBe(''); expect(result.username).toBeNull();
    expect(verifiedProfileIdentity(signed({ username: 'a'.repeat(33) }), timestamp).username).toBeNull();
    expect(verifiedProfileIdentity(signed({}), -1)).toBeNull();
  });

  it('only keeps small HTTPS Telegram image metadata and never fetches URLs', () => {
    for (const url of ['https://t.me/i/userpic/320/a.jpg', 'https://telegram.org/img/avatar.svg', 'https://cdn4.telegram-cdn.org/file/a.jpeg']) expect(sanitizeTelegramPhotoUrl(url)).toBe(url);
    for (const url of ['http://t.me/a.jpg', 'javascript:alert(1)', 'data:image/svg+xml,test', 'https://t.me.evil.test/a.jpg', 'https://evil.test/telegram.org/a', 'https://t.me@evil.test/a', 'https://evil.test@t.me/a', 'https://t.me:443/a', 'https://api.telegram.org/botTOKEN/getFile', 'https://t.me\\@evil.test/a', 'https://t.me/a#x', 'https://t.me/a\n', 'https://t.me/' + 'a'.repeat(1024)]) expect(sanitizeTelegramPhotoUrl(url)).toBeNull();
  });
});
