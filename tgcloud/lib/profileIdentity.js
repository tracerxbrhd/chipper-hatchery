/** Private presentation metadata. ctx.initData is verified by Serverless before
 * endpoints run; no client body or initDataUnsafe is accepted here.
 * Telegram's photo_url is optional, so unsupported origins use initials.
 * https://core.telegram.org/bots/webapps#webappuser
 */
const NAME_LIMIT = 80;
const PHOTO_LIMIT = 1024;
const isControl = character => { const code = character.codePointAt(0); return code <= 31 || (code >= 127 && code <= 159); };

export function sanitizeTelegramName(value) {
  if (typeof value !== 'string') return '';
  const printable = Array.from(value).filter(character => !isControl(character)).join('');
  return Array.from(printable.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim()).slice(0, NAME_LIMIT).join('');
}

export function sanitizeTelegramPhotoUrl(value) {
  if (typeof value !== 'string' || value.length > PHOTO_LIMIT || /[\s\\]/.test(value) || Array.from(value).some(isControl)) return null;
  // Use a strict authority parser rather than permissive suffix matches. This
  // also works in the SDK V8 runtime without requiring a URL constructor.
  const match = /^https:\/\/([a-z0-9.-]+)(\/[^#]*)?$/i.exec(value);
  if (!match) return null;
  const host = match[1].toLowerCase();
  const telegramHost = host === 't.me' || host === 'telegram.org' || /^(?:[a-z0-9-]+\.)+telegram\.org$/.test(host) || /^(?:[a-z0-9-]+\.)?telegram-cdn\.org$/.test(host);
  if (!telegramHost || host === 'api.telegram.org' || /\/bot[^/]*\//i.test(match[2] ?? '')) return null;
  return value;
}

function identityOwner(ctx) {
  const value = ctx?.initData?.user?.id;
  const numeric = typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(numeric) && numeric > 0 ? String(numeric) : null;
}

export function verifiedProfileIdentity(ctx, now) {
  if (!identityOwner(ctx) || !Number.isSafeInteger(now) || now < 0) return null;
  const user = ctx.initData.user;
  const username = typeof user.username === 'string' && /^[a-z0-9_]{1,32}$/i.test(user.username) ? user.username : null;
  return {
    firstName: sanitizeTelegramName(user.first_name),
    lastName: sanitizeTelegramName(user.last_name),
    username,
    photoUrl: sanitizeTelegramPhotoUrl(user.photo_url),
    verifiedAt: now,
  };
}

/** Called inside the owner's existing CAS. Missing optional fields clear stale
 * profile metadata; the independent Chipper display_name is never touched.
 * Returns true only when presentation metadata actually changes.
 */
export function refreshProfileIdentity(state, ctx, now) {
  if (!state?.player || identityOwner(ctx) !== String(state.player.telegramId)) return false;
  const next = verifiedProfileIdentity(ctx, now);
  if (!next) return false;
  const previous = state.player.telegramIdentity;
  const unchanged = previous && ['firstName', 'lastName', 'username', 'photoUrl'].every(key => previous[key] === next[key]) && Number.isSafeInteger(previous.verifiedAt) && previous.verifiedAt >= 0;
  if (unchanged) return false;
  state.player.telegramIdentity = next;
  return true;
}
