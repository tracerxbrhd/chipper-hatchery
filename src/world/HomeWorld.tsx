import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { webApp } from '../api/telegram';
import { ChickArt, type ChickArtHandle } from '../components/ChickArt';
import { visualDetailsFor } from '../chicks/models';
import type { Chick, GuestChickDTO } from '../types';
import { cancelWorldTouch, createWorldModel, dragWorldChick, greetWorldChick, lookWorldChick, pickupWorldChick, releaseWorldChick, setWorldTarget, startWorldCare, startWorldGrowth, stepWorld, strokeWorldChick, worldFrame, type WorldFrame } from './worldEngine';
import { projectWorld, WORLD_FOOD, WORLD_HOME, worldPointFromPointer, worldSeed } from './worldMath';
import { beginTouch, finishTouch, holdTouch, HOLD_MS, moveTouch, type TouchGesture, type TouchSession } from './touchGestures';
import { boundWorldPoint, clamp } from './worldMath';
import { GuestChick, type GuestChickHandle } from './GuestChick';
import { createGuestWorld, pairOwnerPointFromPointer, projectPair, stepGuestWorld } from './guestWorld';
import './world.css';

export interface HomeWorldProps {
  chick: Chick;
  animate: boolean;
  action?: 'idle' | 'feed' | 'play' | 'grow';
  actionKey?: string | number;
  now?: number;
  sleeping?: boolean;
  readOnly?: boolean;
  onTouchFeedback?: (kind: string) => void;
  guest?: GuestChickDTO | null;
}

/** A local actor on a projected ground plane. Server actions are the sole care authority. */
export function HomeWorld({ chick, animate, action = 'idle', actionKey, now = Date.now(), sleeping: sleepingOverride, readOnly = false, onTouchFeedback, guest }: HomeWorldProps) {
  const instructionsId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLButtonElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const art = useRef<ChickArtHandle>(null);
  const guestActor = useRef<GuestChickHandle>(null);
  const model = useRef(createWorldModel(visualDetailsFor(chick).fingerprint));
  const [frame, setFrame] = useState<WorldFrame>(() => worldFrame(model.current));
  const [size, setSize] = useState(220);
  const dimensions = useRef({ width: 360, height: 300, size: 220 });
  const session = useRef<TouchSession | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capture = useRef<HTMLButtonElement | null>(null);
  const pickupOrigin = useRef({ point: { ...WORLD_HOME }, lift: 0 });
  const [gesture, setGesture] = useState<TouchGesture>('idle');
  const [transient, setTransient] = useState(false);
  const suppressClick = useRef(false);
  const lastPointerPoseAt = useRef(0);
  const [visible, setVisible] = useState(() => !document.hidden && webApp()?.isActive !== false);
  const sleeping = sleepingOverride ?? (chick.sleepUntil !== null && chick.sleepUntil > now);
  const sleepingRef = useRef(sleeping);
  const previousStage = useRef(chick.stage);
  const frameRef = useRef(frame);
  const guestChick = readOnly ? null : guest?.chick;
  const pair = Boolean(guestChick);
  const guestModel = useRef(createGuestWorld(guestChick ? visualDetailsFor(guestChick).fingerprint : worldSeed('guest')));
  const pairGreetingAt = useRef(-1);
  const [guestFrame, setGuestFrame] = useState<WorldFrame>(() => worldFrame(guestModel.current.actor));
  const guestFrameRef = useRef(guestFrame);
  const pairRef = useRef(pair);
  pairRef.current = pair;
  const projectActor = (point: typeof WORLD_HOME) => pairRef.current ? projectPair(point, 'owner') : projectWorld(point);
  const food = projectActor(WORLD_FOOD);

  // Movement and joints update directly. React only renders a new semantic state.
  function draw(next: WorldFrame) {
    const projected = projectActor(next.position);
    if (actor.current) {
      actor.current.style.left = `${projected.x}%`;
      actor.current.style.top = `${projected.y}%`;
      actor.current.style.transform = `translate(-50%, -88.125%) translateY(${-next.lift}px) scale(${projected.scale}) rotate(${animate && next.mode === 'held' ? -next.motion * 4 : 0}deg)`;
      actor.current.dataset.lift = String(next.lift);
    }
    if (shadow.current) {
      shadow.current.style.left = `${projected.x}%`;
      shadow.current.style.top = `${projected.y}%`;
      shadow.current.style.transform = `translate(-50%, -50%) scale(${projected.scale * (1 - Math.min(.25, next.lift / 200))})`;
      shadow.current.style.opacity = String(projected.shadowOpacity * (1 - Math.min(.5, next.lift / 120)));
    }
  }

  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      // The silhouette stays legible on short viewports while keeping its head inside the scene.
      const measuredSize = Math.max(pair ? 65 : 95, Math.min(pair ? 330 : 430, width * (pair ? .58 : 1.02), height * 1.08));
      dimensions.current = { width, height, size: measuredSize };
      setSize(measuredSize);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [pair]);

  useEffect(() => {
    guestModel.current = createGuestWorld(guestChick ? visualDetailsFor(guestChick).fingerprint : worldSeed('guest'));
    pairGreetingAt.current = -1;
    setGuestFrame(worldFrame(guestModel.current.actor));
    draw(frameRef.current);
  }, [guestChick?.id, pair]);

  useEffect(() => {
    cancelGesture();
    previousStage.current = chick.stage;
    model.current = createWorldModel(visualDetailsFor(chick).fingerprint);
    const initial = stepWorld(model.current, 0, sleepingRef.current);
    frameRef.current = initial;
    setFrame(initial);
    draw(initial);
  }, [chick.id]);

  useEffect(() => {
    sleepingRef.current = sleeping;
    if (sleeping) cancelGesture();
    const next = stepWorld(model.current, 0, sleeping);
    frameRef.current = next;
    setFrame(next);
    draw(next);
  }, [sleeping]);

  useEffect(() => {
    if (readOnly) cancelGesture();
  }, [readOnly]);

  useEffect(() => {
    if (previousStage.current === chick.stage) return;
    previousStage.current = chick.stage;
    cancelGesture();
    if (!sleepingRef.current && startWorldGrowth(model.current)) {
      const next = worldFrame(model.current);
      frameRef.current = next;
      setFrame(next);
      draw(next);
    }
  }, [chick.stage]);

  useEffect(() => {
    if (sleepingRef.current) return;
    if (action === 'idle') {
      // A still world has no ambient clock to finish care. Once the server
      // action's presentation ends, it must become available for touch again.
      if (!animate && ['feed', 'play', 'grow'].includes(model.current.mode)) {
        model.current.mode = 'idle'; model.current.target = null; model.current.feeding = false;
        model.current.stateTime = 0;
        const next = worldFrame(model.current);
        frameRef.current = next; setFrame(next); draw(next);
      }
      return;
    }
    cancelGesture();
    if (action === 'grow') startWorldGrowth(model.current);
    else startWorldCare(model.current, action);
    const next = worldFrame(model.current);
    frameRef.current = next;
    setFrame(next);
    draw(next);
  }, [action, actionKey, animate]);

  useEffect(() => {
    const app = webApp();
    const show = () => {
      const active = !document.hidden && app?.isActive !== false;
      if (!active) cancelGesture();
      setVisible(active);
    };
    const hide = () => { cancelGesture(); setVisible(false); };
    const blur = () => cancelGesture();
    const secondPointer = (event: globalThis.PointerEvent) => {
      if (session.current && event.pointerId !== session.current.pointerId) cancelGesture();
    };
    window.addEventListener('blur', blur);
    document.addEventListener('pointerdown', secondPointer, true);
    document.addEventListener('visibilitychange', show);
    app?.onEvent('activated', show);
    app?.onEvent('deactivated', hide);
    return () => {
      document.removeEventListener('visibilitychange', show);
      window.removeEventListener('blur', blur);
      document.removeEventListener('pointerdown', secondPointer, true);
      clearHold();
      releaseCapture();
      session.current = null;
      cancelWorldTouch(model.current);
      app?.offEvent('activated', show);
      app?.offEvent('deactivated', hide);
    };
  }, []);

  useEffect(() => {
    if (!visible || (!animate && !transient)) return;
    let request = 0;
    let previous: number | null = null;
    let lastPoseAt = 0;
    const tick = (timestamp: number) => {
      const delta = previous === null ? 0 : Math.min(.05, (timestamp - previous) / 1000);
      previous = timestamp;
      // Renderer plants a foot for 60% of a cycle, translating it by 16 viewBox units.
      // Matching that stance travel prevents short-screen birds from skating along the plane.
      const projected = projectActor(model.current.position);
      const stride = dimensions.current.size * projected.scale / 320 * (16 / .6) / Math.max(1, dimensions.current.width * .78 * (pairRef.current ? .3 : 1));
      const next = stepWorld(model.current, delta, sleepingRef.current, stride);
      const guestNext = pairRef.current && animate ? stepGuestWorld(guestModel.current, delta, next,
        dimensions.current.size * .9 / 320 * (16 / .6) / Math.max(1, dimensions.current.width * .78 * .25)) : null;
      if (guestNext && !session.current && model.current.mode === 'idle' && ['greet', 'look', 'together'].includes(guestModel.current.phase)) lookWorldChick(model.current, 1, 0);
      if (guestNext && guestModel.current.phase === 'greet' && pairGreetingAt.current !== guestModel.current.phaseAt) {
        pairGreetingAt.current = guestModel.current.phaseAt;
        if (!session.current && model.current.mode === 'idle' && !sleepingRef.current) greetWorldChick(model.current);
      }
      if (!session.current && ['tap', 'stroke', 'land'].includes(gesture) && !['tap', 'stroke', 'land'].includes(next.mode)) setGesture('idle');
      if (!animate && !['held', 'land', 'tap', 'stroke'].includes(next.mode)) {
        setTransient(false);
        draw(next);
        frameRef.current = next; setFrame(next);
        return;
      }
      draw(next);
      if (timestamp - lastPoseAt >= 1000 / 30 || next.pose !== frameRef.current.pose) {
        lastPoseAt = timestamp;
        const changed = next.pose !== frameRef.current.pose || next.direction !== frameRef.current.direction || next.mode !== frameRef.current.mode || next.reaction !== frameRef.current.reaction;
        art.current?.update({ phase: animate ? next.phase : next.pose === 'tap' || next.pose === 'land' ? .5 : 0, motion: animate ? next.motion : 0, gaze: next.gaze });
        frameRef.current = next;
        if (changed) setFrame(next);
        if (guestNext) {
          guestActor.current?.update(guestNext, guestModel.current.phase);
          const old = guestFrameRef.current;
          if (guestNext.pose !== old.pose || guestNext.direction !== old.direction || guestNext.reaction !== old.reaction) setGuestFrame(guestNext);
          guestFrameRef.current = guestNext;
        }
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [animate, visible, transient, gesture, pair]);

  const publish = () => {
    const next = worldFrame(model.current);
    frameRef.current = next;
    setFrame(next);
    draw(next);
  };
  const publishPointer = () => {
    // Drag translation is imperative; pointer frequencies must not redraw the SVG at 60–120 Hz.
    const next = worldFrame(model.current);
    draw(next);
    const timestamp = performance.now();
    if (timestamp - lastPointerPoseAt.current >= 1000 / 30) {
      lastPointerPoseAt.current = timestamp;
      const previous = frameRef.current;
      if (next.pose !== previous.pose || next.direction !== previous.direction || next.mode !== previous.mode || next.reaction !== previous.reaction) setFrame(next);
      art.current?.update({ phase: animate ? next.phase : .5, motion: animate ? next.motion : 0, gaze: next.gaze });
      frameRef.current = next;
    }
  };
  const approach = (event: PointerEvent<HTMLDivElement>) => {
    if (readOnly || !visible || sleepingRef.current || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const target = pairRef.current ? pairOwnerPointFromPointer(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
      : worldPointFromPointer(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
    if (target && setWorldTarget(model.current, target)) {
      event.preventDefault();
      if (!animate) { model.current.position = target; model.current.target = null; model.current.mode = 'look'; }
      publish();
    }
  };
  const keyApproach = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || readOnly || !visible) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (setWorldTarget(model.current, WORLD_HOME)) {
        if (!animate) { model.current.position = { ...WORLD_HOME }; model.current.target = null; model.current.mode = 'look'; }
        publish();
      }
    }
  };
  function clearHold() {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }
  function releaseCapture() {
    const node = capture.current;
    const pointerId = session.current?.pointerId;
    capture.current = null;
    session.current = null;
    if (node && pointerId !== undefined && node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
  }
  function cancelGesture() {
    clearHold();
    releaseCapture();
    session.current = null;
    cancelWorldTouch(model.current);
    setGesture('idle');
    setTransient(false);
    const next = worldFrame(model.current);
    frameRef.current = next; setFrame(next); draw(next);
  }
  function maxLift(point = model.current.position) {
    const d = dimensions.current;
    const projected = projectActor(point);
    // Actual head/crest start below the transparent top of the shared viewBox.
    return Math.max(0, Math.min(d.height * .42, projected.y / 100 * d.height - d.size * projected.scale * .76 - 6));
  }
  function pickup() {
    const active = session.current;
    if (!active || !holdTouch(active, performance.now()) || sleepingRef.current || readOnly || !visible) return;
    const lift = Math.min(38, dimensions.current.size * .18, maxLift());
    if (!pickupWorldChick(model.current, lift)) { cancelGesture(); return; }
    pickupOrigin.current = { point: { ...model.current.position }, lift };
    if (!animate) model.current.lift = lift;
    setGesture('held'); setTransient(true);
    onTouchFeedback?.('pickup'); publish();
  }
  const touchDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (readOnly || !visible || event.button !== 0 || event.isPrimary === false || sleepingRef.current) return;
    if (session.current) { cancelGesture(); return; }
    if (['feed', 'play', 'grow', 'wake', 'land'].includes(model.current.mode)) return;
    event.preventDefault(); suppressClick.current = true;
    session.current = beginTouch(event.pointerId, { x: event.clientX, y: event.clientY }, performance.now());
    capture.current = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
    model.current.target = null;
    if (['walk', 'turn'].includes(model.current.mode)) model.current.mode = 'idle';
    setGesture('hold'); publish();
    holdTimer.current = setTimeout(pickup, HOLD_MS + 1);
  };
  const touchMove = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const kind = moveTouch(active, { x: event.clientX, y: event.clientY });
    if (kind === 'stroke') {
      clearHold(); strokeWorldChick(model.current); setGesture('stroke'); setTransient(true);
      if (!animate) publishPointer();
    } else if (kind === 'held' || kind === 'drag') {
      const d = dimensions.current;
      const dx = event.clientX - active.start.x;
      const dy = event.clientY - active.start.y;
      const point = boundWorldPoint({ u: pickupOrigin.current.point.u + dx / Math.max(1, d.width * .78 * (pairRef.current ? .3 : 1)), v: pickupOrigin.current.point.v + dy / Math.max(1, d.height * .31) });
      const originalGround = projectActor(pickupOrigin.current.point).y / 100 * d.height;
      const ground = projectActor(point).y / 100 * d.height;
      const lift = clamp(pickupOrigin.current.lift + ground - originalGround - dy, 0, maxLift(point));
      dragWorldChick(model.current, point, lift);
      if (!animate) { model.current.position = point; model.current.lift = lift; }
      setGesture(kind);
      if (!animate) publishPointer();
    }
  };
  const touchUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault(); clearHold();
    const kind = finishTouch(active);
    releaseCapture(); session.current = null;
    if (kind === 'land') releaseWorldChick(model.current);
    else if (kind === 'stroke') strokeWorldChick(model.current);
    else greetWorldChick(model.current);
    setGesture(kind); setTransient(true); onTouchFeedback?.(kind); publish();
  };
  const gaze = (event: PointerEvent<HTMLDivElement>) => {
    if (!visible || session.current || sleepingRef.current) return;
    const rect = actor.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (event.clientX - rect.x - rect.width / 2) / Math.max(1, rect.width * .7);
    const y = (event.clientY - rect.y - rect.height / 2) / Math.max(1, rect.height * .7);
    lookWorldChick(model.current, x, y);
    if (!animate) publishPointer();
  };
  const greet = (detail: number) => {
    if (detail !== 0 && suppressClick.current) { suppressClick.current = false; return; }
    if (!visible || readOnly || sleepingRef.current) return;
    if (greetWorldChick(model.current)) { setGesture('tap'); setTransient(true); onTouchFeedback?.('tap'); publish(); }
  };
  const projected = projectActor(frame.position);
  // Still care keeps its semantic pose even when the engine has a walk target.
  // Tactile poses remain available; motion reduction never disables touch.
  const tactilePose = ['held', 'land', 'tap', 'stroke'].includes(frame.pose);
  const presentationPose = sleeping ? 'sleep' : animate || tactilePose ? frame.pose
    : action === 'feed' || action === 'play' || action === 'grow' ? action : 'look';
  return <div className={`living-world ${!animate ? 'living-world--still' : ''} ${pair ? 'living-world--pair' : ''}`} ref={surface} onPointerDown={approach} onPointerMove={gaze} onPointerLeave={() => lookWorldChick(model.current, 0, 0)} onKeyDown={keyApproach} role="group" tabIndex={readOnly ? -1 : 0} aria-label={`Поляна: ${chick.name}`} aria-describedby={instructionsId} data-mode={frame.mode} data-gesture={gesture} data-read-only={String(readOnly)} data-running={animate && visible ? 'true' : 'false'} data-guest-count={pair ? 1 : 0}>
    <div className="world-sky" aria-hidden="true" />
    <div className="world-celestial" aria-hidden="true"><i /><i /><i /></div>
    <svg className="world-landscape" viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true">
      <path className="world-hill-far" d="M0 235Q95 154 216 214Q313 150 420 196Q517 132 600 205V400H0Z" />
      <path className="world-hill-near" d="M0 274Q79 212 182 261Q292 202 409 253Q502 220 600 271V400H0Z" />
      <g className="world-distant-grass"><path d="M28 258q-15-34-6-57m6 57q-1-38 15-47m-9 46q13-30 25-27M533 252q-11-33-3-53m5 52q2-34 18-42m-7 44q10-22 26-24" /></g>
    </svg>
    <div className="world-light" aria-hidden="true" />
    <span className="world-mote world-mote--one" aria-hidden="true" /><span className="world-mote world-mote--two" aria-hidden="true" /><span className="world-mote world-mote--three" aria-hidden="true" />
    <svg className="world-ground" viewBox="0 0 600 230" preserveAspectRatio="none" aria-hidden="true">
      <ellipse className="world-ground-rim" cx="300" cy="121" rx="283" ry="93" />
      <ellipse className="world-ground-base" cx="300" cy="110" rx="283" ry="93" />
      <ellipse className="world-ground-pool" cx="317" cy="104" rx="190" ry="54" />
      <path className="world-ground-contour" d="M52 118c28 63 153 83 248 83s216-19 248-82" />
      <path className="world-ground-trail" d="M127 124c50-29 134-38 215-26s104 34 116 40" />
    </svg>
    <svg className="world-sprig world-sprig--back" viewBox="0 0 44 42" aria-hidden="true"><path d="M22 38V14m0 14C9 26 9 15 7 12m15 12C33 21 32 12 36 9m-14 9C17 9 20 6 22 3" /></svg>
    <span className="world-pebble world-pebble--back" aria-hidden="true" />
    <svg className="world-flowers" viewBox="0 0 60 60" aria-hidden="true"><path d="M17 55l1-29m21 29L36 13M9 44q10-1 9-9m21 10q8-9 13-6" /><g><circle cx="18" cy="23" r="6" /><circle cx="36" cy="12" r="7" /></g><circle cx="18" cy="23" r="2" /><circle cx="36" cy="12" r="2.5" /></svg>
    <div className={`world-food ${frame.mode === 'feed' ? 'world-food--served' : ''}`} style={{ left: `${food.x}%`, top: `${food.y}%`, marginLeft: `${(frame.direction === 'left' ? -1 : 1) * size * (76 / 320) * projected.scale}px`, marginTop: `${-3 / 320 * size * projected.scale}px` }} aria-hidden="true"><i /><i /><i /><i /><i /></div>
    {frame.mode === 'play' && <span className="world-heart" style={{ left: `${projected.x + 8}%`, top: `calc(${projected.y}% - ${size * .57 * projected.scale}px)` }} aria-hidden="true">♡</span>}
    <div className="world-shadow" ref={shadow} style={{ left: `${projected.x}%`, top: `${projected.y}%`, width: size * .37, height: Math.max(5, size * .035), opacity: projected.shadowOpacity * (1 - Math.min(.5, frame.lift / 120)), transform: `translate(-50%, -50%) scale(${projected.scale * (1 - Math.min(.25, frame.lift / 200))})` }} aria-hidden="true" />
    <button className="world-chick-action" ref={actor} type="button" disabled={sleeping || readOnly} data-growing={animate && visible && frame.mode === 'grow' ? 'true' : undefined} aria-label={`Погладить: ${chick.name}`} onPointerDown={touchDown} onPointerMove={touchMove} onPointerUp={touchUp} onPointerCancel={cancelGesture} onLostPointerCapture={() => { if (session.current) cancelGesture(); }} onClick={event => greet(event.detail)} style={{ left: `${projected.x}%`, top: `${projected.y}%`, width: size, height: size, transform: `translate(-50%, -88.125%) translateY(${-frame.lift}px) scale(${projected.scale}) rotate(${animate && frame.mode === 'held' ? -frame.motion * 4 : 0}deg)` }}>
      <div className="world-chick-visual"><ChickArt ref={art} chick={chick} pose={presentationPose} direction={frame.direction} phase={animate ? frame.phase : frame.pose === 'tap' || frame.pose === 'land' ? .5 : 0} reaction={frame.reaction} motion={animate ? frame.motion : 0} gaze={frame.gaze} animate={animate && visible} shadow={false} size={size} /></div>
    </button>
    {guestChick && guest && <GuestChick ref={guestActor} key={guestChick.id} chick={guestChick} displayName={guest.displayName} frame={guestFrame} size={size} animate={animate && visible} phase={guestModel.current.phase} />}
    <svg className="world-sprig world-sprig--front" viewBox="0 0 44 42" aria-hidden="true"><path d="M22 38V16m0 16C12 23 9 24 5 18m17 11c7-13 13-10 17-18m-17 11C19 10 22 9 25 5" /></svg>
    <span className="world-pebble world-pebble--front" aria-hidden="true" />
    {animate && ['sneeze', 'startle', 'stretch', 'shake', 'stumble'].includes(frame.mode) && <span className="world-whimsy" aria-hidden="true">{({ sneeze: 'Апчхи! Пыльца щекочет', startle: 'Ой. Это была собственная тень', stretch: 'Зарядка для одного пера', shake: 'Пушистость восстановлена', stumble: 'Так и было задумано' } as Record<string, string>)[frame.mode]}</span>}
    <span className="world-instructions" id={instructionsId}>{readOnly ? 'В гостях — любуемся без забот и перемещений' : sleeping ? 'На поляне тихо и спокойно' : gesture === 'held' || gesture === 'drag' ? 'Отпустите — и птенец мягко приземлится' : gesture === 'stroke' ? 'Вот так, нежно' : frame.mode === 'feed' ? 'Зёрнышки уже на поляне' : frame.mode === 'play' ? 'Как хорошо быть рядом' : 'Погладьте птенца · задержите палец, чтобы поднять'}</span>
  </div>;
}
