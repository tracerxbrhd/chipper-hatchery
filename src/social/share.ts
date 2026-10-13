import type { PublicChick, SocialLink } from '../types';
import { renderChickSvg } from '../chicks/renderer';
import { getAppearanceLabel } from '../chicks/models';
import { ru } from '../i18n';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));
export function cardSvg(chick: PublicChick, url: string): string {
  const urlLines = (url.match(/.{1,90}/g) ?? ['']).map((line, index) => `<tspan x="360" dy="${index === 0 ? 0 : 15}">${escape(line)}</tspan>`).join('');
  const bird = renderChickSvg({ chick, shadow: true, pose: 'idle', id: 'share-card' }).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900"><rect width="720" height="900" rx="48" fill="#F5F6F3"/><circle cx="360" cy="345" r="250" fill="#E5EBE3"/><text x="360" y="82" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#697571" letter-spacing="5">CHIPPER HATCHERY</text><svg x="100" y="110" width="520" height="520" viewBox="0 0 320 320">${bird}</svg><text x="360" y="672" text-anchor="middle" font-family="sans-serif" font-size="42" font-weight="bold" fill="#252C2A">${escape(chick.name)}</text><text x="360" y="720" text-anchor="middle" font-family="sans-serif" font-size="25" fill="#697571">${escape(ru.stage[chick.stage])} · ${escape(ru.rarities[chick.rarity])}</text><text x="360" y="762" text-anchor="middle" font-family="sans-serif" font-size="21" fill="#697571">${escape(getAppearanceLabel(chick))}</text><text x="360" y="818" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#6D8F78">Загляните в мой маленький мир</text><text x="360" y="842" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#697571">${urlLines}</text></svg>`;
}
export async function exportCard(chick: PublicChick, link: SocialLink) {
  const svg = new Blob([cardSvg(chick, link.url)], { type: 'image/svg+xml' });
  const objectUrl = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 900;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Карточка недоступна');
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось создать карточку')), 'image/png'));
    const download = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = download; anchor.download = 'chipper-card.png'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(download), 30_000);
  } finally { URL.revokeObjectURL(objectUrl); }
}
export async function copyLink(url: string) {
  await navigator.clipboard.writeText(url);
}
export function telegramShare(link: SocialLink, text = 'Мой маленький мир в Chipper') {
  const url = `https://t.me/share/url?url=${encodeURIComponent(link.url)}&text=${encodeURIComponent(text)}`;
  const app = window.Telegram?.WebApp as unknown as { openTelegramLink?: (url: string) => void } | undefined;
  if (app?.openTelegramLink) app.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
export function launchIntent(): Pick<SocialLink, 'kind' | 'token' | 'chickId'> | null {
  const app = window.Telegram?.WebApp as unknown as { initDataUnsafe?: { start_param?: string } } | undefined;
  const value = app?.initDataUnsafe?.start_param ?? new URLSearchParams(location.search).get('tgWebAppStartParam');
  if (!value || value.length > 512 || !/^[a-zA-Z0-9_-]+$/.test(value)) return null;
  const [prefix, token, chickId, extra] = value.split('_');
  if (extra || !token || !/^[a-f0-9]{64}$/.test(token) || !['i', 'p', 'c'].includes(prefix)
    || (prefix === 'c' ? !chickId || !/^[a-zA-Z0-9.-]{1,128}$/.test(chickId) : chickId !== undefined)) return null;
  return { kind: prefix === 'i' ? 'invite' : prefix === 'p' ? 'profile' : 'chick', token, ...(prefix === 'c' ? { chickId } : {}) };
}
