import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface Props { route: string; children: ReactNode; fixed?: boolean }

/** One mounted route only: rapid switching cannot leave stale controls active. */
export function ScreenTransition({ route, children, fixed = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const parent = ref.current?.closest<HTMLElement>('.app-main');
    if (!parent) return;
    parent.scrollTop = fixed ? 0 : positions.current.get(route) ?? 0;
    // Preserve the position as the user scrolls. Reading in cleanup can lose it
    // when the next route is shorter and the browser already clamps scrollTop.
    const remember = () => { positions.current.set(route, parent.scrollTop); };
    parent.addEventListener('scroll', remember, { passive: true });
    return () => { parent.removeEventListener('scroll', remember); };
  }, [route, fixed]);
  return <div ref={ref} className={`screen-transition ${fixed ? 'screen-fixed' : ''}`} key={route} data-route={route}>{children}</div>;
}
