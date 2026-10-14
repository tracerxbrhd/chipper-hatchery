import { test, expect, type Page } from '@playwright/test';
import { operation } from '../helpers.js';
import { BALANCE } from '../../tgcloud/lib/domain.js';
import { nativeBridge, qa03Path, socialFixture } from './v03-fixtures';
import type { ApiResult, Method } from '../../src/types';

async function openSocial(page: Page) {
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: 'Друзья и видимость', exact: true }).click();
  await expect(page.getByLabel('Видимость профиля', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обновить друзей и подарки', exact: true })).toBeEnabled();
}
function dispatch(f: Awaited<ReturnType<typeof socialFixture>>) {
  return (method: Method, input: Record<string, unknown>, identity: string) => f.dispatch(method, input, identity.endsWith('B') ? 202 : identity.endsWith('C') ? 303 : 101);
}
function result(response: ApiResult) { if (!response.ok) throw new Error(`Synthetic fixture failed: ${response.error.code}`); return response.result!; }

test('v0.3 synthetic production invite consent, read-only visit and actual gift preserve one owner', async ({ page, context }) => {
  const f = await socialFixture(); await f.initial(); await f.initial(202);
  await f.seedFeathers(6); const egg = await f.call('buyEgg', operation());
  if (!egg.ok) throw new Error('Failed to prepare synthetic gift');
  f.advance(BALANCE.incubationMs); const hatch = await f.call('hatchEgg', operation({ eggId: egg.result.eggId }));
  if (!hatch.ok) throw new Error('Failed to hatch synthetic gift');
  const gifted = hatch.state.chicks.find(chick => chick.id !== hatch.state.player.activeChickId)!;
  await f.dispatch('updatePrivacy', operation({ visibility: 'private', collectionVisibility: 'private', displayName: 'Гнездо А' }));
  await f.dispatch('updatePrivacy', operation({ visibility: 'private', collectionVisibility: 'private', displayName: 'Гнездо Б' }), 202);
  await nativeBridge(page, dispatch(f), { theme: 'dark' }); await openSocial(page);
  await expect(page.getByLabel('Видимость профиля', { exact: true })).toHaveValue('private');
  await page.getByRole('button', { name: 'Пригласить друга', exact: true }).click();
  const inviteUrl = await page.getByLabel('Ссылка Chipper', { exact: true }).inputValue();
  expect(inviteUrl).toMatch(/^https:\/\/t\.me\/chipperhatcherybot\?startapp=i_/);
  expect(new URL(inviteUrl).searchParams.get('startapp')).toMatch(/^i_[a-f0-9]{64}$/);
  await page.screenshot({ path: qa03Path('social-private-invite-dark.png') });
  const guest = await context.newPage();
  await nativeBridge(guest, dispatch(f), { identity: 'B', startParam: new URL(inviteUrl).searchParams.get('startapp')! });
  await expect(guest.locator('.visit-screen')).toContainText('Мир пока закрыт');
  await expect(guest.locator('.visit-world')).toHaveCount(0);
  await guest.getByRole('button', { name: 'Предложить дружбу', exact: true }).click();
  await expect(guest.locator('.visit-screen')).toContainText('Запрос отправлен');
  await expect(guest.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Обновить друзей и подарки', exact: true }).click();
  await expect(page.getByText('Хочет подружиться', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Принять', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Друзья · 1', exact: true })).toBeVisible();
  await page.getByLabel('Видимость профиля', { exact: true }).selectOption('friends');
  await page.getByLabel('Видимость коллекции', { exact: true }).selectOption('private');
  await page.getByRole('button', { name: 'Сохранить видимость', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Предложить подарок', exact: true })).toBeDisabled();
  await guest.getByRole('button', { name: 'К друзьям', exact: true }).click();
  await expect(guest.getByRole('heading', { name: 'Друзья · 1', exact: true })).toBeVisible();
  await guest.getByRole('button', { name: 'Заглянуть в гости', exact: true }).click();
  await expect(guest.locator('.visit-world .living-world')).toHaveAttribute('data-read-only', 'true');
  await expect(guest.getByRole('button', { name: /Покормить|Поиграть|Спать|Изменить имя|Позвать домой/ })).toHaveCount(0);
  await expect(guest.locator('.guest-collection')).toHaveCount(0);
  const ownerBeforeVisit = await f.store.read('101');
  await guest.locator('.world-chick-action').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true });
  await guest.waitForTimeout(300); await expect(guest.locator('.living-world')).toHaveAttribute('data-gesture', 'idle');
  expect((await f.store.read('101')).state.chicks).toEqual(ownerBeforeVisit.state.chicks);
  await guest.screenshot({ path: qa03Path('social-read-only-visit-dark.png') });
  await page.getByLabel('Цыплёнок для подарка', { exact: true }).selectOption(gifted.id);
  const bProfile = result(await f.dispatch('getSocial', {}, 202)).social.profile.profileId;
  await page.getByLabel('Получатель подарка', { exact: true }).selectOption(bProfile);
  await page.getByRole('button', { name: 'Предложить подарок', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(page.locator('.gift-row')).toContainText('Ждёт ответа');
  await page.locator('.gift-row').scrollIntoViewIfNeeded();
  await page.screenshot({ path: qa03Path('gift-pending-dark.png') });
  await guest.getByRole('button', { name: 'К друзьям', exact: true }).click();
  await expect(guest.getByRole('button', { name: 'Принять подарок', exact: true })).toBeVisible();
  await guest.getByRole('button', { name: 'Принять подарок', exact: true }).click();
  await guest.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(guest.locator('.gift-row')).toContainText('Принят');
  await guest.locator('.gift-row').scrollIntoViewIfNeeded();
  const aState = (await f.store.read('101')).state; const bState = (await f.store.read('202')).state;
  expect(aState.chicks.filter(chick => chick.id === gifted.id)).toHaveLength(0);
  expect(bState.chicks.filter(chick => chick.id === gifted.id)).toHaveLength(1);
  const received = bState.chicks.find(chick => chick.id === gifted.id)!;
  expect(received.genes).toEqual(gifted.genes); expect(received.name).toBe(gifted.name); expect(received.bornAt).toBe(gifted.bornAt);
  expect(aState.chicks.find(chick => chick.id === aState.player.activeChickId)).toBeTruthy(); expect(bState.player.feathers).toBe(0);
  await guest.screenshot({ path: qa03Path('gift-accepted-dark.png') });
  await guest.close();
});

test('v0.3 new synthetic player returns to private invite after onboarding without exposing birds', async ({ page }) => {
  const f = await socialFixture(); await f.initial();
  const invitation = result(await f.dispatch('createSocialLink', operation({ kind: 'invite' }))).link;
  await nativeBridge(page, dispatch(f), { identity: 'C', startParam: new URL(invitation.url).searchParams.get('startapp')! });
  await expect(page.locator('.onboarding')).toBeVisible();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: 'Коснитесь яйца', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Привет, маленький!', exact: true })).toBeVisible();
  await page.getByLabel('Имя цыплёнка', { exact: true }).fill('Гость'); await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await expect(page.locator('.visit-screen')).toContainText('Мир пока закрыт');
  await expect(page.getByRole('button', { name: 'Предложить дружбу', exact: true })).toBeVisible();
  expect((await f.store.read('303')).state.chicks).toHaveLength(1);
  await page.screenshot({ path: qa03Path('social-onboarding-return-dark.png') });
});

test('v0.3 shared original chick PNG and privacy revocation do not expose private state', async ({ page }) => {
  const f = await socialFixture(); const birdId = await f.initial(); await f.initial(202);
  await f.dispatch('updatePrivacy', operation({ visibility: 'public', collectionVisibility: 'private' }));
  await nativeBridge(page, dispatch(f), { theme: 'light' });
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click(); await page.locator('.collection-card').first().click();
  await page.getByRole('button', { name: 'Поделиться карточкой', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Карточка: Цып №1', exact: true })).toBeVisible();
  const url = await page.getByLabel('Ссылка Chipper', { exact: true }).inputValue(); const start = new URL(url).searchParams.get('startapp')!;
  const token = start.split('_')[1];
  const shared = result(await f.dispatch('resolveSocialLink', { kind: 'chick', token, chickId: birdId }, 202)).profile;
  expect(shared.activeChick.id).toBe(birdId); expect(shared.chicks).toBeNull();
  for (const forbidden of ['telegramId', 'feathers', 'receipts', 'hunger', 'mood', 'energy', 'sleepUntil']) expect(JSON.stringify(shared)).not.toContain(`"${forbidden}"`);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Сохранить карточку PNG', exact: true }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe('chipper-card.png');
  await download.saveAs(qa03Path('shared-chick-card.png'));
  await page.getByRole('button', { name: 'Отозвать публичные ссылки', exact: true }).click();
  await expect(page.getByLabel('Ссылка Chipper', { exact: true })).toHaveCount(0);
  const revoked = await f.dispatch('resolveSocialLink', { kind: 'chick', token, chickId: birdId }, 202); expect(revoked.ok).toBe(false);
});

test('v0.3 malformed launch intent safely opens Home without a profile lookup or crash', async ({ page }) => {
  const f = await socialFixture(); await f.initial(); const methods: Method[] = []; const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await nativeBridge(page, async (method, input, identity) => { methods.push(method); return dispatch(f)(method, input, identity); }, { startParam: '../invalid-social-intent' });
  await expect(page.locator('.home-screen')).toBeVisible(); await expect(page.locator('.visit-screen')).toHaveCount(0);
  expect(methods).not.toContain('resolveSocialLink'); expect(errors).toEqual([]);
});
