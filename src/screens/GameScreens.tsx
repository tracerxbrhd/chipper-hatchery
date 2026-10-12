import { useEffect, useRef, useState } from 'react';
import type { Chick, Snapshot } from '../types';
import { ChickArt } from '../components/ChickArt';
import { duration, ru } from '../i18n';
import { Icon, isSleeping, rewardReadyAt, type ViewProps } from './Elements';

export interface GameAttempt { attemptId: string; durationMs: number; expiresAt: number }
export interface GameResult { score: number; rewarded: boolean }

export function Activities({ state, now, busy, reducedMotion, onStart }: ViewProps & { state: Snapshot; onStart: () => void }) {
  const chick = state.chicks.find(item => item.id === state.player.activeChickId);
  const rewardIn = rewardReadyAt(state.player.miniGameRewardAt) - now;
  return <section className="activities-screen"><p className="eyebrow">{ru.activities}</p><h1>{ru.activitiesTitle}</h1><article className="game-invite"><div className="game-invite-art">{chick && <ChickArt appearanceId={chick.appearanceId} stage={chick.stage} state={isSleeping(chick, now) ? 'sleep' : 'feed'} reducedMotion={reducedMotion} size={210} />}<span className="decor-grain grain-one" /><span className="decor-grain grain-two" /><span className="decor-grain grain-three" /></div><span className="game-duration">25 {ru.seconds}</span><h2>{ru.gameTitle}</h2><p>{ru.gameBody}</p><button className="button primary" disabled={busy} onClick={onStart}>{busy ? ru.waiting : ru.gameStart}</button></article><section className="quiet-card reward-note"><Icon name="feather" /><div><h2>{rewardIn > 0 ? `${ru.gameRewardAfter} ${duration(rewardIn)}` : ru.gameRewardAvailable}</h2><p>{ru.gameRepeatHint}</p></div></section>{chick && isSleeping(chick, now) && <p className="screen-footnote">{ru.gameSleepHint}</p>}</section>;
}

interface Grain { id: number; x: number; y: number; turn: number }
let grainSequence = 0;
function makeGrain(): Grain {
  return { id: ++grainSequence, x: 7 + Math.random() * 74, y: 9 + Math.random() * 69, turn: -30 + Math.random() * 60 };
}

export function GrainGame({ attempt, chick, busy, reducedMotion, onComplete, onGrain, onLeave }: { attempt: GameAttempt; chick: Chick | undefined; busy: boolean; reducedMotion: boolean; onComplete: (score: number) => void; onGrain: () => void; onLeave: () => void }) {
  const [deadline] = useState(() => performance.now() + attempt.durationMs);
  const [remaining, setRemaining] = useState(attempt.durationMs);
  const [grains, setGrains] = useState<Grain[]>(() => Array.from({ length: 5 }, makeGrain));
  const [score, setScore] = useState(0);
  const [birdX, setBirdX] = useState(50);
  const scoreRef = useRef(0);
  const consumedGrains = useRef(new Set<number>());
  const ended = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, deadline - performance.now());
      setRemaining(next);
      if (next === 0 && !ended.current) {
        ended.current = true;
        completeRef.current(scoreRef.current);
      }
    }, 100);
    const spawn = window.setInterval(() => {
      if (ended.current) return;
      setGrains(old => [...old.slice(1), makeGrain()]);
    }, 1600);
    return () => { window.clearInterval(timer); window.clearInterval(spawn); };
  }, [deadline]);
  const collect = (grain: Grain) => {
    if (ended.current || busy || performance.now() >= deadline || consumedGrains.current.has(grain.id)) return;
    consumedGrains.current.add(grain.id);
    setGrains(old => old.map(item => item.id === grain.id ? makeGrain() : item));
    scoreRef.current = Math.min(500, scoreRef.current + 1);
    setScore(scoreRef.current);
    setBirdX(grain.x + 6);
    onGrain();
  };
  return <section className="game-screen"><h1>{ru.gameTitle}</h1><div className="game-scoreboard"><div><span>{ru.score}</span><strong>{score}</strong></div><div className="game-timer" role="timer"><span>{ru.seconds}</span><strong>{Math.ceil(remaining / 1000)}</strong></div></div><div className="round-track" aria-hidden="true"><i style={{ width: `${(remaining / attempt.durationMs) * 100}%` }} /></div><div className="grain-field" aria-label={ru.gameTitle}>
    {grains.map(grain => <button className="grain-target" key={grain.id} style={{ left: `${grain.x}%`, top: `${grain.y}%`, transform: `rotate(${grain.turn}deg)` }} aria-label={ru.grain} onClick={() => collect(grain)} disabled={busy || remaining <= 0}><span /></button>)}
    {chick && <div className="game-bird" style={{ left: `${birdX}%` }}><ChickArt appearanceId={chick.appearanceId} stage={chick.stage} state={chick.sleepUntil !== null ? 'idle' : remaining <= 0 ? 'happy' : 'feed'} size={115} reducedMotion={reducedMotion} /></div>}
    {remaining <= 0 && <div className="game-saving" role="status"><span className="spinner" />{ru.gameFinishing}</div>}
  </div><p className="game-help">{ru.gameBody}</p><button className="button text-button" onClick={onLeave} disabled={busy}>{ru.gameLeave}</button></section>;
}

export function GameResultScreen({ result, chick, busy, reducedMotion, onAgain, onHome }: { result: GameResult; chick: Chick | undefined; busy: boolean; reducedMotion: boolean; onAgain: () => void; onHome: () => void }) {
  return <section className="game-result"><span className="success-badge"><Icon name="check" /></span><h1>{ru.gameResultTitle}</h1>{chick && <div className="result-art"><ChickArt appearanceId={chick.appearanceId} stage={chick.stage} state={chick.sleepUntil !== null ? 'sleep' : 'happy'} size={250} reducedMotion={reducedMotion} /></div>}<strong className="result-score">{result.score}</strong><p className="intro">{ru.gameResultBody(result.score)}</p><p className={result.rewarded ? 'reward-pill' : 'reward-explanation'}>{result.rewarded && <Icon name="feather" />}{result.rewarded ? ru.gameRewarded : ru.gameNotRewarded}</p><button className="button primary" onClick={onAgain} disabled={busy}>{ru.playAgain}</button><button className="button text-button" onClick={onHome} disabled={busy}>{ru.goHome}</button></section>;
}
