import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DailyBonus } from '../community/DailyBonus';
import type { CareAction, Chick, GuestChickDTO, Snapshot, Stage } from '../types';
import { ChickArt } from '../components/ChickArt';
import { getAppearanceLabel, visualDetailsFor } from '../chicks/models';
import { CompareChicks } from '../chicks/CompareChicks';
import { HomeWorld } from '../world/HomeWorld';
import { ageText, birthText, duration, ru } from '../i18n';
import { actionIcons, careReadyAt, Icon, isSleeping, NameForm, Needs, rewardReadyAt, type PetMotion, type Preferences, type ViewProps } from './Elements';

export function Home({ state, motion, onCare, onCard, onTouchFeedback, guest, guestControls, onDailyClaim, onDailyRefresh, ...view }: ViewProps & { state: Snapshot; motion: PetMotion; onCare: (action: CareAction) => void; onCard: (id: string) => void; onTouchFeedback?: (kind: string) => void; guest?: GuestChickDTO | null; guestControls?: ReactNode; onDailyClaim?: () => void; onDailyRefresh?: () => void }) {
  const [careTipOpen, setCareTipOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const dailyRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dailyOpen) return;
    const close = (event: globalThis.PointerEvent) => { if (!dailyRoot.current?.contains(event.target as Node)) setDailyOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setDailyOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [dailyOpen]);
  const chick = state.chicks.find(item => item.id === state.player.activeChickId);
  if (!chick) return <div className="empty-state"><h1>{ru.emptyCollection}</h1><p>{ru.emptyCollectionBody}</p></div>;
  const sleeping = isSleeping(chick, view.now);
  const awaitingWake = chick.sleepUntil !== null && chick.sleepUntil <= view.now;
  const status = sleeping ? ru.sleeping : awaitingWake ? ru.sleepSync : motion === 'feed' ? ru.fed : motion === 'play' ? ru.played : chick.energy < 50 ? ru.sleepy : chick.hunger < 50 ? ru.hungry : ru.homeGreeting;
  const careRemaining = rewardReadyAt(state.player.careRewardAt) - view.now;
  const recentFeed = chick.lastFeedAt !== null && view.now - chick.lastFeedAt <= 30 * 60_000;
  const recentPlay = chick.lastPlayAt !== null && view.now - chick.lastPlayAt <= 30 * 60_000;
  const cycleHint = recentFeed && !recentPlay ? ru.careStartedFeed : recentPlay && !recentFeed ? ru.careStartedPlay : ru.careBody;
  const action = motion === 'feed' || motion === 'play' || motion === 'grow' ? motion : 'idle';
  const actionKey = action === 'feed' ? chick.lastFeedAt ?? 0 : action === 'play' ? chick.lastPlayAt ?? 0 : action === 'grow' ? chick.stage : 0;
  return <section className="home-screen">
    <div className="home-heading">
      <button className="pet-title" onClick={() => onCard(chick.id)}><h1>{chick.name}</h1><span className="stage-label">{ru.stage[chick.stage]} <span aria-hidden="true">↗</span></span></button>
      <div className="home-community-picker">{state.dailyBonus && onDailyClaim && <div className="home-daily-control" ref={dailyRoot}><button type="button" className={`home-daily-toggle ${state.dailyBonus.available ? 'is-available' : ''}`} aria-label="Ежедневный подарок" aria-expanded={dailyOpen} onClick={() => setDailyOpen(open => !open)}><Icon name="feather" size={20} /><span>{state.dailyBonus.available ? '+1' : '✓'}</span></button>{dailyOpen && <div className="home-daily-panel" role="region" aria-label="Ежедневный подарок"><DailyBonus bonus={state.dailyBonus} serverNow={view.now} busy={view.busy} onClaim={onDailyClaim} onRefresh={onDailyRefresh} /><button type="button" className="button text-button" onClick={() => setDailyOpen(false)}>Закрыть подарок</button></div>}</div>}{guestControls ?? <span className="home-heading-note">{ru.homeEyebrow}</span>}</div>
    </div>
    <HomeWorld key={chick.id} chick={chick} animate={!view.reducedMotion} sleeping={sleeping || awaitingWake} now={view.now} action={action} actionKey={actionKey} onTouchFeedback={onTouchFeedback} guest={guest} />
    <div className="home-status">
      <p className="pet-status" aria-live="polite">{status}</p>
      {sleeping && <p className="timer-note">{ru.sleepRemaining} <strong>{duration((chick.sleepUntil ?? 0) - view.now)}</strong></p>}
    </div>
    <Needs chick={chick} />
    <div className="care-actions">
      {(['feed', 'play', 'sleep'] as const).map(action => {
        const readyAt = action === 'feed' ? careReadyAt(chick.lastFeedAt) : action === 'play' ? careReadyAt(chick.lastPlayAt) : 0;
        const cooldown = readyAt > view.now;
        const locked = sleeping || awaitingWake || cooldown;
        const caption = sleeping || awaitingWake ? ru.sleepLocked : cooldown ? `${ru.actionAfter} ${duration(readyAt - view.now)}` : action === 'sleep' ? ru.sleepDuration : ru.actionAvailable;
        return <button className={`care-button ${action}`} key={action} disabled={view.busy || locked} onClick={() => onCare(action)}><Icon name={actionIcons[action]} size={25} /><strong>{ru[action]}</strong><small>{caption}</small></button>;
      })}
    </div>
    <div className="care-summary">
      <button type="button" className="care-summary-toggle" aria-expanded={careTipOpen} aria-controls="care-tip-detail" onClick={() => setCareTipOpen(open => !open)}>
        <Icon name="feather" /><span className="care-summary-text"><strong>{recentFeed !== recentPlay ? cycleHint : ru.careTitle}</strong><span>{careRemaining > 0 ? `${ru.careRewardAfter} ${duration(careRemaining)}` : ru.careRewardAvailable}</span></span><span className="care-summary-chevron" aria-hidden="true">⌃</span>
      </button>
      {careTipOpen && <div className="care-tip-popover" id="care-tip-detail"><h2>{ru.careTitle}</h2><p>{ru.careBody}</p></div>}
    </div>
  </section>;
}

export function Collection({ state, onCard, reducedMotion }: { state: Snapshot; onCard: (id: string) => void; reducedMotion: boolean }) {
  const [sort, setSort] = useState<'newest' | 'rarest'>('newest');
  const [comparing, setComparing] = useState(false);
  const rarityWeight = { common: 0, uncommon: 1, rare: 2 };
  const chicks = [...state.chicks].sort((a, b) => sort === 'rarest' ? rarityWeight[b.rarity] - rarityWeight[a.rarity] || b.bornAt - a.bornAt : b.bornAt - a.bornAt);
  return <section className="collection-screen">
    <p className="eyebrow">{ru.collection}</p><h1>{ru.collectionTitle}</h1><p className="intro">{ru.collectionBody(chicks.length)}</p>
    <div className="collection-tools"><div className="segmented" aria-label={ru.sortLabel}>{(['newest', 'rarest'] as const).map(value => <button key={value} className={sort === value ? 'selected' : ''} aria-pressed={sort === value} onClick={() => setSort(value)}>{ru[value]}</button>)}</div><button className="button secondary collection-compare-toggle" type="button" disabled={chicks.length < 2} aria-expanded={comparing && chicks.length >= 2} aria-controls="chick-comparison" title={chicks.length < 2 ? 'Для сравнения нужны две птицы' : 'Рассмотреть двух птиц рядом'} onClick={() => setComparing(value => !value)}>Сравнить</button></div>
    {comparing && chicks.length >= 2 && <CompareChicks chicks={chicks} now={state.serverNow} reducedMotion={reducedMotion} />}
    {!chicks.length ? <div className="empty-state"><h2>{ru.emptyCollection}</h2><p>{ru.emptyCollectionBody}</p></div> : <div className="collection-grid">
      {chicks.map(chick => <button className={`collection-card ${chick.id === state.player.activeChickId ? 'is-active' : ''}`} key={chick.id} onClick={() => onCard(chick.id)}>
        <span className={`rarity-dot ${chick.rarity}`} aria-label={ru.rarities[chick.rarity]} /><ChickArt chick={chick} size={140} animate={false} reducedMotion={reducedMotion} pose={chick.sleepUntil && chick.sleepUntil > state.serverNow ? 'sleep' : 'idle'} />
        <strong>{chick.name}</strong><span className="collection-personality">{visualDetailsFor(chick).personalityLabel}</span><span className="collection-appearance">{getAppearanceLabel(chick)}</span><small className={chick.id === state.player.activeChickId ? 'active-marker' : ''}>{chick.reservedExchangeId ? 'Ждёт обмена' : chick.reservedGiftId ? 'Ждёт принятия подарка' : chick.id === state.player.activeChickId ? ru.active : ru.resting}</small>
      </button>)}
    </div>}
    <p className="screen-footnote">{ru.restHint}</p>
  </section>;
}

export function ChickCard({ chick, state, now, busy, reducedMotion, onRename, onActivate, onShare, onGift }: ViewProps & { chick: Chick; state: Snapshot; onRename: (name: string) => void; onActivate: () => void; onShare?: () => void; onGift?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [previewStage, setPreviewStage] = useState<Stage>(chick.stage);
  const stages: Stage[] = ['baby', 'teen', 'adult'];
  const active = chick.id === state.player.activeChickId;
  const reserved = Boolean(chick.reservedGiftId || chick.reservedExchangeId);
  const personality = visualDetailsFor(chick);
  const shownStage = stages.indexOf(previewStage) <= stages.indexOf(chick.stage) ? previewStage : chick.stage;
  return <section className="bird-screen">
    <p className="eyebrow">{ru.birdCard}</p><h1>{chick.name}</h1>
    <div className="card-art"><ChickArt chick={{ ...chick, stage: shownStage }} pose={isSleeping(chick, now) ? 'sleep' : 'idle'} size={240} animate={!reducedMotion} reducedMotion={reducedMotion} /></div>
    <div className="growth-timeline" role="group" aria-label="История роста">{stages.map((stage, index) => { const unlocked = index <= stages.indexOf(chick.stage); return <button type="button" key={stage} data-stage={stage} disabled={!unlocked} aria-pressed={shownStage === stage} className={shownStage === stage ? 'selected' : ''} onClick={() => setPreviewStage(stage)}><span>{unlocked ? ru.stage[stage] : '?'}</span><small>{!unlocked ? 'Пока закрыто' : stage === chick.stage ? 'Сейчас' : 'Воспоминание'}</small></button>; })}</div>
    {shownStage !== chick.stage && <p className="growth-preview-note" role="status">Воспоминание о росте · возраст и забота остаются прежними</p>}
    <div className="bird-tags"><span>{ru.stage[chick.stage]}</span><span className={`rarity-tag ${chick.rarity}`}>{ru.rarities[chick.rarity]}</span></div>
    <section className="bird-personality"><h2>{personality.personalityLabel}</h2><p>{personality.personalityDescription}</p></section>
    <dl className="bird-facts"><div><dt>{ru.appearance}</dt><dd>{getAppearanceLabel(chick)}</dd></div><div><dt>{ru.age}</dt><dd>{ageText(now - chick.bornAt)}</dd></div><div><dt>{ru.born}</dt><dd>{birthText(chick.bornAt)}</dd></div><div className="id-fact"><dt>{ru.birdId}</dt><dd>{chick.id}</dd></div></dl>
    <Needs chick={chick} />
    <section className="quiet-card growth-note"><h2>{ru.growthTitle}</h2><p>{chick.stage === 'baby' ? ru.growthBaby : chick.stage === 'teen' ? ru.growthTeen : ru.growthAdult}</p><span>{ru.careCycles(chick.careMilestones.length)}</span></section>
    {reserved && <p className="reserved-note">{chick.reservedExchangeId ? 'Птица участвует в обмене. Дождитесь ответа или отмените предложение в разделе «Друзья».' : 'Подарок ждёт ответа. Отменить его можно в разделе «Друзья».'}</p>}
    {editing ? <NameForm initial={chick.name} busy={busy || reserved} onSave={name => { if (!busy && !reserved) onRename(name); }} /> : <button className="button secondary" disabled={busy || reserved} onClick={() => setEditing(true)}>{ru.rename}</button>}
    <button className="button primary" disabled={busy || active || reserved} onClick={onActivate}>{active ? ru.alreadyActive : ru.activate}</button>
    {onShare && <button className="button secondary" disabled={busy} onClick={onShare}>Поделиться карточкой</button>}
    {onGift && <button className="button text-button" disabled={busy || active || state.chicks.length < 2 || reserved} onClick={onGift}>Подарить другу</button>}
  </section>;
}

export function Settings({ preferences, onChange, onRefresh, busy }: { preferences: Preferences; onChange: (key: keyof Preferences, value: boolean) => void; onRefresh: () => void; busy: boolean }) {
  return <section className="settings-screen"><p className="eyebrow">{ru.settings}</p><h1>{ru.settingsTitle}</h1>
    <div className="setting-list">{(['sound', 'animation', 'haptics'] as const).map(key => <label className="setting-row" key={key}><span><strong>{ru[key]}</strong><small>{ru[`${key}Hint`]}</small></span><input type="checkbox" role="switch" checked={preferences[key]} onChange={event => onChange(key, event.target.checked)} /><span className="switch-track" aria-hidden="true" /></label>)}</div>
    <p className="screen-footnote">{ru.preferenceHint}</p><button className="button secondary refresh-button" onClick={onRefresh} disabled={busy}><Icon name="refresh" />{ru.refresh}</button>
    <div className="about-copy"><h2>{ru.about}</h2><p>{ru.privacy}</p><p>{ru.footer}</p></div>
  </section>;
}
