/** Pointer recognizer only. It cannot access care, balances, audio or persistence. */
export type TouchGesture = 'idle' | 'hold' | 'held' | 'drag' | 'stroke' | 'tap' | 'land';
export interface TouchPoint { x: number; y: number }
export interface TouchSession {
  pointerId: number; start: TouchPoint; last: TouchPoint; startedAt: number;
  gesture: TouchGesture; distance: number;
}
export const HOLD_MS = 250;
export const STROKE_THRESHOLD = 8;
export function beginTouch(pointerId: number, point: TouchPoint, now: number): TouchSession {
  return { pointerId, start: { ...point }, last: { ...point }, startedAt: now, gesture: 'hold', distance: 0 };
}
export function moveTouch(session: TouchSession, point: TouchPoint): TouchGesture {
  const distance = Math.hypot(point.x - session.last.x, point.y - session.last.y);
  session.distance += Number.isFinite(distance) ? distance : 0;
  session.last = { ...point };
  // Moving before a stationary hold means petting, never an accidental pickup.
  if (session.gesture === 'hold' && session.distance >= STROKE_THRESHOLD) session.gesture = 'stroke';
  else if (session.gesture === 'held' && session.distance >= STROKE_THRESHOLD) session.gesture = 'drag';
  return session.gesture;
}
export function holdTouch(session: TouchSession, now: number): boolean {
  if (session.gesture !== 'hold' || now - session.startedAt < HOLD_MS) return false;
  session.gesture = 'held';
  return true;
}
export function finishTouch(session: TouchSession): TouchGesture {
  return session.gesture === 'held' || session.gesture === 'drag' ? 'land' : session.gesture === 'stroke' ? 'stroke' : 'tap';
}
