import { TOWER_CONFIG, towerEnemyPosition, towerLevelStats, towerWaveStats } from './engine';
import type { TowerCell, TowerMap, TowerState, TowerType } from './types';
export const FIELD_WIDTH = 360, FIELD_HEIGHT = 504, TILE = 36;
interface Theme { background: string; cell: string; grid: string; road: string; edge: string; ink: string; accent: string; nest: string; tower: string }
export function towerTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark'
    ? { background: '#1c2828', cell: '#263934', grid: '#365046', road: '#605344', edge: '#ad9879', ink: '#f0eee7', accent: '#b5c8aa', nest: '#d2b287', tower: '#d8dfd1' }
    : { background: '#e8eee3', cell: '#eff3e9', grid: '#c8d2bf', road: '#dacbb6', edge: '#ad9776', ink: '#354034', accent: '#739065', nest: '#aa7848', tower: '#ffffff' };
}
const center = (cell: TowerCell) => ({ x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 });
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
/** Static scenery is rasterized once per map/theme/resize, never blurred or laid out each frame. */
export function makeTowerBackdrop(map: TowerMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = FIELD_WIDTH; canvas.height = FIELD_HEIGHT;
  const ctx = canvas.getContext('2d')!, theme = towerTheme();
  ctx.fillStyle = theme.background; ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  for (const cell of map.buildable) {
    ctx.fillStyle = theme.cell; ctx.fillRect(cell.x * TILE + 1, cell.y * TILE + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = theme.grid; ctx.lineWidth = .65; ctx.strokeRect(cell.x * TILE + .5, cell.y * TILE + .5, TILE - 1, TILE - 1);
    ctx.fillStyle = theme.grid; ellipse(ctx, cell.x * TILE + TILE / 2, cell.y * TILE + TILE / 2, 1, 1); ctx.fill();
  }
  ctx.beginPath();
  for (let index = 0; index < map.path.length; index++) { const p = center(map.path[index]); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
  ctx.strokeStyle = theme.edge; ctx.lineWidth = TILE - 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.strokeStyle = theme.road; ctx.lineWidth = TILE - 10; ctx.stroke();
  ctx.strokeStyle = theme.edge; ctx.lineWidth = 1; ctx.globalAlpha = .5;
  for (let index = 1; index < map.path.length - 1; index += 3) {
    const p = center(map.path[index]); ctx.beginPath(); ctx.moveTo(p.x - 3, p.y + 1); ctx.lineTo(p.x + 3, p.y + 1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const prop of map.obstacles) {
    const p = center(prop); ctx.fillStyle = prop.kind === 'stone' ? theme.grid : theme.accent;
    ellipse(ctx, p.x, p.y + 3, 7, prop.kind === 'stone' ? 5 : 9); ctx.fill();
  }
  const entrance = center(map.entrance); ctx.fillStyle = theme.ink; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('↓', entrance.x, entrance.y + 4);
  const nest = center(map.nest);
  ctx.strokeStyle = theme.nest; ctx.lineWidth = 4;
  for (let ring = 0; ring < 3; ring++) { ellipse(ctx, nest.x, nest.y + 3, 13 - ring * 2, 8 - ring); ctx.stroke(); }
  ctx.fillStyle = theme.tower; ellipse(ctx, nest.x, nest.y - 2, 4, 6); ctx.fill();
  return canvas;
}
function towerIcon(ctx: CanvasRenderingContext2D, type: TowerType, x: number, y: number, level: number, theme: Theme) {
  ctx.fillStyle = theme.tower; ctx.strokeStyle = theme.ink; ctx.lineWidth = 1.4;
  ellipse(ctx, x, y + 3, 13, 11); ctx.fill(); ctx.stroke();
  if (type === 'beak') {
    ctx.beginPath(); ctx.moveTo(x - 7, y + 2); ctx.lineTo(x + 8, y - 6); ctx.lineTo(x + 6, y + 7); ctx.closePath(); ctx.fillStyle = theme.nest; ctx.fill(); ctx.stroke();
    ellipse(ctx, x - 2, y - 3, 2, 2); ctx.fillStyle = theme.ink; ctx.fill();
  } else if (type === 'seed') {
    ctx.fillStyle = theme.accent; ellipse(ctx, x, y - 2, 5, 9); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 1, y + 4); ctx.lineTo(x + 2, y - 8); ctx.stroke();
  } else {
    for (let index = 0; index < 3; index++) {
      ctx.beginPath(); ctx.moveTo(x - 8, y - 5 + index * 5); ctx.bezierCurveTo(x + 9, y - 8 + index * 5, x + 9, y + index * 5, x + 4, y - 2 + index * 5); ctx.stroke();
    }
  }
  ctx.fillStyle = theme.ink;
  for (let index = 0; index < level; index++) { ellipse(ctx, x - (level - 1) * 3 + index * 6, y + 13, 1.6, 1.6); ctx.fill(); }
}
export interface TowerSelection { cell: TowerCell | null; type: TowerType }
export function paintTower(ctx: CanvasRenderingContext2D, state: TowerState, map: TowerMap, backdrop: HTMLCanvasElement, selection: TowerSelection, interpolation: number, reducedMotion: boolean) {
  ctx.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT); ctx.drawImage(backdrop, 0, 0);
  const theme = towerTheme();
  if (selection.cell) {
    const cell = selection.cell, existing = state.towers.find(t => t.x === cell.x && t.y === cell.y);
    const valid = existing || map.buildable.some(p => p.x === cell.x && p.y === cell.y);
    const p = center(cell), range = towerLevelStats(existing?.type ?? selection.type, existing?.level ?? 1).range * TILE / 1000;
    ctx.fillStyle = valid ? '#84a37b25' : '#bd695e40'; ctx.fillRect(cell.x * TILE, cell.y * TILE, TILE, TILE);
    ctx.strokeStyle = valid ? theme.accent : '#b5574c'; ctx.lineWidth = 2; ctx.strokeRect(cell.x * TILE + 2, cell.y * TILE + 2, TILE - 4, TILE - 4);
    if (valid) { ctx.beginPath(); ctx.arc(p.x, p.y, range, 0, Math.PI * 2); ctx.fillStyle = '#89a87812'; ctx.fill(); ctx.strokeStyle = '#89a87870'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  for (const tower of state.towers) {
    const p = center(tower); towerIcon(ctx, tower.type, p.x, p.y, tower.level, theme);
    const shot = tower.shot;
    if (shot && !reducedMotion && state.phase === 'wave' && state.tick - shot.tick < 4) {
      const strength = 1 - (state.tick - shot.tick + interpolation) / 4;
      ctx.globalAlpha = Math.max(0, strength); ctx.strokeStyle = tower.type === 'frost' ? '#88bfc4' : theme.nest; ctx.lineWidth = tower.type === 'seed' ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 5); ctx.lineTo(shot.x * TILE / 1000 + TILE / 2, shot.y * TILE / 1000 + TILE / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(shot.x * TILE / 1000 + TILE / 2, shot.y * TILE / 1000 + TILE / 2, tower.type === 'seed' ? 11 : 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  const stats = state.wave ? towerWaveStats(state.wave) : null;
  for (const enemy of state.enemies) {
    const base = TOWER_CONFIG.enemies[enemy.type], speed = base.speed + (stats?.speedExtra ?? 0);
    const motion = enemy.slowTicks ? Math.floor(speed * base.slowFactor / 1000) : speed;
    const visualEnemy = reducedMotion ? enemy : { ...enemy, progress: Math.max(0, enemy.progress - motion * (1 - interpolation)) };
    const p = towerEnemyPosition(state, visualEnemy, map), x = p.x * TILE / 1000 + TILE / 2, y = p.y * TILE / 1000 + TILE / 2;
    ctx.fillStyle = enemy.type === 'brute' ? '#8b6c55' : enemy.type === 'dasher' ? '#a78051' : '#7e9865'; ctx.strokeStyle = theme.ink; ctx.lineWidth = 1.1;
    const r = enemy.type === 'brute' ? 9 : enemy.type === 'dasher' ? 5 : 7;
    ellipse(ctx, x, y + 2, r, enemy.type === 'dasher' ? 8 : r - 1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff7e6'; ellipse(ctx, x + 3, y - 2, 3, 3); ctx.fill(); ctx.fillStyle = '#283029'; ellipse(ctx, x + 4, y - 2, 1.2, 1.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 2, y - r + 2); ctx.lineTo(x - 3, y - r - 3); ctx.moveTo(x + 2, y - r + 2); ctx.lineTo(x + 4, y - r - 3); ctx.stroke();
    if (enemy.type === 'brute') { ellipse(ctx, x - 1, y + 3, 4, 4); ctx.stroke(); }
    if (enemy.slowTicks) { ctx.strokeStyle = '#8fcbd0'; ctx.lineWidth = 2; ellipse(ctx, x, y + 2, r + 2, r); ctx.stroke(); }
    ctx.fillStyle = '#35403466'; ctx.fillRect(x - 9, y - r - 8, 18, 2);
    ctx.fillStyle = enemy.slowTicks ? '#92c5cb' : '#9ac087'; ctx.fillRect(x - 9, y - r - 8, 18 * Math.max(0, enemy.hp / enemy.maxHp), 2);
  }
}
