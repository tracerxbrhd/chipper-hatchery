import { useState } from 'react';
import type { CareAction, Chick } from '../types';
import { normalizeName, ru, validName } from '../i18n';

export type IconName = 'home' | 'egg' | 'collection' | 'game' | 'settings' | 'feather' | 'feed' | 'play' | 'sleep' | 'back' | 'check' | 'refresh';
const paths: Record<IconName, string> = {
  home: 'm3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9',
  egg: 'M19 14c0 4-3 7-7 7s-7-3-7-7c0-5 4-11 7-11s7 6 7 11ZM9 12l3 2 3-3',
  collection: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  game: 'M9 5h6l2 3h2l3 9c1 4-3 5-5 2l-2-2H9l-2 2c-2 3-6 2-5-2l3-9h2ZM7 10v5M4.5 12.5h5M16 11h.01M19 14h.01',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',
  feather: 'M5 20 17 8M7 16c-2-5 2-12 9-13 5-1 6 3 3 7-2 4-5 6-12 6ZM10 13h6M13 10V6',
  feed: 'M4 13h16l-2 7H6ZM8 8l1-3M12 9V3M16 8l-1-3',
  play: 'M12 3 9 9l-6 1 5 5-1 6 5-3 5 3-1-6 5-5-6-1Z',
  sleep: 'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12ZM16 3h5l-5 5h5',
  back: 'm14 5-7 7 7 7', check: 'm5 12 4 4L19 6', refresh: 'M20 8a8 8 0 1 0 1 7M20 3v5h-5',
};
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export interface Preferences { sound: boolean; animation: boolean; haptics: boolean }
export type PetMotion = 'idle' | 'happy' | 'feed' | 'play' | 'sleepy' | 'sleep' | 'hatch' | 'grow';
export interface ViewProps {
  busy: boolean; now: number; reducedMotion: boolean;
}
export const rewardReadyAt = (last: number | null) => last === null ? 0 : last + 20 * 3_600_000;
export const careReadyAt = (last: number | null) => last === null ? 0 : last + 4 * 3_600_000;
export const isSleeping = (chick: Chick, now: number) => chick.sleepUntil !== null && chick.sleepUntil > now;

export function NameForm({ initial, busy, onSave, onSkip }: { initial: string; busy: boolean; onSave: (name: string) => void; onSkip?: () => void }) {
  const [name, setName] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const invalid = attempted && !validName(name);
  return <form className="name-form" onSubmit={event => { event.preventDefault(); setAttempted(true); if (validName(name)) onSave(normalizeName(name)); }}>
    <label htmlFor="chick-name">{ru.nameLabel}</label>
    <input id="chick-name" value={name} onChange={event => setName(event.target.value)} placeholder={ru.namePlaceholder} autoComplete="off" disabled={busy} aria-invalid={invalid} aria-describedby="name-hint" />
    <p id="name-hint" className={invalid ? 'field-error' : 'muted'}>{invalid ? ru.nameInvalid : ru.nameHint}</p>
    <button className="button primary" type="submit" disabled={busy}>{busy ? ru.saving : ru.nameSave}</button>
    {onSkip && <button className="button text-button" type="button" disabled={busy} onClick={onSkip}>{ru.skipName}</button>}
  </form>;
}

export function Needs({ chick }: { chick: Chick }) {
  return <div className="needs" aria-label={ru.needs}>
    {(['hunger', 'mood', 'energy'] as const).map(key => <div className={`need ${key}`} key={key}>
      <div className="need-label"><span>{ru[key]}</span><span>{Math.round(chick[key])}</span></div>
      <div className="need-track" role="meter" aria-label={ru[key]} aria-valuenow={Math.round(chick[key])} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${chick[key]}%` }} /></div>
    </div>)}
  </div>;
}

export const actionIcons: Record<CareAction, IconName> = { feed: 'feed', play: 'play', sleep: 'sleep' };
