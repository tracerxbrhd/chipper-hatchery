import { useEffect, useId, useRef, useState } from 'react';
import type { GuestChickDTO, Peer } from '../types';
import './guest.css';

export interface FriendOnWorldPickerProps {
  friends: Peer[];
  guest: GuestChickDTO | null;
  busy: boolean;
  onSelect: (profileId: string) => void;
  onClear: () => void;
  onRefresh: () => void;
  error?: string | null;
}

export function FriendOnWorldPicker({ friends, guest, busy, onSelect, onClear, onRefresh, error }: FriendOnWorldPickerProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: globalThis.PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [open]);

  return <div className="friend-world-picker" ref={root}>
    <button type="button" className={`friend-world-toggle ${guest ? 'has-guest' : ''}`} aria-expanded={open} aria-controls={panelId}
      aria-label={guest ? 'Гость на поляне' : 'Позвать друга'} disabled={busy} onClick={() => { if (!open) onRefresh(); setOpen(!open); }}>
      <svg viewBox="0 0 28 24" width="23" height="21" fill="none" aria-hidden="true"><path d="M12 17c0-4 1-7 5-7 3 0 5 3 5 6 0 3-2 5-5 5s-5-1-5-4Zm-8-3c0-3 1-6 4-6 2 0 4 2 4 5M18 10c-2 0-4-1-4-4 0-2 2-4 4-4s4 2 4 4c0 2-1 4-4 4ZM8 8C6 8 5 7 5 5c0-2 1-3 3-3s3 1 3 3c0 1-1 3-3 3Zm14 5 3 1-3 1M4 17l-1 3m12 0v2m5-2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>{guest ? 'Гость' : 'Позвать'}</span>
    </button>
    {open && <div className="friend-world-panel" id={panelId} role="region" aria-label="Друг на поляне">
      <div className="friend-world-panel-heading"><strong>Друг на поляне</strong><button type="button" className="friend-world-close" aria-label="Закрыть выбор гостя" onClick={() => setOpen(false)}>×</button></div>
      <p>Птенец друга погуляет рядом. Заботиться можно только о своём.</p>
      {error && <p className="friend-world-error" role="status">{error}</p>}
      {guest && <div className="friend-world-current"><strong>{guest.displayName}</strong><span>{guest.chick ? `${guest.chick.name} сейчас в гостях` : 'У друга пока нет активного птенца'}</span><button type="button" disabled={busy} onClick={() => { onClear(); setOpen(false); }}>Убрать гостя</button></div>}
      {!friends.length ? <p className="friend-world-empty">Друзей пока нет. Приглашения находятся в «Профиль → Друзья и видимость».</p>
        : <ul className="friend-world-list">{friends.map(friend => <li key={friend.profileId}>
          <button type="button" aria-label={`Позвать: ${friend.displayName}`} aria-pressed={guest?.profileId === friend.profileId}
            disabled={busy || friend.canVisit === false} onClick={() => { onSelect(friend.profileId); setOpen(false); }}>
            <span><strong>{friend.displayName}</strong><small>{friend.canVisit === false ? 'Друг закрыл просмотр птенца' : guest?.profileId === friend.profileId ? 'Уже в гостях' : 'Позвать активного птенца'}</small></span><span aria-hidden="true">{guest?.profileId === friend.profileId ? '✓' : '↗'}</span>
          </button>
        </li>)}</ul>}
      <button type="button" className="friend-world-refresh" disabled={busy} onClick={onRefresh}>Обновить друзей</button>
      <small className="friend-world-local-note">Гость гуляет в этой сцене. Его движения локальные.</small>
    </div>}
  </div>;
}
