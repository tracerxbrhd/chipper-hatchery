import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { webApp } from '../api/telegram';
import { ChickArt } from '../components/ChickArt';
import type { Chick } from '../types';
import { createWorldModel, greetWorldChick, setWorldTarget, startWorldCare, startWorldGrowth, stepWorld, worldFrame, type WorldFrame } from './worldEngine';
import { projectWorld, WORLD_FOOD, WORLD_HOME, worldPointFromPointer, worldSeed } from './worldMath';
import './world.css';

export interface HomeWorldProps {
  chick: Chick;
  animate: boolean;
  action?: 'idle' | 'feed' | 'play' | 'grow';
  actionKey?: string | number;
  now?: number;
  sleeping?: boolean;
}

/** A local actor on a projected ground plane. Server actions are the sole care authority. */
export function HomeWorld({ chick, animate, action = 'idle', actionKey, now = Date.now(), sleeping: sleepingOverride }: HomeWorldProps) {
  const instructionsId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLButtonElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const model = useRef(createWorldModel(worldSeed(chick.id)));
  const [frame, setFrame] = useState<WorldFrame>(() => worldFrame(model.current));
  const [size, setSize] = useState(220);
  const dimensions = useRef({ width: 360, size: 220 });
  const [visible, setVisible] = useState(() => !document.hidden && webApp()?.isActive !== false);
  const sleeping = sleepingOverride ?? (chick.sleepUntil !== null && chick.sleepUntil > now);
  const sleepingRef = useRef(sleeping);
  const previousStage = useRef(chick.stage);
  const frameRef = useRef(frame);
  const food = projectWorld(WORLD_FOOD);

  // Movement and contact transforms update directly; React only updates joint poses at 30 Hz.
  function draw(next: WorldFrame) {
    const projected = projectWorld(next.position);
    if (actor.current) {
      actor.current.style.left = `${projected.x}%`;
      actor.current.style.top = `${projected.y}%`;
      actor.current.style.transform = `translate(-50%, -88.125%) scale(${projected.scale})`;
    }
    if (shadow.current) {
      shadow.current.style.left = `${projected.x}%`;
      shadow.current.style.top = `${projected.y}%`;
      shadow.current.style.transform = `translate(-50%, -50%) scale(${projected.scale})`;
      shadow.current.style.opacity = String(projected.shadowOpacity);
    }
  }

  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      // The silhouette stays legible on short viewports while keeping its head inside the scene.
      const measuredSize = Math.max(95, Math.min(300, width * .78, height * .92));
      dimensions.current = { width, size: measuredSize };
      setSize(measuredSize);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    model.current = createWorldModel(worldSeed(chick.id));
    const initial = stepWorld(model.current, 0, sleepingRef.current);
    frameRef.current = initial;
    setFrame(initial);
    draw(initial);
  }, [chick.id]);

  useEffect(() => {
    sleepingRef.current = sleeping;
    const next = stepWorld(model.current, 0, sleeping);
    frameRef.current = next;
    setFrame(next);
    draw(next);
  }, [sleeping]);

  useEffect(() => {
    if (previousStage.current === chick.stage) return;
    previousStage.current = chick.stage;
    if (!sleepingRef.current && startWorldGrowth(model.current)) {
      const next = worldFrame(model.current);
      frameRef.current = next;
      setFrame(next);
      draw(next);
    }
  }, [chick.stage]);

  useEffect(() => {
    if (action === 'idle' || sleepingRef.current) return;
    if (action === 'grow') startWorldGrowth(model.current);
    else startWorldCare(model.current, action);
    const next = worldFrame(model.current);
    frameRef.current = next;
    setFrame(next);
    draw(next);
  }, [action, actionKey]);

  useEffect(() => {
    const app = webApp();
    const show = () => setVisible(!document.hidden && app?.isActive !== false);
    const hide = () => setVisible(false);
    document.addEventListener('visibilitychange', show);
    app?.onEvent('activated', show);
    app?.onEvent('deactivated', hide);
    return () => {
      document.removeEventListener('visibilitychange', show);
      app?.offEvent('activated', show);
      app?.offEvent('deactivated', hide);
    };
  }, []);

  useEffect(() => {
    if (!animate || !visible) return;
    let request = 0;
    let previous: number | null = null;
    let lastPoseAt = 0;
    const tick = (timestamp: number) => {
      const delta = previous === null ? 0 : Math.min(.05, (timestamp - previous) / 1000);
      previous = timestamp;
      // Renderer plants a foot for 60% of a cycle, translating it by 16 viewBox units.
      // Matching that stance travel prevents short-screen birds from skating along the plane.
      const projected = projectWorld(model.current.position);
      const stride = dimensions.current.size * projected.scale / 320 * (16 / .6) / Math.max(1, dimensions.current.width * .78);
      const next = stepWorld(model.current, delta, sleepingRef.current, stride);
      draw(next);
      if (timestamp - lastPoseAt >= 1000 / 30 || next.pose !== frameRef.current.pose) {
        lastPoseAt = timestamp;
        frameRef.current = next;
        setFrame(next);
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [animate, visible]);

  const publish = () => {
    const next = worldFrame(model.current);
    frameRef.current = next;
    setFrame(next);
    draw(next);
  };
  const approach = (event: PointerEvent<HTMLDivElement>) => {
    if (!animate || !visible || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const target = worldPointFromPointer(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
    if (target && setWorldTarget(model.current, target)) { event.preventDefault(); publish(); }
  };
  const keyApproach = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !animate || !visible) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (setWorldTarget(model.current, WORLD_HOME)) publish();
    }
  };
  const greet = () => {
    if (!visible || sleepingRef.current) return;
    if (greetWorldChick(model.current)) publish();
  };
  const projected = projectWorld(frame.position);
  const reducedPose = sleeping ? 'sleep' : action === 'feed' || action === 'play' || action === 'grow' ? action : 'look';
  return <div className={`living-world ${!animate ? 'living-world--still' : ''}`} ref={surface} onPointerDown={approach} onKeyDown={keyApproach} role="group" tabIndex={animate ? 0 : -1} aria-label={`Поляна: ${chick.name}`} aria-describedby={instructionsId} data-mode={frame.mode} data-running={animate && visible ? 'true' : 'false'}>
    <div className="world-light" aria-hidden="true" />
    <svg className="world-ground" viewBox="0 0 600 230" preserveAspectRatio="none" aria-hidden="true">
      <ellipse className="world-ground-base" cx="300" cy="115" rx="283" ry="93" />
      <path className="world-ground-contour" d="M52 118c28 63 153 83 248 83s216-19 248-82" />
      <path className="world-ground-trail" d="M127 124c50-29 134-38 215-26s104 34 116 40" />
    </svg>
    <svg className="world-sprig world-sprig--back" viewBox="0 0 44 42" aria-hidden="true"><path d="M22 38V14m0 14C9 26 9 15 7 12m15 12C33 21 32 12 36 9m-14 9C17 9 20 6 22 3" /></svg>
    <span className="world-pebble world-pebble--back" aria-hidden="true" />
    <div className={`world-food ${frame.mode === 'feed' ? 'world-food--served' : ''}`} style={{ left: `${food.x}%`, top: `${food.y}%`, marginLeft: `${(frame.direction === 'left' ? -1 : 1) * size * (76 / 320) * projected.scale}px`, marginTop: `${-3 / 320 * size * projected.scale}px` }} aria-hidden="true"><i /><i /><i /><i /><i /></div>
    {frame.mode === 'play' && <span className="world-heart" style={{ left: `${projected.x + 8}%`, top: `calc(${projected.y}% - ${size * .57 * projected.scale}px)` }} aria-hidden="true">♡</span>}
    <div className="world-shadow" ref={shadow} style={{ left: `${projected.x}%`, top: `${projected.y}%`, width: size * .37, height: Math.max(5, size * .035), opacity: projected.shadowOpacity, transform: `translate(-50%, -50%) scale(${projected.scale})` }} aria-hidden="true" />
    <button className="world-chick-action" ref={actor} type="button" disabled={sleeping} data-growing={animate && visible && frame.mode === 'grow' ? 'true' : undefined} aria-label={`Погладить: ${chick.name}`} onPointerDown={event => event.stopPropagation()} onClick={greet} style={{ left: `${projected.x}%`, top: `${projected.y}%`, width: size, height: size, transform: `translate(-50%, -88.125%) scale(${projected.scale})` }}>
      <div className="world-chick-visual"><ChickArt chick={chick} pose={animate ? frame.pose : reducedPose} direction={animate ? frame.direction : 'front'} phase={animate ? frame.phase : 0} animate={animate && visible} shadow={false} size={size} /></div>
    </button>
    <svg className="world-sprig world-sprig--front" viewBox="0 0 44 42" aria-hidden="true"><path d="M22 38V16m0 16C12 23 9 24 5 18m17 11c7-13 13-10 17-18m-17 11C19 10 22 9 25 5" /></svg>
    <span className="world-pebble world-pebble--front" aria-hidden="true" />
    <span className="world-instructions" id={instructionsId}>{sleeping ? 'На поляне тихо и спокойно' : !animate ? 'Ваш маленький мир' : frame.mode === 'feed' ? 'Зёрнышки уже на поляне' : frame.mode === 'play' ? 'Как хорошо быть рядом' : 'Коснитесь поляны — позовите к себе'}</span>
  </div>;
}
