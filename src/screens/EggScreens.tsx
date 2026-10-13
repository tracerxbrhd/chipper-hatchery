import { useState } from 'react';
import type { Chick, Snapshot } from '../types';
import { getAppearanceLabel, ChickArt } from '../components/ChickArt';
import { EggArt } from '../components/EggArt';
import { duration, ru } from '../i18n';
import { Icon, NameForm, type ViewProps } from './Elements';

export function Onboarding({ state, busy, reducedMotion, onHatch, onComplete }: Omit<ViewProps, 'now'> & { state: Snapshot; onHatch: () => void; onComplete: (name?: string) => void }) {
  const [started, setStarted] = useState(false);
  const [cracks, setCracks] = useState(0);
  const chick = state.chicks.find(item => item.id === state.player.activeChickId);
  if (state.player.onboarding === 'name' && chick) return <section className="onboarding name-step"><p className="eyebrow">{ru.app}</p><h1>{ru.firstHatch}</h1><div className="onboarding-art"><ChickArt chick={chick} state="hatch" reducedMotion={reducedMotion} size={255} /></div><div className="bird-tags"><span>{getAppearanceLabel(chick)}</span><span className={`rarity-tag ${chick.rarity}`}>{ru.rarities[chick.rarity]}</span></div><p className="intro">{ru.firstHatchBody}</p><NameForm initial={chick.name} busy={busy} onSave={onComplete} onSkip={() => onComplete()} /></section>;
  const tap = () => {
    if (!started || busy || cracks >= 3) return;
    const next = cracks + 1;
    setCracks(next);
    if (next === 3) onHatch();
  };
  return <section className="onboarding egg-step"><p className="eyebrow">{ru.app} <span className="tiny-leaf" aria-hidden="true">✦</span></p><h1>{started ? ru.tapEgg : ru.welcomeTitle}</h1><p className="intro">{started ? ru.tapEggBody : ru.welcomeBody}</p><button className="egg-touch" onClick={tap} disabled={!started || busy || cracks >= 3} aria-label={ru.tapEgg}><EggArt size={250} cracks={cracks} hatching={busy && cracks === 3} reducedMotion={reducedMotion} /></button>{started ? <div className="tap-step-status"><div className="tap-dots" aria-hidden="true">{[1, 2, 3].map(n => <i key={n} className={cracks >= n ? 'filled' : ''} />)}</div><p aria-live="polite">{cracks === 3 ? ru.hatching : ru.tapProgress(cracks)}</p></div> : <button className="button primary" onClick={() => setStarted(true)} disabled={busy}>{ru.start}</button>}<p className="onboarding-footer">{ru.footer}</p></section>;
}

export function Incubator({ state, now, busy, reducedMotion, onBuy, onHatch }: ViewProps & { state: Snapshot; onBuy: () => void; onHatch: () => void }) {
  const egg = state.egg;
  const ready = egg !== null && now >= egg.readyAt;
  const missing = Math.max(0, 6 - state.player.feathers);
  return <section className="incubator-screen"><p className="eyebrow">{ru.incubator}</p><h1>{!egg ? ru.emptyNestTitle : ready ? ru.eggReadyTitle : ru.eggTitle}</h1><p className="intro">{!egg ? ru.emptyNestBody : ready ? ru.eggReadyBody : ru.eggBody}</p>
    <div className={`nest-scene ${ready ? 'is-ready' : ''}`}><div className="nest-halo" />{egg ? <EggArt size={245} cracks={ready ? 2 : 0} hatching={busy && ready} reducedMotion={reducedMotion} /> : <svg className="empty-nest-art" viewBox="0 0 260 200" role="img" aria-label={ru.emptyNestTitle}><ellipse cx="130" cy="151" rx="85" ry="12" fill="currentColor" opacity=".05" /><g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".3"><path d="M45 126q85 65 170 0M55 137q78 55 150-5M65 120l17 10m-9-19 19 16m102-13-19 16m29-7-15 14M80 139l14-10m28 28 19-11m-26-12 19 16m25-25 18 15" /></g><path d="M125 95c-8-10 3-28 20-29-3 13-8 22-20 29Z" fill="var(--accent)" opacity=".55" /><path d="m113 106 19-26" stroke="var(--accent)" strokeWidth="2" /></svg>}</div>
    {egg ? <><div className="incubator-clock"><span>{ready ? ru.eggReadyTitle : ru.eggReadyIn}</span><strong>{ready ? '00:00' : duration(egg.readyAt - now)}</strong></div><button className="button primary" onClick={onHatch} disabled={busy || !ready}>{busy && ready ? ru.hatching : ru.hatchEgg}</button></> : <><p className="egg-cost"><Icon name="feather" />{ru.eggCost}</p><button className="button primary" disabled={busy || missing > 0} onClick={onBuy}>{busy ? ru.saving : missing ? ru.needFeathers(missing) : ru.buyEgg}</button></>}
    <section className="quiet-card odds-copy"><h2>{ru.odds}</h2><p>{ru.oddsBody}</p></section>
  </section>;
}

export function HatchResult({ chick, busy, reducedMotion, onActivate, onCollection }: { chick: Chick; busy: boolean; reducedMotion: boolean; onActivate: () => void; onCollection: () => void }) {
  return <section className="hatch-result"><span className="success-badge"><Icon name="check" /></span><h1>{ru.newChickTitle}</h1><div className="result-art"><ChickArt chick={chick} state="hatch" reducedMotion={reducedMotion} size={280} /></div><h2>{chick.name}</h2><div className="bird-tags"><span>{getAppearanceLabel(chick)}</span><span className={`rarity-tag ${chick.rarity}`}>{ru.rarities[chick.rarity]}</span></div><p className="intro">{ru.newChickBody}</p><button className="button primary" disabled={busy} onClick={onActivate}>{ru.activate}</button><button className="button text-button" onClick={onCollection} disabled={busy}>{ru.goCollection}</button></section>;
}
