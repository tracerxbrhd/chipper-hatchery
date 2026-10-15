import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fixture, ctx, operation } from './helpers.js';
import { createGuestService } from '../tgcloud/lib/guestService.js';

async function guestFixture() {
  const f = fixture();
  for (const owner of [101, 202, 303]) await f.initial(owner);
  const profileId = owner => String(owner).padStart(64, '0');
  for (const owner of [101, 202, 303]) f.sqlite.prepare(`INSERT INTO chipper_social_profiles
    (telegram_id,public_id,display_name,visibility,updated_at) VALUES(?,?,?,'friends',?)`)
    .run(owner, profileId(owner), `Гнездо ${owner}`, f.now);
  f.sqlite.prepare(`INSERT INTO chipper_friendships(pair_key,friendship_id,low_id,high_id,requested_by,status,created_at,updated_at)
    VALUES('101:202',?,101,202,101,'accepted',?,?)`).run('a'.repeat(64), f.now, f.now);
  const calls = [];
  const database = {};
  let beforeLookup = null;
  for (const kind of ['get', 'all', 'run']) database[kind] = async (query, params) => {
    calls.push({ kind, query, params });
    if (beforeLookup && query.includes('AS chick_json')) { const hook = beforeLookup; beforeLookup = null; await hook(); }
    return f.database[kind](query, params);
  };
  const guests = createGuestService({ database, gameService: f.service, now: () => f.now });
  return { ...f, get now() { return f.now; }, profileId, calls, guests,
    lookup(owner = 202, actor = 101) { return guests.call('getGuestChick', { profileId: profileId(owner) }, ctx(actor)); },
    beforeLookup(hook) { beforeLookup = hook; },
    privacy(owner, visibility) { f.sqlite.prepare('UPDATE chipper_social_profiles SET visibility=? WHERE telegram_id=?').run(visibility, owner); },
    relationship(status, lowBlocked = 0, highBlocked = 0) {
      f.sqlite.prepare('UPDATE chipper_friendships SET status=?,low_blocked=?,high_blocked=? WHERE pair_key=?').run(status, lowBlocked, highBlocked, '101:202');
    },
  };
}

function unavailable(result) { expect(result.ok).toBe(false); expect(result.error.code).toBe('PROFILE_UNAVAILABLE'); }

describe('v0.4 friend guest permission and visual DTO in real SQLite', () => {
  it('F01/F03 accepted friends receive one exact visual whitelist without foreign state writes', async () => {
    const f = await guestFixture();
    const peer = await f.store.read('202');
    peer.state.player.telegramIdentity = { firstName: 'Секретное имя', username: 'private_tag', photoUrl: 'https://t.me/private.jpg' };
    await f.store.compareAndSwap('202', peer.revision, peer.state);
    const before = await f.store.read('202'); f.advance(3_600_000);
    const response = await f.lookup(); expect(response.ok).toBe(true);
    const guest = response.result.guest;
    expect(Object.keys(guest).sort()).toEqual(['checkedAt', 'chick', 'displayName', 'profileId']);
    expect(guest.checkedAt).toBe(f.now); expect(guest.chick.id).toBe(before.state.player.activeChickId);
    expect(Object.keys(guest.chick).sort()).toEqual(['appearanceId', 'appearanceVersion', 'bornAt', 'genes', 'id', 'name', 'rarity', 'stage']);
    for (const secret of ['telegramId', 'telegramIdentity', 'firstName', 'username', 'photoUrl', 'state_json', 'receipts', 'careMilestones', 'sleepUntil', 'feathers', 'hunger']) {
      expect(JSON.stringify(guest)).not.toContain(secret);
    }
    expect(await f.store.read('202')).toEqual(before);
    expect(f.calls.filter(call => call.query.includes('AS chick_json'))).toHaveLength(1);
    expect(f.calls.filter(call => call.kind === 'run').every(call => call.query.includes('chipper_social_limits'))).toBe(true);
  });
  it('F06/F07 privacy and accepted consent are independently required, even for public profiles', async () => {
    const f = await guestFixture();
    f.privacy(202, 'private'); unavailable(await f.lookup());
    f.privacy(202, 'friends'); expect((await f.lookup()).ok).toBe(true);
    f.privacy(202, 'public'); expect((await f.lookup()).ok).toBe(true);
    for (const status of ['pending', 'declined', 'removed']) { f.relationship(status); unavailable(await f.lookup()); }
    f.privacy(303, 'public'); unavailable(await f.lookup(303));
    unavailable(await f.lookup(101));
  });
  it('F06 either direction block revokes access, with no remembered permission fallback', async () => {
    const f = await guestFixture();
    for (const [low, high] of [[1, 0], [0, 1], [1, 1]]) { f.relationship('accepted', low, high); unavailable(await f.lookup()); }
    f.relationship('accepted'); expect((await f.lookup()).ok).toBe(true);
    f.beforeLookup(() => f.relationship('removed'));
    unavailable(await f.lookup());
  });
  it('F05 always returns the currently active bird, keeping hidden collection private', async () => {
    const f = await guestFixture();
    const first = (await f.lookup()).result.guest.chick;
    const row = await f.store.read('202');
    const replacement = structuredClone(row.state.chicks[0]); replacement.id = randomUUID(); replacement.name = 'Новый друг';
    row.state.chicks.push(replacement); row.state.player.activeChickId = replacement.id;
    await f.store.compareAndSwap('202', row.revision, row.state);
    const second = (await f.lookup()).result.guest.chick;
    expect(second.id).not.toBe(first.id); expect(second.id).toBe(replacement.id);
    expect(second.name).toBe('Новый друг');
    expect(JSON.stringify(second)).not.toContain(first.id);
  });
  it('current age stage is computed on the visual clone without reconciling the friend save', async () => {
    const f = await guestFixture(); const row = await f.store.read('202');
    row.state.chicks[0].bornAt = f.now - 96 * 3_600_000;
    row.state.chicks[0].careMilestones = [f.now - 48 * 3_600_000, f.now - 24 * 3_600_000, f.now - 8 * 3_600_000];
    await f.store.compareAndSwap('202', row.revision, row.state);
    const before = await f.store.read('202');
    expect((await f.lookup()).result.guest.chick.stage).toBe('adult');
    expect(await f.store.read('202')).toEqual(before);
  });
  it('F08 no active bird or unfinished peer onboarding returns an empty authorized guest', async () => {
    const f = await guestFixture(); const row = await f.store.read('202');
    row.state.player.onboarding = 'name'; await f.store.compareAndSwap('202', row.revision, row.state);
    expect((await f.lookup()).result.guest.chick).toBeNull();
    const empty = await f.store.read('202'); empty.state.player.onboarding = 'done'; empty.state.chicks = []; empty.state.player.activeChickId = null;
    await f.store.compareAndSwap('202', empty.revision, empty.state);
    expect((await f.lookup()).result.guest.chick).toBeNull();
  });
  it('F07/F08 forged identity/extra fields reject and unknown account is never bootstrapped', async () => {
    const f = await guestFixture(); const count = () => f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n;
    const before = count();
    expect((await f.guests.call('getGuestChick', { profileId: f.profileId(202) }, { user: { id: 101 } })).error.code).toBe('UNAUTHORIZED');
    for (const input of [{ profileId: f.profileId(202), telegramId: 202 }, { profileId: '202' }, {}, { profileId: f.profileId(202), chickId: 'another' }]) {
      expect((await f.guests.call('getGuestChick', input, ctx())).error.code).toBe('INVALID_REQUEST');
    }
    expect((await f.lookup(202, 999)).error.code).toBe('PROFILE_NOT_FOUND');
    expect(count()).toBe(before);
    unavailable(await f.guests.call('getGuestChick', { profileId: 'f'.repeat(64) }, ctx()));
    await f.call('bootstrap', {}, 404);
    expect((await f.lookup(202, 404)).error.code).toBe('ONBOARDING_REQUIRED');
  });
  it('read budget is concurrent-safe and shared with v0.3 social lookups', async () => {
    const f = await guestFixture();
    const responses = await Promise.all(Array.from({ length: 70 }, () => f.lookup()));
    expect(responses.filter(result => result.ok)).toHaveLength(60);
    expect(responses.filter(result => !result.ok).every(result => result.error.code === 'SOCIAL_RATE_LIMIT')).toBe(true);
    f.advance(60_000);
    expect((await f.lookup()).ok).toBe(true);
    f.sqlite.prepare('UPDATE chipper_social_limits SET count=60 WHERE key=?').run('101:lookup');
    const limited = await f.lookup(); expect(limited.error.code).toBe('SOCIAL_RATE_LIMIT'); expect(limited.error.retryAt).toBeGreaterThan(f.now);
  });
  it('guest identifiers never permit foreign care, rename or activation', async () => {
    const f = await guestFixture(); const guest = (await f.lookup()).result.guest;
    const before = await f.store.read('202');
    for (const [method, params] of [['careAction', { chickId: guest.chick.id, action: 'feed' }], ['renameChick', { chickId: guest.chick.id, name: 'Подмена' }], ['activateChick', { chickId: guest.chick.id }]]) {
      const result = await f.call(method, operation(params)); expect(result.ok).toBe(false); expect(result.error.code).toBe('CHICK_NOT_FOUND');
    }
    expect(await f.store.read('202')).toEqual(before);
  });
});
