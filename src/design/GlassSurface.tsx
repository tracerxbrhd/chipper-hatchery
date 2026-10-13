import type { ComponentPropsWithoutRef } from 'react';

/** Glass is limited to static UI surfaces, never applied to animated bird parts. */
export function GlassSurface({ className = '', children, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={`glass-surface ${className}`} {...props}>{children}</div>;
}
