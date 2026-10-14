import { useState } from 'react';
import type { TelegramIdentity } from '../types';
import { telegramInitials } from './avatar';
import './profile.css';

export function TelegramIdentityCard({ identity }: { identity?: TelegramIdentity | null }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const name = [identity?.firstName, identity?.lastName].filter(Boolean).join(' ') || 'Ваш профиль Telegram';
  const photo = identity?.photoUrl && failedPhoto !== identity.photoUrl ? identity.photoUrl : null;
  return <article className="telegram-identity-card glass-surface" aria-label="Ваш профиль Telegram">
    <div className="telegram-identity-main">
      <div className="telegram-avatar" data-avatar={photo ? 'photo' : 'initials'}>
        {photo ? <img key={photo} src={photo} alt={`Аватар: ${name}`} width="72" height="72" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedPhoto(photo)} /> : <span aria-label="Инициалы профиля">{telegramInitials(identity?.firstName ?? '', identity?.lastName ?? '')}</span>}
      </div>
      <div className="telegram-identity-copy">
        <p className="eyebrow">Telegram</p>
        <h2>{name}</h2>
        <p className="telegram-username">{identity?.username ? `@${identity.username}` : 'Без @username'}</p>
      </div>
    </div>
    <p className="telegram-identity-private"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="6" y="10" width="12" height="10" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" /></svg>Эти данные видны только вам</p>
  </article>;
}
