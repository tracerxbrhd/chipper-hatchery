import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DailyBonus } from '../src/community/DailyBonus';
import type { DailyBonusStatus } from '../src/types';

const serverNow = Date.UTC(2026, 9, 14, 23, 59);
const bonus: DailyBonusStatus = {
  available: true, rewardAmount: 1, dayUTC: Math.floor(serverNow / 86_400_000),
  lastClaimDayUTC: null, nextResetAt: Date.UTC(2026, 9, 15),
};

describe('daily bonus presentation uses the authoritative snapshot', () => {
  it('D10 renders explicit claim, exact reward, UTC rule and no streak', () => {
    const html = renderToStaticMarkup(createElement(DailyBonus, { bonus, serverNow, busy: false, onClaim() {} }));
    expect(html).toContain('Ежедневный подарок');
    expect(html).toContain('+1 пёрышко');
    expect(html).toContain('00:00 UTC');
    expect(html).toContain('Пропущенные дни не копятся');
    expect(html).toContain('Забрать');
    expect(html).not.toContain('disabled');
  });

  it('D10 keeps the claim disabled while a request is in progress', () => {
    const html = renderToStaticMarkup(createElement(DailyBonus, { bonus, serverNow, busy: true, onClaim() {} }));
    expect(html).toContain('disabled');
    expect(html).toContain('Сохраняем…');
  });

  it('D10 shows the server countdown after claim and never infers eligibility from the clock', () => {
    const claimed = { ...bonus, available: false, lastClaimDayUTC: bonus.dayUTC };
    const html = renderToStaticMarkup(createElement(DailyBonus, { bonus: claimed, serverNow, busy: false, onClaim() {}, compact: true }));
    expect(html).toContain('Подарок получен');
    expect(html).toContain('01:00');
    expect(html).not.toContain('Забрать');
    const midnight = renderToStaticMarkup(createElement(DailyBonus, { bonus: claimed, serverNow: bonus.nextResetAt + 1, busy: false, onClaim() {}, onRefresh() {} }));
    expect(midnight).toContain('Проверить');
    expect(midnight).not.toContain('Забрать');
  });
});
