import { useEffect, useRef, useState } from 'react';
import { playFeedback } from '../../api/client';
import { webApp } from '../../api/telegram';
import { advanceTower, generateTowerMap, newTowerState, TOWER_BACK_EVENT, TOWER_CONFIG, towerLevelStats, towerRewardAmount } from './engine';
import { TowerCheckpointJournal } from './checkpoints';
import { FIELD_HEIGHT, FIELD_WIDTH, makeTowerBackdrop, paintTower } from './graphics';
import type { TowerCell, TowerCheckpointInput, TowerCommand, TowerFinishInput, TowerGameResult, TowerPreferences, TowerRunDTO, TowerState, TowerType } from './types';
import './tower.css';

type Status = 'build' | 'playing' | 'paused' | 'saving' | 'error' | 'defeat' | 'result' | 'unsupported' | 'expired';
interface Hud { hp: number; coins: number; wave: number; completedWave: number; tick: number; selected: TowerCell | null; type: TowerType; state: TowerState }
interface Loop { choose(type: TowerType): void; select(cell: TowerCell): void; command(command: TowerCommand): void; start(): void; pause(): void; resume(): void; leave(): void; cancelLeave(): void; saveExit(): void; retire(): void; retry(): void; restore(): void }
export interface TowerDefenseProps {
  run: TowerRunDTO; preferences: TowerPreferences;
  onCheckpoint(input: TowerCheckpointInput): Promise<TowerRunDTO>;
  onFinish(input: TowerFinishInput): Promise<TowerGameResult>;
  onRestart(): Promise<TowerRunDTO>;
  onRestore(): Promise<TowerRunDTO | null>;
  onExit(): void;
}
const typeSymbols: Record<TowerType, string> = { beak: '◁', seed: '◉', frost: '≋' };
function errorMessage(error: unknown): string { return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : 'Связь прервалась. Действия сохранены для безопасного повтора.'; }
function errorCode(error: unknown): string { return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'NETWORK'; }
function hudFor(state: TowerState, selected: TowerCell | null, type: TowerType): Hud { return { hp: state.hp, coins: state.coins, wave: state.wave, completedWave: state.completedWave, tick: state.tick, selected, type, state: structuredClone(state) }; }

export function TowerDefense(props: TowerDefenseProps) {
  const [restartRun, setRestartRun] = useState<TowerRunDTO | null>(null), activeRun = restartRun ?? props.run;
  const settings = useRef(props); settings.current = props;
  const canvasRef = useRef<HTMLCanvasElement>(null), stageRef = useRef<HTMLDivElement>(null), surfaceRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<Loop | null>(null);
  const [status, setStatus] = useState<Status>('build');
  const [hud, setHud] = useState<Hud>(() => hudFor(props.run.checkpoint ?? newTowerState(props.run.seed), null, 'beak'));
  const [message, setMessage] = useState('Поставьте башни на светлые клетки рядом с дорожкой.');
  const [failureCode, setFailureCode] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<TowerGameResult | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current, surface = surfaceRef.current;
    if (!canvas || !stage || !surface) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx || activeRun.configVersion !== TOWER_CONFIG.configVersion) { setStatus('unsupported'); return; }
    if (!activeRun.checkpoint) {
      if (activeRun.result) { setResult(activeRun.result); setStatus('result'); }
      else setStatus(activeRun.status === 'expired' ? 'expired' : 'unsupported');
      return;
    }
    const journal = new TowerCheckpointJournal(activeRun), map = generateTowerMap(activeRun.seed);
    let backdrop = makeTowerBackdrop(map), selected: TowerCell | null = null, type: TowerType = 'beak';
    let alive = true, active = webApp()?.isActive !== false, paused = journal.state.phase === 'wave', confirming = false;
    let currentStatus: Status = paused ? 'paused' : journal.state.phase === 'defeat' ? 'defeat' : 'build';
    let frame = 0, lastFrame: number | null = null, accumulator = 0, lastHud = 0, lastCombatCue = 0;
    let syncing: Promise<boolean> | null = null, restoring = false, finishInput: TowerFinishInput | null = null, finishing = false, buildSaveTimer = 0;
    const change = (next: Status) => { currentStatus = next; if (alive) setStatus(next); };
    const updateHud = () => { if (alive) setHud(hudFor(journal.state, selected, type)); };
    const feedback = (kind: string) => playFeedback(kind, settings.current.preferences.sound, settings.current.preferences.haptics);
    const render = () => paintTower(ctx, journal.state, map, backdrop, { cell: selected, type }, accumulator / TOWER_CONFIG.stepMs, settings.current.preferences.reducedMotion);
    const stop = () => { cancelAnimationFrame(frame); frame = 0; lastFrame = null; accumulator = 0; };
    const resize = () => {
      const width = Math.max(1, Math.min(stage.clientWidth, stage.clientHeight * FIELD_WIDTH / FIELD_HEIGHT));
      surface.style.width = `${width}px`; surface.style.height = `${width * FIELD_HEIGHT / FIELD_WIDTH}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(width * dpr); canvas.height = Math.round(width * FIELD_HEIGHT / FIELD_WIDTH * dpr);
      ctx.setTransform(canvas.width / FIELD_WIDTH, 0, 0, canvas.height / FIELD_HEIGHT, 0, 0); render();
    };
    const showError = (error: unknown) => { stop(); paused = true; if (alive) { setMessage(errorMessage(error)); setFailureCode(errorCode(error)); } change('error'); updateHud(); render(); };
    const normalStatus = (): Status => paused ? 'paused' : journal.state.phase === 'wave' ? 'playing' : journal.state.phase === 'defeat' ? 'defeat' : 'build';
    const animate = (timestamp: number) => {
      frame = 0;
      if (!alive || paused || !active || document.hidden || currentStatus !== 'playing') return;
      const delta = lastFrame === null ? 0 : timestamp - lastFrame; lastFrame = timestamp;
      const beforeHp = journal.state.hp, beforeTick = journal.state.tick, advanced = advanceTower(journal.state, accumulator, delta, map);
      accumulator = advanced.accumulator; journal.stepped(advanced.steps);
      if (journal.state.hp < beforeHp) feedback('hit');
      if (settings.current.preferences.sound && timestamp - lastCombatCue > 500 && journal.state.towers.some(tower => tower.shot && tower.shot.tick > beforeTick)) {
        lastCombatCue = timestamp; playFeedback('play', true, false);
      }
      if (timestamp - lastHud > 250) { lastHud = timestamp; updateHud(); }
      render();
      if (journal.state.phase !== 'wave') {
        stop(); updateHud(); feedback(journal.state.phase === 'defeat' ? 'hit' : 'success');
        void sync().then(ok => {
          if (!ok || !alive) return;
          if (journal.state.phase === 'defeat') void finish('defeat');
          else { if (alive) setMessage(`Волна ${journal.state.completedWave} завершена. Можно улучшить оборону.`); change(normalStatus()); }
        }); return;
      }
      if (journal.unsavedTicks >= 200) { stop(); void sync().then(ok => { if (ok) startLoop(); }); return; }
      frame = requestAnimationFrame(animate);
    };
    const startLoop = () => {
      if (!alive || paused || !active || document.hidden || currentStatus !== 'playing' || frame || journal.state.phase !== 'wave') return;
      lastFrame = null; frame = requestAnimationFrame(animate);
    };
    const sync = (): Promise<boolean> => {
      if (syncing) return syncing;
      clearTimeout(buildSaveTimer); stop();
      const batch = journal.prepare();
      if (!batch) { change(normalStatus()); return Promise.resolve(true); }
      change('saving');
      syncing = settings.current.onCheckpoint(batch).then(run => {
        if (!alive) return false;
        if (run.status === 'finished' && run.result) { setResult(run.result); change('result'); return false; }
        if (run.configVersion !== TOWER_CONFIG.configVersion || run.status !== 'active' || !run.checkpoint) { change(run.status === 'expired' ? 'expired' : 'unsupported'); return false; }
        journal.acknowledge(run); change(normalStatus()); updateHud(); render(); return true;
      }).catch(error => { if (alive) showError(error); return false; }).finally(() => { syncing = null; });
      return syncing;
    };
    const finish = async (endReason: 'retire' | 'defeat') => {
      if (finishing || !alive) return; finishing = true; paused = true; stop();
      finishInput ??= { operationId: crypto.randomUUID(), runId: journal.run.runId, endReason };
      if (!await sync()) { finishing = false; return; }
      change('saving');
      try {
        const outcome = await settings.current.onFinish(finishInput);
        if (alive) { setResult(outcome); change('result'); feedback(outcome.rewarded ? 'success' : 'play'); }
      } catch (error) { if (alive) showError(error); }
      finally { finishing = false; }
    };
    const command = (value: TowerCommand) => {
      if (currentStatus !== 'build' || confirming || document.hidden || !active) return;
      try {
        journal.command(value); updateHud(); render(); feedback('play');
        if (alive) setMessage('Оборона готова. Запустите следующую волну.');
        clearTimeout(buildSaveTimer);
        if (journal.unsavedCommands >= 48) void sync();
        else buildSaveTimer = window.setTimeout(() => { void sync(); }, 600);
      } catch (error) { if (alive) setMessage(errorMessage(error)); feedback('hit'); }
    };
    const choose = (nextType: TowerType) => { type = nextType; updateHud(); render(); };
    const select = (cell: TowerCell) => {
      if (currentStatus !== 'build' || confirming) return;
      selected = { x: Math.max(0, Math.min(9, cell.x)), y: Math.max(0, Math.min(13, cell.y)) }; updateHud(); render();
    };
    const start = async () => {
      if (currentStatus !== 'build' || confirming || !active || document.hidden) return;
      paused = false;
      // A startWave belongs before the first simulated tick. Prior completed waves are already acknowledged.
      try { journal.command({ type: 'startWave' }); updateHud(); feedback('play'); } catch (error) { showError(error); return; }
      if (await sync()) { change(normalStatus()); startLoop(); }
    };
    const pause = () => {
      if (currentStatus === 'result' || currentStatus === 'unsupported' || currentStatus === 'expired') return;
      paused = true; stop(); change('paused'); updateHud(); render(); void sync();
    };
    const restore = async () => {
      if (syncing || finishing || restoring || !alive) return;
      restoring = true; stop(); paused = true; change('saving');
      try {
        const run = await settings.current.onRestore();
        if (!alive) return;
        if (!run || run.status === 'expired') { change('expired'); return; }
        if (run.status === 'finished' && run.result) { setResult(run.result); change('result'); return; }
        if (run.runId !== journal.run.runId || run.configVersion !== TOWER_CONFIG.configVersion || run.status !== 'active' || !run.checkpoint) { change('unsupported'); return; }
        journal.restore(run); updateHud(); render(); change('paused'); if (alive) { setMessage('Восстановлена последняя подтверждённая позиция.'); setFailureCode(''); }
      } catch (error) { if (alive) showError(error); }
      finally { restoring = false; }
    };
    const resume = async () => {
      if (confirming || !active || document.hidden || syncing || finishing) return;
      if (!await sync()) return;
      // Every intentional resume rereads the owner run, including changes from another device.
      await restore();
      if (currentStatus !== 'paused' || !alive) return;
      paused = false; change(normalStatus()); render(); startLoop();
      if (journal.state.phase === 'defeat') void finish('defeat');
    };
    const leave = () => { if (currentStatus === 'result' || currentStatus === 'expired' || currentStatus === 'unsupported') { settings.current.onExit(); return; } paused = true; confirming = true; stop(); if (alive) setConfirm(true); if (currentStatus !== 'error') change('paused'); render(); };
    const cancelLeave = () => { confirming = false; if (alive) setConfirm(false); change(currentStatus === 'error' ? 'error' : 'paused'); render(); };
    const saveExit = async () => { if (await sync()) settings.current.onExit(); };
    const retire = () => { confirming = false; if (alive) setConfirm(false); void finish(journal.state.phase === 'defeat' ? 'defeat' : 'retire'); };
    const retry = async () => {
      if (!await sync()) return;
      if (finishInput) { void finish(finishInput.endReason); return; }
      if (journal.state.phase === 'defeat') { void finish('defeat'); return; }
      change('paused'); render();
    };
    loopRef.current = { choose, select, command, start: () => { void start(); }, pause, resume: () => { void resume(); }, leave, cancelLeave, saveExit: () => { void saveExit(); }, retire, retry: () => { void retry(); }, restore: () => { void restore(); } };
    const visibility = () => {
      if (document.hidden) pause();
      else { backdrop = makeTowerBackdrop(map); render(); if (paused && !confirming && currentStatus !== 'result' && active) void sync().then(ok => { if (ok) void restore(); }); }
    };
    const deactivate = () => { active = false; pause(); };
    const activate = () => { active = true; visibility(); };
    const app = webApp();
    document.addEventListener('visibilitychange', visibility); window.addEventListener(TOWER_BACK_EVENT, leave);
    app?.onEvent('deactivated', deactivate); app?.onEvent('activated', activate);
    const observer = new ResizeObserver(resize); observer.observe(stage);
    const themeObserver = new MutationObserver(() => { backdrop = makeTowerBackdrop(map); render(); }); themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
    setResult(null); setConfirm(false); setFailureCode(''); change(currentStatus); updateHud(); resize();
    if (journal.state.phase === 'defeat') void finish('defeat');
    return () => {
      alive = false; stop(); clearTimeout(buildSaveTimer); observer.disconnect(); themeObserver.disconnect();
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener(TOWER_BACK_EVENT, leave);
      app?.offEvent('deactivated', deactivate); app?.offEvent('activated', activate); loopRef.current = null;
    };
  }, [activeRun.runId]);

  const selectedTower = hud.selected ? hud.state.towers.find(t => t.x === hud.selected!.x && t.y === hud.selected!.y) : undefined;
  const buildable = hud.selected && generateTowerMap(activeRun.seed).buildable.some(p => p.x === hud.selected!.x && p.y === hud.selected!.y);
  const building = status === 'build';
  const selectedStats = towerLevelStats(selectedTower?.type ?? hud.type, selectedTower?.level ?? 1);
  const upgradePrice = selectedTower && selectedTower.level < 3 ? TOWER_CONFIG.towers[selectedTower.type].upgrades[selectedTower.level - 1] : 0;
  const actionCell = hud.selected;
  const restart = async () => {
    if (restarting) return; setRestarting(true); setRestartError(null);
    try { setRestartRun(await settings.current.onRestart()); setResult(null); }
    catch (error) { setRestartError(errorMessage(error)); }
    finally { setRestarting(false); }
  };
  return <section className="tower-game" data-tower-state={status} data-phase={status} data-tick={hud.tick} data-wave={hud.wave} aria-label="Защита гнезда">
    <header className="tower-header">
      <div className="native-hud-primary"><h1>Защита гнезда</h1></div>
      <div className="tower-hud">
        <button type="button" className="tower-round" aria-label="Выйти из защиты гнезда" onClick={() => loopRef.current?.leave()}>‹</button>
        <div><span>Гнездо</span><strong aria-label={`Здоровье гнезда ${hud.hp} из 10`}>♡ {hud.hp}</strong></div>
        <div><span>Волна</span><strong>{hud.wave || 1}</strong></div>
        <div><span>Монеты</span><strong>{hud.coins}</strong></div>
        <button type="button" className="tower-round" aria-label="Пауза" disabled={status !== 'playing'} onClick={() => loopRef.current?.pause()}>Ⅱ</button>
      </div>
    </header>
    <div className="tower-stage" ref={stageRef}>
      <div className="tower-surface" ref={surfaceRef} role="application" aria-label="Поле защиты гнезда" aria-describedby="tower-help" tabIndex={0}
        onPointerDown={event => {
          if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || status !== 'build') return;
          event.preventDefault(); surfaceRef.current?.focus({ preventScroll: true });
          const rect = event.currentTarget.getBoundingClientRect(); loopRef.current?.select({ x: Math.floor((event.clientX - rect.left) / rect.width * 10), y: Math.floor((event.clientY - rect.top) / rect.height * 14) });
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); loopRef.current?.leave(); return; }
          if (!building || event.altKey || event.ctrlKey || event.metaKey) return;
          const cell = hud.selected ?? { x: 1, y: 1 };
          if (event.key.startsWith('Arrow')) { event.preventDefault(); loopRef.current?.select({ x: cell.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0), y: cell.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0) }); }
          else if (event.key === 'Enter' && actionCell && !selectedTower && buildable && hud.coins >= selectedStats.price) { event.preventDefault(); loopRef.current?.command({ type: 'place', ...actionCell, towerType: hud.type }); }
        }}>
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    </div>
    <div className="tower-bottom">
      <div className="tower-tools" role="group" aria-label="Виды башен">
        {(Object.keys(typeSymbols) as TowerType[]).map(type => <button type="button" key={type} disabled={!building} className={hud.type === type ? 'selected' : ''} aria-pressed={hud.type === type} aria-label={`${TOWER_CONFIG.towers[type].label} · ${TOWER_CONFIG.towers[type].price} монет`} onClick={() => loopRef.current?.choose(type)}><b aria-hidden="true">{typeSymbols[type]}</b><span>{TOWER_CONFIG.towers[type].label}<small>{TOWER_CONFIG.towers[type].price} ◦</small></span></button>)}
      </div>
      {actionCell && building ? <div className="tower-selection" aria-live="polite">
        {selectedTower ? <><span>{TOWER_CONFIG.towers[selectedTower.type].label} · ур. {selectedTower.level}/3<small>Урон {selectedStats.damage} · {(selectedStats.interval * .05).toFixed(2)} с · дальн. {(selectedStats.range / 1000).toFixed(1)}</small></span><button type="button" disabled={!upgradePrice || hud.coins < upgradePrice} onClick={() => loopRef.current?.command({ type: 'upgrade', ...actionCell })}>{upgradePrice ? `Улучшить за ${upgradePrice}` : 'Макс. уровень'}</button><button type="button" onClick={() => loopRef.current?.command({ type: 'sell', ...actionCell })}>Продать за {Math.floor(selectedTower.invested * .65)}</button></>
          : buildable ? <><span>Урон {selectedStats.damage} · {hud.type === 'seed' ? 'по группе' : hud.type === 'frost' ? 'замедляет' : 'одна цель'}<small>{(selectedStats.interval * .05).toFixed(2)} с · дальн. {(selectedStats.range / 1000).toFixed(1)} клетки</small></span><button type="button" disabled={hud.coins < selectedStats.price} onClick={() => loopRef.current?.command({ type: 'place', ...actionCell, towerType: hud.type })}>Поставить за {selectedStats.price}</button></>
            : <span>На дорожке и пропах строить нельзя. Выберите светлую клетку.</span>}
      </div> : <p className="tower-tip" id="tower-help">{status === 'playing' ? 'Башни сражаются. Строить можно между волнами.' : message}<span className="tower-key-help"> Стрелки — клетка, Enter — поставить.</span></p>}
      <button type="button" className="button primary tower-wave" disabled={!building} onClick={() => loopRef.current?.start()}>{status === 'saving' ? 'Сохраняем позицию…' : status === 'playing' ? `Волна ${hud.wave} идёт…` : `Начать волну ${hud.completedWave + 1}`}</button>
      <small className="tower-reward-note">Завершено: {hud.completedWave} · награда до {towerRewardAmount(hud.completedWave)} перьев · раз в 20 ч</small>
    </div>
    {(status === 'paused' || status === 'error' || status === 'expired' || status === 'unsupported' || status === 'result' || status === 'defeat') && !confirm && <div className="tower-overlay" role="dialog" aria-modal="true" aria-label={status === 'result' ? 'Результат защиты гнезда' : 'Защита гнезда на паузе'}>
      <div className="tower-dialog">
        {status === 'result' && result ? <><div className="tower-result-mark" aria-hidden="true">⌂</div><h2>{result.newBest ? 'Новый личный рекорд!' : 'Гнездо благодарит'}</h2><div className="tower-result-stats"><div><span>Завершено волн</span><strong>{result.verifiedWave}</strong></div><div><span>Рекорд</span><strong>{result.bestScore}</strong></div></div><p>{result.rewarded ? `Получено ${result.rewardAmount} ${result.rewardAmount === 1 ? 'пёрышко' : 'пёрышка'}.` : result.verifiedWave < 3 ? 'Пройдите 3 волны, чтобы получить первое пёрышко.' : 'Рекорд сохранён. Следующая награда после отдельного перерыва в 20 часов.'}</p><button type="button" className="button primary" disabled={restarting} onClick={() => { void restart(); }}>{restarting ? 'Готовим карту…' : 'Новая карта'}</button><button type="button" className="button text-button" onClick={props.onExit}>К активностям</button>{restartError && <p role="status">{restartError}</p>}</>
          : status === 'expired' || status === 'unsupported' ? <><h2>{status === 'expired' ? 'Партия устарела' : 'Нужно обновить игру'}</h2><p>{status === 'expired' ? 'После 24 часов без активности карта закрывается. Птицы и пёрышки сохранены.' : 'Версия этой карты изменилась. Обновите Mini App и откройте активности.'}</p><button type="button" className="button primary" onClick={props.onExit}>К активностям</button></>
            : status === 'error' ? <><h2>Позиция ждёт</h2><p role="status">{message}</p><button type="button" className="button primary" onClick={() => loopRef.current?.retry()}>Повторить сохранение</button><button type="button" className="button secondary" onClick={() => loopRef.current?.restore()}>Загрузить позицию сервера</button><small>{failureCode === 'CONFLICT' || failureCode === 'RUN_CONFLICT' ? 'Другое устройство изменило партию. Загрузка заменит местные несохранённые действия.' : 'Повтор отправит те же действия с прежним ключом. Загрузка сервера вернёт последнюю подтверждённую позицию.'}</small><button type="button" className="button text-button" onClick={() => loopRef.current?.leave()}>Выйти</button></>
              : <><h2>{status === 'defeat' ? 'Сохраняем защиту…' : 'Защита на паузе'}</h2><p>Враги ждут. После возвращения загрузим подтверждённую позицию; в фоне гнездо не пострадает.</p><button type="button" className="button primary" onClick={() => loopRef.current?.resume()}>Продолжить защиту</button><button type="button" className="button secondary" onClick={() => loopRef.current?.saveExit()}>Сохранить и выйти</button><button type="button" className="button text-button" onClick={() => loopRef.current?.leave()}>Завершить партию</button></>}
      </div>
    </div>}
    {confirm && <div className="tower-overlay" onPointerDown={event => event.stopPropagation()}><div className="tower-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tower-leave-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); loopRef.current?.cancelLeave(); }
      if (event.key === 'Tab') { const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')); const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    }}><h2 id="tower-leave-title">Отдохнём?</h2><p>Можно сохранить карту для продолжения или закончить партию. Награда зависит от полностью подтверждённых волн.</p><button type="button" className="button primary" autoFocus onClick={() => loopRef.current?.cancelLeave()}>Остаться в игре</button><button type="button" className="button secondary" onClick={() => loopRef.current?.saveExit()}>Сохранить и выйти</button><button type="button" className="button text-button" onClick={() => loopRef.current?.retire()}>Завершить и получить результат</button></div></div>}
    {status === 'saving' && <div className="tower-saving" role="status"><span className="spinner" /><span>Проверяем и сохраняем…</span></div>}
  </section>;
}
