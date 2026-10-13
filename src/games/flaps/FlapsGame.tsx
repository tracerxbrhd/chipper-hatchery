import { useEffect, useRef, useState } from 'react';
import type { GameAttempt } from '../../screens/GameScreens';
import { webApp } from '../../api/telegram';
import { FLAPS_CONFIG as C, type FlapsEndReason } from './config';
import { advanceFlaps, createFlapsState, flap, type FlapsState } from './engine';
import { flapsTheme, makeFlapsSprites, paintFlaps, type FlapsSprites } from './graphics';
import { FlapsAudio } from './audio';
import { FLAPS_BACK_EVENT, isFlapKey, isFlapPointer } from './input';
import './flaps.css';

type GameStatus = 'loading' | 'ready' | 'playing' | 'paused' | 'crashed' | 'expired' | 'art-error' | 'unsupported';
export interface FlapsGameProps {
  attempt: GameAttempt;
  busy: boolean;
  reducedMotion: boolean;
  sound?: boolean;
  haptics?: boolean;
  now: number;
  onComplete: (score: number, endReason: FlapsEndReason) => void;
  onLeave: () => void;
}

export function FlapsGame({ attempt, busy, reducedMotion, sound = false, haptics = true, now, onComplete, onLeave }: FlapsGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<{ tap(): void; pause(): void; resume(): void; leave(): void; cancelLeave(): void } | null>(null);
  const settingsRef = useRef({ sound, haptics, reducedMotion, now, busy, onComplete, onLeave });
  settingsRef.current = { sound, haptics, reducedMotion, now, busy, onComplete, onLeave };
  const [status, setStatus] = useState<GameStatus>('loading');
  const [score, setScore] = useState(0);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !stage || !surface) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { setStatus('unsupported'); return; }
    let state: FlapsState = createFlapsState(attempt.runId);
    let sprites: FlapsSprites | null = null;
    let currentStatus: GameStatus = attempt.configVersion === C.configVersion ? 'loading' : 'unsupported';
    let alive = true;
    let active = webApp()?.isActive !== false;
    let confirming = false;
    let wasPlayingBeforeConfirm = false;
    let lastFrame: number | null = null;
    let accumulator = 0;
    let frameId = 0;
    let crashTimer = 0;
    let finished = false;
    let readyTime = 0;
    const startWall = Date.now();
    const startServer = settingsRef.current.now;
    const audio = new FlapsAudio(settingsRef.current.sound);
    const changeStatus = (next: GameStatus) => { currentStatus = next; if (alive) setStatus(next); };
    const clockNow = () => Math.max(settingsRef.current.now, startServer + Date.now() - startWall);
    const expired = () => clockNow() >= attempt.expiresAt;
    const feedback = (kind: 'flap' | 'score' | 'hit') => {
      audio.setEnabled(settingsRef.current.sound); audio.play(kind);
      if (!settingsRef.current.haptics) return;
      try {
        if (kind === 'hit') webApp()?.HapticFeedback?.notificationOccurred('error');
        else if (kind === 'score') webApp()?.HapticFeedback?.notificationOccurred('success');
        else webApp()?.HapticFeedback?.impactOccurred('light');
      } catch { /* Optional haptics on old clients. */ }
    };
    const resize = () => {
      const width = Math.max(1, Math.min(stage.clientWidth, stage.clientHeight * C.width / C.height));
      const height = width * C.height / C.width;
      surface.style.width = `${width}px`; surface.style.height = `${height}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(canvas.width / C.width, 0, 0, canvas.height / C.height, 0, 0);
      paintFlaps(ctx, state, sprites, flapsTheme(), readyTime, settingsRef.current.reducedMotion);
    };
    const stopLoop = () => { cancelAnimationFrame(frameId); frameId = 0; lastFrame = null; accumulator = 0; };
    const render = () => paintFlaps(ctx, state, sprites, flapsTheme(), readyTime, settingsRef.current.reducedMotion);
    const expire = () => {
      if (finished || currentStatus === 'crashed' || currentStatus === 'expired') return;
      stopLoop(); confirming = false; setLeaveConfirm(false); changeStatus('expired'); render();
    };
    const animate = (timestamp: number) => {
      frameId = 0;
      if (!alive || !active || document.hidden || (currentStatus !== 'ready' && currentStatus !== 'playing')) return;
      if (expired()) { expire(); return; }
      const delta = lastFrame === null ? 0 : Math.max(0, (timestamp - lastFrame) / 1000);
      lastFrame = timestamp;
      readyTime += Math.min(delta, C.maxFrameDelta);
      if (currentStatus === 'playing') {
        const before = state.score;
        const result = advanceFlaps(state, accumulator, delta);
        state = result.state; accumulator = result.accumulator;
        if (state.score !== before) { setScore(state.score); feedback('score'); }
        if (state.phase === 'crashed') {
          stopLoop(); changeStatus('crashed'); feedback('hit'); render();
          // The hit pose is briefly visible, then one and only one finish callback is issued.
          crashTimer = window.setTimeout(() => {
            if (!alive || finished) return;
            finished = true; settingsRef.current.onComplete(state.score, state.endReason!);
          }, settingsRef.current.reducedMotion ? 80 : 260);
          return;
        }
      }
      render();
      frameId = requestAnimationFrame(animate);
    };
    const startLoop = () => {
      if (!frameId && active && !document.hidden && alive && !(currentStatus === 'ready' && settingsRef.current.reducedMotion)) { lastFrame = null; frameId = requestAnimationFrame(animate); }
    };
    const pause = () => {
      audio.stop();
      if (currentStatus === 'playing') { stopLoop(); changeStatus('paused'); render(); }
      else if (currentStatus === 'ready') stopLoop();
    };
    const tap = () => {
      if (expired()) { expire(); return; }
      if (!active || document.hidden || confirming || settingsRef.current.busy || (currentStatus !== 'ready' && currentStatus !== 'playing')) return;
      state = flap(state); changeStatus('playing'); feedback('flap'); startLoop();
    };
    const resume = () => {
      if (expired()) { expire(); return; }
      if (currentStatus !== 'paused' || confirming || !active || document.hidden) return;
      // Continue is itself one intentional flap; the bird cannot plummet on resume.
      state = flap(state); changeStatus('playing'); feedback('flap'); startLoop();
    };
    const leave = () => {
      if (settingsRef.current.busy) return;
      if (currentStatus === 'playing' || currentStatus === 'paused') {
        if (confirming) return;
        wasPlayingBeforeConfirm = currentStatus === 'playing'; confirming = true;
        stopLoop(); changeStatus('paused'); setLeaveConfirm(true);
      } else settingsRef.current.onLeave();
    };
    const cancelLeave = () => {
      confirming = false; setLeaveConfirm(false); surface.focus({ preventScroll: true });
      if (expired()) { expire(); return; }
      if (wasPlayingBeforeConfirm && active && !document.hidden) resume();
    };
    loopRef.current = { tap, pause, resume, leave, cancelLeave };
    const visibility = () => {
      if (document.hidden) pause();
      else if (expired()) expire();
      else if (currentStatus === 'ready') startLoop();
    };
    const deactivated = () => { active = false; pause(); };
    const activated = () => { active = true; visibility(); };
    const blurred = () => pause();
    const back = () => leave();
    const app = webApp();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blurred);
    window.addEventListener(FLAPS_BACK_EVENT, back);
    app?.onEvent('deactivated', deactivated); app?.onEvent('activated', activated);
    const expiryTimer = window.setInterval(() => { if (expired()) expire(); }, 500);
    const observer = new ResizeObserver(resize); observer.observe(stage); resize();
    changeStatus(currentStatus);
    if (currentStatus !== 'unsupported') {
      void makeFlapsSprites(attempt.chick).then(value => {
        if (!alive) return;
        sprites = value; render();
        if (expired()) expire(); else { changeStatus('ready'); startLoop(); }
      }).catch(() => { if (alive) { stopLoop(); changeStatus('art-error'); } });
    }
    return () => {
      alive = false; stopLoop(); clearTimeout(crashTimer); clearInterval(expiryTimer); observer.disconnect(); audio.stop();
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blurred);
      window.removeEventListener(FLAPS_BACK_EVENT, back); app?.offEvent('deactivated', deactivated); app?.offEvent('activated', activated);
      loopRef.current = null; sprites = null;
    };
  }, [attempt.runId, attempt.configVersion, attempt.expiresAt, attempt.chick]);

  const playing = status === 'playing';
  return <section className="flaps-game" data-phase={status} data-flaps-state={status} data-chick-id={attempt.chickId} aria-label="Chippster Flaps">
    <div className="flaps-toolbar">
      <button type="button" className="flaps-round-button" aria-label="Выйти из Chippster Flaps" disabled={busy} onClick={() => loopRef.current?.leave()}><span aria-hidden="true">‹</span></button>
      <h1>Chippster Flaps</h1>
      <button type="button" className="flaps-round-button" aria-label="Пауза" disabled={!playing} onClick={() => loopRef.current?.pause()}><span aria-hidden="true">Ⅱ</span></button>
    </div>
    <div className="flaps-stage" ref={stageRef}>
      <div className="flaps-surface" ref={surfaceRef} role="application" aria-label="Игровое поле Chippster Flaps" aria-describedby="flaps-instructions" tabIndex={0}
        onPointerDown={event => {
          if (!isFlapPointer(event)) return;
          event.preventDefault(); surfaceRef.current?.focus({ preventScroll: true }); loopRef.current?.tap();
        }}
        onKeyDown={event => { if (isFlapKey(event)) { event.preventDefault(); loopRef.current?.tap(); } }}>
        <canvas ref={canvasRef} aria-label="Полёт активного цыплёнка" aria-hidden="true" />
        <div className="flaps-score" aria-live="polite" aria-atomic="true"><span>Очки</span><strong>{score}</strong></div>
        {status === 'ready' && <div className="flaps-ready"><span className="flaps-ready-mark" aria-hidden="true">↑</span><h2>Полетим?</h2><p>Коснитесь поля, чтобы взмахнуть.<br />Летите через проёмы.</p><small>Ваш пилот — {attempt.chick.name}</small></div>}
        {status === 'loading' && <div className="flaps-overlay" role="status"><span className="spinner" /><p>Готовим крылья…</p></div>}
        {status === 'paused' && !leaveConfirm && <div className="flaps-overlay" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><div className="flaps-overlay-card"><h2>Полёт на паузе</h2><p>Цыплёнок ждёт. Таймер попытки продолжает идти.</p><button className="button primary" onClick={() => loopRef.current?.resume()}>Продолжить полёт</button><button className="button text-button" onClick={() => loopRef.current?.leave()}>Выйти</button></div></div>}
        {status === 'crashed' && <div className="flaps-overlay flaps-crashed" role="status"><div className="flaps-overlay-card"><h2>Хороший полёт!</h2><p>{busy ? 'Сохраняем результат…' : 'Готовим результат…'}</p><span className="spinner" /></div></div>}
        {(status === 'expired' || status === 'unsupported' || status === 'art-error') && <div className="flaps-overlay" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><div className="flaps-overlay-card"><h2>{status === 'expired' ? 'Попытка закончилась' : status === 'art-error' ? 'Крылья ещё не готовы' : 'Нужно обновить игру'}</h2><p>{status === 'expired' ? 'Прошло 10 минут. Начните новый полёт — эта попытка завершена без награды.' : status === 'art-error' ? 'Не удалось загрузить вашего цыплёнка. Вернитесь и попробуйте снова.' : 'Этот браузер или версия игры не поддерживают полёт. Откройте Mini App заново.'}</p><button className="button primary" onClick={onLeave}>К активностям</button></div></div>}
      </div>
    </div>
    <p className="flaps-footer" id="flaps-instructions">Тап — взмах · проём — очко <span className="flaps-key-help">· пробел — взмах</span></p>
    <p className="flaps-landscape-hint">Удобнее играть, держа телефон вертикально.</p>
    {leaveConfirm && <div className="flaps-confirm-backdrop" onPointerDown={event => event.stopPropagation()}>
      <div className="flaps-overlay-card" role="alertdialog" aria-modal="true" onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); loopRef.current?.cancelLeave(); }
          if (event.key === 'Tab') {
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
            const first = controls[0]; const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }} aria-labelledby="flaps-leave-title" aria-describedby="flaps-leave-body">
        <h2 id="flaps-leave-title">Завершить полёт?</h2><p id="flaps-leave-body">Результат и награда этой попытки не сохранятся.</p>
        <button className="button primary" autoFocus onClick={() => loopRef.current?.cancelLeave()}>Продолжить</button>
        <button className="button text-button" onClick={onLeave}>Выйти из игры</button>
      </div>
    </div>}
  </section>;
}
