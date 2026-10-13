import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fixture, ctx, operation } from './helpers.js';
import { areFriends, createSocialService, friendPairKey, peerFor, publicChick } from '../tgcloud/lib/social.js';

function socialFixture() {
  const f = fixture(); let lossPrefix = null;
  const database = { ...f.database, async run(sql, params) {
    const result = await f.database.run(sql, params);
    if (lossPrefix && sql.startsWith(lossPrefix) && result.rows.length) { lossPrefix = null; throw new Error('response lost after social commit'); }
    return result;
  } };
  const social = createSocialService({ database, gameService: f.service, now: () => f.now, id: randomUUID });
  return { ...f, get now() { return f.now; }, social,
    lossAfter(prefix) { lossPrefix = prefix; },
    callSocial(method, input = {}, owner = 101) { return social.call(method, input, ctx(owner)); },
    async owner(owner = 101) { await f.initial(owner); return (await social.call('getSocial', {}, ctx(owner))).result.social.profile; },
    async request(from, to) {
      const target = (await social.call('createSocialLink', operation({ kind: 'invite' }), ctx(to))).result;
      const profileId = target.social.profile.profileId;
      const request = await social.call('sendFriendRequest', operation({ profileId, inviteToken: target.link.token }), ctx(from));
      if (!request.ok) throw new Error(JSON.stringify(request));
      return (await social.call('getSocial', {}, ctx(to))).result.social.incoming.find(item => item.from.profileId === request.result.social.profile.profileId);
    },
    async friends(a = 101, b = 202) { const request = await this.request(a, b); return social.call('respondFriendRequest', operation({ requestId: request.requestId, accept: true }), ctx(b)); },
  };
}

const expectUnavailable = (result) => { expect(result.ok).toBe(false); expect(result.error.code).toBe('PROFILE_UNAVAILABLE'); };
const expectNoPrivateFields = (value) => {
  const text = JSON.stringify(value);
  for (const field of ['telegramId', 'state_json', 'receipts', 'feathers', 'lastFeedAt', 'careMilestones', 'sleepUntil', 'initData', 'inviteToken', 'shareToken']) expect(text).not.toContain(field);
};

describe('v0.3 real SQLite social privacy and consent', () => {
  it('S01/S13 private defaults hide foreign birds by opaque id and never expose raw IDs', async () => {
    const f = socialFixture(); const a = await f.owner(); await f.owner(202);
    expect(a.visibility).toBe('private'); expect(a.collectionVisibility).toBe('private'); expect(a.profileId).toMatch(/^[a-f0-9]{64}$/);
    expectUnavailable(await f.callSocial('getPublicProfile', { profileId: a.profileId }, 202));
    expect((await f.callSocial('getPublicProfile', { profileId: '101' }, 202)).error.code).toBe('INVALID_REQUEST');
    expect((await f.callSocial('getPublicProfile', { profileId: a.profileId, userId: 101 }, 202)).error.code).toBe('INVALID_REQUEST');
  });
  it('foreign lookup never provisions a peer player or social profile', async () => {
    const f = socialFixture(); await f.owner(); const before = f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n;
    expectUnavailable(await f.callSocial('getPublicProfile', { profileId: 'f'.repeat(64) }));
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(before);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_social_profiles').get().n).toBe(1);
  });
  it('verified context is required, supplied actor fields are rejected', async () => {
    const f = socialFixture(); await f.owner();
    expect((await f.social.call('getSocial', {}, { user: { id: 101 } })).error.code).toBe('UNAUTHORIZED');
    expect((await f.callSocial('getSocial', { telegramId: 202 })).error.code).toBe('INVALID_REQUEST');
    expect((await f.callSocial('getSocial', {}, 999)).error.code).toBe('PROFILE_NOT_FOUND');
  });
  it('S02/S03 public view is exact whitelist while collection visibility remains separate', async () => {
    const f = socialFixture(); const a = await f.owner(); await f.owner(202);
    await f.callSocial('updatePrivacy', operation({ visibility: 'public', collectionVisibility: 'private', displayName: 'Захар' }));
    const viewed = await f.callSocial('getPublicProfile', { profileId: a.profileId }, 202);
    expect(viewed.result.profile.displayName).toBe('Захар'); expect(viewed.result.profile.activeChick).not.toBeNull();
    expect(viewed.result.profile.chicks).toBeNull(); expect(viewed.result.profile.collectionVisible).toBe(false); expectNoPrivateFields(viewed.result.profile);
    await f.callSocial('updatePrivacy', operation({ visibility: 'public', collectionVisibility: 'public' }));
    expect((await f.callSocial('getPublicProfile', { profileId: a.profileId }, 202)).result.profile.chicks).toHaveLength(1);
    await f.callSocial('updatePrivacy', operation({ visibility: 'private', collectionVisibility: 'public' }));
    expectUnavailable(await f.callSocial('getPublicProfile', { profileId: a.profileId }, 202));
  });
  it('S04/S05 explicit invite consent + explicit acceptance make exactly one reciprocal relation', async () => {
    const f = socialFixture(); const a = await f.owner(); const b = await f.owner(202);
    expectUnavailable(await f.callSocial('sendFriendRequest', operation({ profileId: b.profileId })));
    const request = await f.request(101, 202); expect(request.requestId).toMatch(/^[a-f0-9]{64}$/); expectNoPrivateFields(request);
    expect((await f.callSocial('respondFriendRequest', operation({ requestId: request.requestId, accept: true }))).error.code).toBe('REQUEST_NOT_INCOMING');
    const accepted = await f.callSocial('respondFriendRequest', operation({ requestId: request.requestId, accept: true }), 202);
    expect(accepted.result.social.friends).toHaveLength(1); expect(accepted.result.social.friends[0].profileId).toBe(a.profileId);
    expect((await f.callSocial('getSocial')).result.social.friends[0].profileId).toBe(b.profileId);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_friendships').get().n).toBe(1);
  });
  it('reciprocal requests never silently accept and wrong third-party requestId is rejected', async () => {
    const f = socialFixture(); const a = await f.owner(); await f.owner(202); await f.owner(303);
    const request = await f.request(101, 202);
    const reciprocal = await f.callSocial('sendFriendRequest', operation({ profileId: a.profileId }), 202);
    expect(reciprocal.result.social.incoming).toHaveLength(1); expect(reciprocal.result.social.friends).toHaveLength(0);
    expectUnavailable(await f.callSocial('respondFriendRequest', operation({ requestId: request.requestId, accept: true }), 303));
  });
  it('friends-only access requires accepted relation and separate collection permission', async () => {
    const f = socialFixture(); const a = await f.owner(); await f.owner(202); await f.owner(303);
    await f.callSocial('updatePrivacy', operation({ visibility: 'friends', collectionVisibility: 'friends' }));
    expectUnavailable(await f.callSocial('visitProfile', { profileId: a.profileId }, 202));
    await f.friends(); const allowed = await f.callSocial('visitProfile', { profileId: a.profileId }, 202);
    expect(allowed.result.profile.relationship).toBe('friend'); expect(allowed.result.profile.chicks).toHaveLength(1); expectNoPrivateFields(allowed.result.profile);
    expectUnavailable(await f.callSocial('visitProfile', { profileId: a.profileId }, 303));
  });
  it('S06 decline/remove/block revoke access; unblocking does not recreate friendship', async () => {
    const f = socialFixture(); const a = await f.owner(); const b = await f.owner(202);
    const request = await f.request(101, 202);
    await f.callSocial('respondFriendRequest', operation({ requestId: request.requestId, accept: false }), 202);
    expect((await f.callSocial('getSocial')).result.social.outgoing).toHaveLength(0);
    await f.friends(); await f.callSocial('updatePrivacy', operation({ visibility: 'friends', collectionVisibility: 'friends' }));
    await f.callSocial('removeFriend', operation({ profileId: b.profileId }));
    expectUnavailable(await f.callSocial('visitProfile', { profileId: a.profileId }, 202));
    await f.friends(); await f.callSocial('blockUser', operation({ profileId: b.profileId, blocked: true }));
    expect((await f.callSocial('getSocial')).result.social.blocked).toHaveLength(1); expect(await areFriends(f.database, 101, 202)).toBe(false);
    expectUnavailable(await f.callSocial('sendFriendRequest', operation({ profileId: a.profileId }), 202));
    await f.callSocial('blockUser', operation({ profileId: b.profileId, blocked: false }));
    expect(await areFriends(f.database, 101, 202)).toBe(false);
  });
  it('closed request IDs cannot accept a later fresh invitation from a stale screen', async () => {
    const f = socialFixture(); await f.owner(); await f.owner(202);
    const old = await f.request(101, 202);
    await f.callSocial('respondFriendRequest', operation({ requestId: old.requestId, accept: false }), 202);
    const fresh = await f.request(101, 202);
    expect(fresh.requestId).not.toBe(old.requestId);
    expectUnavailable(await f.callSocial('respondFriendRequest', operation({ requestId: old.requestId, accept: true }), 202));
    expect((await f.callSocial('respondFriendRequest', operation({ requestId: fresh.requestId, accept: true }), 202)).ok).toBe(true);
  });
  it('S08/S09 share links rotate/revoke, private invite only reveals consent label', async () => {
    const f = socialFixture(); const a = await f.owner(); await f.owner(202);
    const invite = await f.callSocial('createSocialLink', operation({ kind: 'invite' }));
    const invited = await f.callSocial('resolveSocialLink', { kind: 'invite', token: invite.result.link.token }, 202);
    expect(invited.result.profile.accessible).toBe(false); expect(invited.result.profile.activeChick).toBeNull(); expect(invited.result.profile.chicks).toBeNull();
    expect((await f.callSocial('createSocialLink', operation({ kind: 'profile' }))).error.code).toBe('PROFILE_PRIVATE');
    await f.callSocial('updatePrivacy', operation({ visibility: 'public', collectionVisibility: 'public' }));
    const original = await f.callSocial('createSocialLink', operation({ kind: 'profile' })); expect(original.result.link.url).toContain('https://t.me/chipperhatcherybot?startapp=p_');
    expect((await f.callSocial('resolveSocialLink', { kind: 'profile', token: original.result.link.token }, 202)).result.profile.profileId).toBe(a.profileId);
    const rotated = await f.callSocial('createSocialLink', operation({ kind: 'profile' })); expect(rotated.result.link.token).not.toBe(original.result.link.token);
    expectUnavailable(await f.callSocial('resolveSocialLink', { kind: 'profile', token: original.result.link.token }, 202));
    await f.callSocial('createSocialLink', operation({ kind: 'profile', revoke: true }));
    expectUnavailable(await f.callSocial('resolveSocialLink', { kind: 'profile', token: rotated.result.link.token }, 202));
  });
  it('private change revokes share token and read-only visit never writes foreign state', async () => {
    const f = socialFixture(); const a = await f.owner(); await f.owner(202);
    await f.callSocial('updatePrivacy', operation({ visibility: 'public', collectionVisibility: 'private' }));
    const share = await f.callSocial('createSocialLink', operation({ kind: 'profile' })); const before = await f.store.read('101');
    f.advance(3600000); const visit = await f.callSocial('visitProfile', { profileId: a.profileId }, 202); expect(visit.ok).toBe(true);
    expect(await f.store.read('101')).toEqual(before); await f.callSocial('updatePrivacy', operation({ visibility: 'private', collectionVisibility: 'private' }));
    expectUnavailable(await f.callSocial('resolveSocialLink', { kind: 'profile', token: share.result.link.token }, 202));
  });
  it('requested share chick is exact allowed bird; inactive birds cannot bypass collection privacy', async () => {
    const f = socialFixture(); const a = await f.owner(); await f.owner(202);
    const state = (await f.call('getHome')).state; const chickId = state.chicks[0].id;
    await f.callSocial('updatePrivacy', operation({ visibility: 'public', collectionVisibility: 'private' }));
    const link = await f.callSocial('createSocialLink', operation({ kind: 'chick', chickId }));
    expect((await f.callSocial('resolveSocialLink', { kind: 'chick', token: link.result.link.token, chickId }, 202)).result.profile.activeChick.id).toBe(chickId);
    const row = await f.store.read('101'); row.state.chicks.push({ ...row.state.chicks[0], id: randomUUID(), name: 'Вторая' }); await f.store.compareAndSwap('101', row.revision, row.state);
    expect((await f.callSocial('createSocialLink', operation({ kind: 'chick', chickId: row.state.chicks[1].id }))).error.code).toBe('COLLECTION_PRIVATE');
    expectUnavailable(await f.callSocial('getPublicProfile', { profileId: a.profileId, chickId: row.state.chicks[1].id }, 202));
  });
  it('S14 malformed and nonexistent tokens reject safely without secret fields', async () => {
    const f = socialFixture(); await f.owner();
    for (const token of ['', '../101', '💛', 'f'.repeat(65), '<script>']) expect((await f.callSocial('resolveSocialLink', { kind: 'invite', token })).error.code).toBe('INVALID_REQUEST');
    expectUnavailable(await f.callSocial('resolveSocialLink', { kind: 'invite', token: 'f'.repeat(64) }));
  });
  it('friend/profile helpers provide no owner IDs or private care fields', async () => {
    const f = socialFixture(); const a = await f.owner();
    expect(friendPairKey('202', '101')).toBe('101:202'); expect(await peerFor(f.database, 101)).toEqual({ profileId: a.profileId, displayName: a.displayName }); expect(await peerFor(f.database, 999)).toBeNull();
    expectNoPrivateFields(publicChick((await f.call('getHome')).state.chicks[0]));
  });
});

describe('v0.3 real SQLite social CAS, replay and rate limits', () => {
  it('S07 ten identical parallel requests produce one pair and one request', async () => {
    const f = socialFixture(); await f.owner(); const b = await f.owner(202);
    const invite = await f.callSocial('createSocialLink', operation({ kind: 'invite' }), 202);
    const payload = operation({ profileId: b.profileId, inviteToken: invite.result.link.token });
    const results = await Promise.all(Array.from({ length: 10 }, () => f.callSocial('sendFriendRequest', payload)));
    expect(results.every(result => result.ok)).toBe(true); expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_friendships').get().n).toBe(1);
    expect((await f.callSocial('getSocial', {}, 202)).result.social.incoming).toHaveLength(1);
  });
  it('accept/block race remains one atomic pair state and cannot grant blocked friendship', async () => {
    const f = socialFixture(); await f.owner(); const b = await f.owner(202); const request = await f.request(101, 202);
    await Promise.all([f.callSocial('respondFriendRequest', operation({ requestId: request.requestId, accept: true }), 202), f.callSocial('blockUser', operation({ profileId: b.profileId, blocked: true }))]);
    expect(await areFriends(f.database, 101, 202)).toBe(false); const row = f.sqlite.prepare('SELECT * FROM chipper_friendships').get(); expect(row.low_blocked).toBe(1); expect(row.status).toBe('removed');
  });
  it('lost response after profile commit retries the same receipt without rotating again', async () => {
    const f = socialFixture(); await f.owner(); const payload = operation({ kind: 'invite' }); f.lossAfter('UPDATE chipper_social_profiles');
    const lost = await f.callSocial('createSocialLink', payload); expect(lost.ok).toBe(false);
    const token = f.sqlite.prepare('SELECT invite_token FROM chipper_social_profiles').get().invite_token;
    const repeat = await f.callSocial('createSocialLink', payload); expect(repeat.ok).toBe(true); expect(repeat.result.link.token).toBe(token);
    expect((await f.callSocial('createSocialLink', { ...payload, kind: 'profile' })).error.code).toBe('OPERATION_CONFLICT');
  });
  it('lost friendship accept response retries durably and returns current permissions', async () => {
    const f = socialFixture(); await f.owner(); await f.owner(202); const request = await f.request(101, 202); const payload = operation({ requestId: request.requestId, accept: true });
    f.lossAfter('UPDATE chipper_friendships'); expect((await f.callSocial('respondFriendRequest', payload, 202)).ok).toBe(false);
    expect((await f.callSocial('respondFriendRequest', payload, 202)).result.social.friends).toHaveLength(1);
    expect((await f.callSocial('respondFriendRequest', { ...payload, accept: false }, 202)).error.code).toBe('OPERATION_CONFLICT');
  });
  it('late create-link retry cannot revive a revoked capability', async () => {
    const f = socialFixture(); await f.owner(); const payload = operation({ kind: 'invite' }); await f.callSocial('createSocialLink', payload);
    await f.callSocial('createSocialLink', operation({ kind: 'invite', revoke: true })); expect((await f.callSocial('createSocialLink', payload)).result.link).toBeNull();
  });
  it('S07 fixed-minute request/lookup rates enforce server-side retryAt and recover later', async () => {
    const f = socialFixture(); await f.owner(); const b = await f.owner(202); await f.callSocial('updatePrivacy', operation({ visibility: 'public', collectionVisibility: 'private' }), 202);
    for (let count = 0; count < 6; count += 1) expect((await f.callSocial('sendFriendRequest', operation({ profileId: b.profileId }))).ok).toBe(true);
    const limited = await f.callSocial('sendFriendRequest', operation({ profileId: b.profileId })); expect(limited.error.code).toBe('SOCIAL_RATE_LIMIT'); expect(limited.error.retryAt).toBeGreaterThan(f.now);
    for (let count = 0; count < 60; count += 1) expect((await f.callSocial('getPublicProfile', { profileId: b.profileId })).ok).toBe(true);
    expect((await f.callSocial('getPublicProfile', { profileId: b.profileId })).error.code).toBe('SOCIAL_RATE_LIMIT');
    f.advance(60000); expect((await f.callSocial('getPublicProfile', { profileId: b.profileId })).ok).toBe(true);
  });
  it('permission revocation immediately before atomic authorized read prevents disclosure', async () => {
    const f = socialFixture(); const a = await f.owner(); await f.owner(202); await f.callSocial('updatePrivacy', operation({ visibility: 'public', collectionVisibility: 'public' }));
    const database = { ...f.database, async get(sql, params) {
      if (sql.startsWith('SELECT p.*,v.state_json')) {
        await f.database.run("UPDATE chipper_social_profiles SET visibility='private',share_token=NULL,revision=revision+1 WHERE telegram_id=101");
      }
      return f.database.get(sql, params);
    } };
    const social = createSocialService({ database, gameService: f.service, now: () => f.now, id: randomUUID });
    expectUnavailable(await social.call('getPublicProfile', { profileId: a.profileId }, ctx(202)));
  });
});
