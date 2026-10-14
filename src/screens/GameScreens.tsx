import type { Chick, Snapshot } from '../types';
import { ChickArt } from '../components/ChickArt';
import { duration } from '../i18n';
import { Icon, isSleeping, rewardReadyAt, type ViewProps } from './Elements';
import '../games/flaps/flaps.css';
export { FlapsGame } from '../games/flaps/FlapsGame';
export { requestFlapsLeave } from '../games/flaps/input';

export interface GameAttempt {
  gameId?: 'chippster-flaps';
  runId: string;
  chickId: string;
  startedAt: number;
  expiresAt: number;
  configVersion: string;
  chick: Chick;
}
export interface GameResult {
  gameId?: 'chippster-flaps';
  score: number;
  bestScore: number;
  previousBest: number;
  newBest: boolean;
  rewarded: boolean;
  rewardNextAt: number | null;
  reason: 'rewarded' | 'cooldown' | 'too_short';
}

export function Activities({ state, now, busy, reducedMotion, onStart, onTowerStart }: ViewProps & { state: Snapshot; onStart: () => void; onTowerStart?: () => void }) {
  const chick = state.chicks.find(item => item.id === state.player.activeChickId);
  const record = state.player.games?.['chippster-flaps'];
  const rewardIn = rewardReadyAt(record?.lastRewardAt ?? state.player.miniGameRewardAt) - now;
  const bestScore = record?.bestScore ?? state.player.flaps?.bestScore ?? 0;
  const towerRecord = state.player.games?.['nest-defense'];
  const towerRewardIn = rewardReadyAt(towerRecord?.lastRewardAt ?? null) - now;
  return <section className="activities-screen flaps-activities">
    <p className="eyebrow">Активности</p><h1>Расправим крылья</h1><p className="intro">Небольшое приключение с вашим цыплёнком.</p>
    <article className="flaps-invite">
      <div className="flaps-invite-art" aria-hidden="true"><i className="flaps-invite-gate gate-top" /><i className="flaps-invite-gate gate-bottom" />
        {chick && <ChickArt chick={chick} animate={!reducedMotion} pose="flap" direction="right" shadow={false} />}
        <span className="flaps-invite-air air-one" /><span className="flaps-invite-air air-two" />
      </div>
      <span className="flaps-tag">ТАП — ВЗМАХ</span><h2>Chippster Flaps</h2><p>Пролетайте через проёмы, собирайте очки и побейте свой рекорд.</p>
      <div className="flaps-invite-best"><Icon name="play" /><span>Личный рекорд</span><strong>{bestScore}</strong></div>
      <button className="button primary" disabled={busy || !chick} onClick={onStart}>{busy ? 'Готовим полёт…' : 'Играть'}</button>
    </article>
    <section className="quiet-card reward-note"><Icon name="feather" /><div><h2>{rewardIn > 0 ? `Пёрышко через ${duration(rewardIn)}` : '+1 пёрышко за завершённый полёт'}</h2><p>Награда Chippster Flaps раз в 20 часов. Уход имеет отдельную награду. Играть и улучшать рекорд можно в любое время.</p></div></section>
    <article className="quiet-card tower-invite"><div className="tower-invite-symbol" aria-hidden="true">✦</div><span className="flaps-tag">СТРОЙ · ЗАЩИЩАЙ · РАСТИ</span><h2>Защита гнезда</h2><p>Каждая карта — новая дорожка. Три вида башен, бесконечные волны и уютное гнездо, которое ждёт вашей защиты.</p><div className="flaps-invite-best"><Icon name="play" /><span>Личный рекорд</span><strong>{towerRecord?.bestScore ?? 0} волн</strong></div><button className="button primary" disabled={busy || !chick} onClick={onTowerStart}>Защитить гнездо</button><p className="screen-footnote">{towerRewardIn > 0 ? `Награда через ${duration(towerRewardIn)}` : 'До +4 пёрышек за подтверждённые волны'} · отдельная награда раз в 20 часов</p><p className="screen-footnote">3 / 8 / 15 / 25 волн → 1 / 2 / 3 / 4 пёрышка</p></article>
    {chick && isSleeping(chick, now) && <p className="screen-footnote">Пока цыплёнок отдыхает дома, здесь можно полетать в его компании.</p>}
  </section>;
}

export function GameResultScreen({ result, chick, busy, reducedMotion, now, onAgain, onHome }: ViewProps & { result: GameResult; chick: Chick | undefined; onAgain: () => void; onHome: () => void }) {
  const rewardIn = (result.rewardNextAt ?? 0) - now;
  const explanation = result.reason === 'too_short'
    ? 'Полёт был короче 2 секунд. Попробуйте ещё — крылья уже размялись!'
    : rewardIn > 0 ? `Следующее пёрышко через ${duration(rewardIn)}. А рекорд можно улучшить сейчас.` : 'Награда за этот полёт уже учтена.';
  return <section className={`game-result flaps-result ${result.newBest && !reducedMotion ? 'flaps-record' : ''}`}>
    <p className="eyebrow">Chippster Flaps</p><h1>{result.newBest ? 'Новый личный рекорд!' : 'Хороший полёт!'}</h1>
    {chick && <div className="flaps-result-art"><ChickArt chick={chick} animate={!reducedMotion} pose={result.newBest ? 'play' : 'idle'} shadow /></div>}
    <div className="flaps-result-stats"><div><span>Очки за полёт</span><strong className="result-score">{result.score}</strong></div><div><span>Личный рекорд</span><strong>{result.bestScore}</strong></div></div>
    {result.rewarded ? <p className="reward-pill"><Icon name="feather" />+1 пёрышко в копилку</p> : <p className="reward-explanation">{explanation}</p>}
    <button className="button primary" onClick={onAgain} disabled={busy}>{busy ? 'Готовим полёт…' : 'Ещё раз'}</button>
    <button className="button text-button" onClick={onHome} disabled={busy}>Домой</button>
    <p className="flaps-stat-note">Личная игровая статистика. Очки не влияют на награду.</p>
  </section>;
}
