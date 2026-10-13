/** Input policy stays independent of event wiring so duplicate/secondary taps are testable. */
export function isFlapPointer(event: { isPrimary: boolean; button: number; pointerType: string }): boolean {
  return event.isPrimary && (event.pointerType !== 'mouse' || event.button === 0);
}
export function isFlapKey(event: { key: string; repeat: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  return !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === ' ' || event.key === 'ArrowUp');
}

export const FLAPS_BACK_EVENT = 'chipper:flaps-back';
export function requestFlapsLeave(): void {
  window.dispatchEvent(new Event(FLAPS_BACK_EVENT));
}
