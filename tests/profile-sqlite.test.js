import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fixture, operation, ctx } from './helpers.js';
import { createSocialService } from '../tgcloud/lib/social.js';

describe('signed Telegram identity CAS integration on SQLite', () => {
  it('refreshes own private snapshot without changing Chipper nickname or publishing identity', async () => {
    const f = fixture(); await f.initial(); await f.initial(202);
    const social = createSocialService({ database: f.database, gameService: f.service, now: () => f.now, id: randomUUID });
    const configured = await social.call('updatePrivacy', operation({ displayName: 'Псевдоним Chipper', visibility: 'public', collectionVisibility: 'public' }), ctx());
    expect(configured.ok).toBe(true);
    const context = { initData: { user: { id: 101, first_name: 'Личное имя', last_name: 'Фамилия', username: 'private_tag', photo_url: 'https://t.me/i/userpic/320/private.jpeg' } } };
    const refreshed = await f.service.call('bootstrap', {}, context);
    expect(refreshed.ok).toBe(true);
    expect(refreshed.state.player.telegramIdentity).toMatchObject({ firstName: 'Личное имя', lastName: 'Фамилия', username: 'private_tag', photoUrl: 'https://t.me/i/userpic/320/private.jpeg' });
    const own = await social.call('getSocial', {}, context);
    expect(own.result.social.profile.displayName).toBe('Псевдоним Chipper');
    const profileId = own.result.social.profile.profileId;
    const peer = await social.call('getPublicProfile', { profileId }, ctx(202));
    expect(peer.ok).toBe(true);
    for (const forbidden of ['telegramIdentity', 'firstName', 'lastName', 'photoUrl', 'username', 'private_tag', 'Личное имя', 'private.jpeg']) expect(JSON.stringify(peer.result.profile)).not.toContain(forbidden);
    f.advance(1);
    const cleared = await f.service.call('getHome', {}, { initData: { user: { id: 101, first_name: 'Новое имя' } } });
    expect(cleared.state.player.telegramIdentity).toMatchObject({ firstName: 'Новое имя', lastName: '', username: null, photoUrl: null });
    expect((await social.call('getSocial', {}, ctx())).result.social.profile.displayName).toBe('Псевдоним Chipper');
  });

  it('rejects client identity fields before writes and forged unsafe context cannot choose another owner', async () => {
    const f = fixture(); await f.initial();
    const before = await f.store.read('101');
    const request = await f.service.call('getHome', { telegramIdentity: { firstName: 'Подмена' } }, ctx());
    expect(request.ok).toBe(false); expect(request.error.code).toBe('INVALID_REQUEST');
    const forged = await f.service.call('getHome', {}, { initDataUnsafe: { user: { id: 101, first_name: 'Подмена' } } });
    expect(forged.ok).toBe(false); expect(forged.error.code).toBe('UNAUTHORIZED');
    expect(await f.store.read('101')).toEqual(before);
  });
});
