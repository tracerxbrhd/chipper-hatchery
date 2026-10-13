import type { Chick } from '../../types';
import { renderChickSvg } from '../../chicks/renderer';
import { FLAPS_CONFIG as C } from './config';
import type { FlapsState } from './engine';

export interface FlapsSprites { flap: HTMLImageElement[]; hit: HTMLImageElement }
export interface FlapsTheme { sky: string; haze: string; ink: string; gate: string; gateEdge: string; grass: string; accent: string }

export function flapsTheme(): FlapsTheme {
  const dark = document.documentElement.dataset.theme === 'dark';
  return dark
    ? { sky: '#222824', haze: '#2c342e', ink: '#eef0e6', gate: '#5f6b60', gateEdge: '#a9b497', grass: '#303b32', accent: '#d7c793' }
    : { sky: '#f2f0e8', haze: '#e3e7dc', ink: '#292d27', gate: '#d9dfcb', gateEdge: '#69725a', grass: '#d5dcc6', accent: '#847348' };
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось подготовить спрайт цыплёнка'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Per-attempt bounded cache. Eight SVG poses are generated once, never inside the RAF. */
export async function makeFlapsSprites(chick: Chick): Promise<FlapsSprites> {
  const flap = await Promise.all(Array.from({ length: 8 }, (_, frame) => loadSvg(renderChickSvg({
    chick, pose: 'flap', direction: 'right', phase: frame / 8, shadow: false,
  }))));
  const hit = await loadSvg(renderChickSvg({ chick, pose: 'hit', direction: 'right', phase: 0, shadow: false }));
  return { flap, hit };
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath();
  // arcTo works in older Android WebViews which lack CanvasRenderingContext2D.roundRect.
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function gate(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, bottom: boolean, theme: FlapsTheme) {
  if (height <= 0) return;
  pill(ctx, x, y, C.obstacleWidth, height, 12);
  ctx.fillStyle = theme.gate; ctx.fill(); ctx.strokeStyle = theme.gateEdge; ctx.lineWidth = 1.5; ctx.stroke();
  // Original suspended paper/wood gates: inset seam, and a leaf sign near each opening.
  ctx.save(); ctx.clip(); ctx.strokeStyle = theme.gateEdge; ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.moveTo(x + 13, y + 8); ctx.lineTo(x + 13, y + height - 8); ctx.stroke();
  ctx.globalAlpha = 0.6; ctx.beginPath();
  const leafY = bottom ? y + 22 : y + height - 22;
  ctx.ellipse(x + 36, leafY, 5, 9, 0.7, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export function paintFlaps(ctx: CanvasRenderingContext2D, state: FlapsState, sprites: FlapsSprites | null, theme: FlapsTheme, decorTime: number, reducedMotion: boolean): void {
  ctx.clearRect(0, 0, C.width, C.height);
  ctx.fillStyle = theme.sky; ctx.fillRect(0, 0, C.width, C.height);
  ctx.fillStyle = theme.haze;
  ctx.beginPath(); ctx.ellipse(305, 194, 142, 105, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(18, 436, 150, 75, 0.2, 0, Math.PI * 2); ctx.fill();
  // Air is readable without moving blur. Decorative motes stop in reduced motion.
  ctx.fillStyle = theme.accent; ctx.globalAlpha = 0.3;
  for (let i = 0; i < 8; i++) {
    const offset = reducedMotion ? 0 : state.distance * 0.22;
    const x = ((i * 91 + 48 - offset) % 405 + 405) % 405 - 20;
    ctx.beginPath(); ctx.ellipse(x, 88 + (i * 97) % 462, 1.5, 3, 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const obstacle of state.obstacles) {
    if (obstacle.x > C.width + 10) continue;
    const topEnd = obstacle.gapY - obstacle.gapHeight / 2;
    const bottomStart = obstacle.gapY + obstacle.gapHeight / 2;
    gate(ctx, obstacle.x, C.ceiling - 16, topEnd - C.ceiling + 16, false, theme);
    gate(ctx, obstacle.x, bottomStart, C.ground - bottomStart + 20, true, theme);
  }
  ctx.fillStyle = theme.grass; ctx.fillRect(0, C.ground, C.width, C.height - C.ground);
  ctx.strokeStyle = theme.gateEdge; ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.moveTo(0, C.ground); ctx.lineTo(C.width, C.ground); ctx.stroke(); ctx.globalAlpha = 1;
  if (sprites) {
    const frame = Math.floor((state.phase === 'ready' ? decorTime : state.time) * 18) % sprites.flap.length;
    const sprite = state.phase === 'crashed' ? sprites.hit : sprites.flap[frame];
    const readyBob = state.phase === 'ready' && !reducedMotion ? Math.sin(decorTime * 3) * 4 : 0;
    const pitch = state.phase === 'ready' ? 0 : Math.max(-0.35, Math.min(0.9, state.velocity / 700));
    ctx.save(); ctx.translate(C.birdX, state.y + readyBob); ctx.rotate(pitch);
    // Sprite center matches the torso, collision excludes decorative feathers and feet.
    ctx.drawImage(sprite, -52, -60, 104, 104); ctx.restore();
  }
}
