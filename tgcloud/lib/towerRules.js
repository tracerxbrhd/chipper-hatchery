/** The single deterministic Nest Defense model, shared by the V8 verifier and Canvas client.
 * All arithmetic in simulation uses integer units (1000 units per tile, 50 ms per tick).
 * Mutating steps avoid frame allocations; checkpoint replay always clones before applying input.
 * No SDK, Node APIs, wall clock or nondeterministic random source belongs in this module. */
export const TOWER_CONFIG = Object.freeze({
  version: 'nest-defense-1', configVersion: 'nest-defense-1', stepMs: 50, width: 10, height: 14, unit: 1000,
  initialHp: 10, initialCoins: 120, maxEnemies: 48, maxCheckpointTicks: 1200,
  maxCommands: 64, maxCheckpointBytes: 32768, rewardCooldownMs: 20 * 60 * 60 * 1000,
  towers: Object.freeze({
    beak: Object.freeze({ label: 'Клюв', price: 40, range: 2450, damage: 12, interval: 8, upgrades: Object.freeze([28, 44]), splash: 0, slow: 0 }),
    seed: Object.freeze({ label: 'Семечко', price: 65, range: 2300, damage: 11, interval: 15, upgrades: Object.freeze([46, 65]), splash: 1300, slow: 0 }),
    frost: Object.freeze({ label: 'Ветер', price: 55, range: 2550, damage: 4, interval: 10, upgrades: Object.freeze([36, 52]), splash: 0, slow: 24 }),
  }),
  enemies: Object.freeze({
    crawler: Object.freeze({ hp: 32, speed: 75, bounty: 7, nestDamage: 1, slowFactor: 650 }),
    dasher: Object.freeze({ hp: 24, speed: 115, bounty: 8, nestDamage: 1, slowFactor: 650 }),
    brute: Object.freeze({ hp: 70, speed: 53, bounty: 12, nestDamage: 2, slowFactor: 800 }),
  }),
});

export class TowerRulesError extends Error {
  constructor(code, message) { super(message); this.name = 'TowerRulesError'; this.code = code; }
}
function fail(code, message) { throw new TowerRulesError(code, message); }
function integer(value) { return Number.isSafeInteger(value); }
function rng(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value; };
}
const cellKey = (x, y) => `${x},${y}`;

/** A randomized monotonic row weave guarantees continuity without retry loops or intersections.
 * Five separated horizontal corridors and variable turn columns change actual route geometry. */
export function generateTowerMap(seed) {
  if (!integer(seed) || seed < 0 || seed > 4294967295) fail('INVALID_SEED', 'Некорректный seed карты');
  const roll = rng(seed), path = [], visited = new Set();
  let x = 1 + roll() % 3, y = 0;
  const push = () => { const key = cellKey(x, y); if (!visited.has(key)) { path.push({ x, y }); visited.add(key); } };
  const move = (toX, toY) => {
    while (y !== toY) { y += Math.sign(toY - y); push(); }
    while (x !== toX) { x += Math.sign(toX - x); push(); }
  };
  push();
  for (let corridor = 0; corridor < 5; corridor++) {
    const nextY = 1 + corridor * 3;
    let nextX = corridor % 2 === 0 ? 6 + roll() % 3 : 1 + roll() % 3;
    move(x, nextY);
    if (corridor === 4 && path.length + Math.abs(nextX - x) < 32) nextX = 9;
    move(nextX, nextY);
  }
  const pathMask = Array.from({ length: 14 }, () => Array(10).fill(false));
  for (const cell of path) pathMask[cell.y][cell.x] = true;
  const obstacles = [], buildable = [];
  for (let cy = 0; cy < 14; cy++) {
    for (let cx = 0; cx < 10; cx++) {
      const decorRoll = roll();
      if (pathMask[cy][cx]) continue;
      const distance = path.reduce((best, point) => Math.min(best, Math.abs(point.x - cx) + Math.abs(point.y - cy)), 99);
      const isInterior = cx > 0 && cx < 9 && cy > 0 && cy < 13;
      // Early corridors always have clear build sites; props occur only away from the road.
      if (isInterior && distance <= 2) buildable.push({ x: cx, y: cy });
      else if (decorRoll % 5 === 0) obstacles.push({ x: cx, y: cy, kind: decorRoll % 2 ? 'stone' : 'tuft' });
      else if (isInterior) buildable.push({ x: cx, y: cy });
    }
  }
  return { seed, width: 10, height: 14, path, buildable, obstacles, entrance: path[0], nest: path[path.length - 1] };
}

export function createTowerState(seed) {
  generateTowerMap(seed); // Validate immutable map before persisting a run.
  return {
    seed, configVersion: TOWER_CONFIG.version, tick: 0, phase: 'build', wave: 0,
    completedWave: 0, hp: TOWER_CONFIG.initialHp, coins: TOWER_CONFIG.initialCoins,
    towers: [], enemies: [], spawn: { total: 0, remaining: 0, emitted: 0, nextTick: 0 }, nextEnemyId: 1,
  };
}

function towerStats(tower) {
  const base = TOWER_CONFIG.towers[tower.type], factor = [1000, 1650, 2500][tower.level - 1];
  return {
    ...base, damage: Math.floor(base.damage * factor / 1000), range: base.range + (tower.level - 1) * 180,
    interval: Math.max(4, base.interval - tower.level + 1), splash: base.splash ? base.splash + (tower.level - 1) * 100 : 0,
    slow: base.slow ? base.slow + (tower.level - 1) * 8 : 0,
  };
}
export function towerLevelStats(type, level = 1) {
  if (!Object.hasOwn(TOWER_CONFIG.towers, type) || !integer(level) || level < 1 || level > 3) fail('INVALID_TOWER', 'Неизвестная башня');
  return towerStats({ type, level });
}
export function towerWaveStats(wave) {
  if (!integer(wave) || wave < 1) fail('INVALID_WAVE', 'Некорректная волна');
  // Saturated technical limits bound active memory and integer multiplication, not the final wave.
  return {
    count: Math.min(120, 5 + Math.floor(Math.min(wave, 1000) * 1.4)),
    hpScale: Math.min(1000000, 1000 + Math.min(wave, 100000) * 85 + Math.floor(Math.min(wave, 10000) ** 2 / 30)),
    speedExtra: Math.min(100, Math.floor(wave / 3)), interval: Math.max(5, 14 - Math.floor(wave / 5)),
    bountyExtra: Math.min(25, Math.floor(wave / 5)), clearBonus: Math.min(100, 14 + wave * 3),
  };
}

export function applyTowerCommand(state, command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) fail('INVALID_COMMAND', 'Некорректная команда');
  const allowed = command.type === 'place' ? ['type', 'x', 'y', 'towerType'] : command.type === 'upgrade' || command.type === 'sell' ? ['type', 'x', 'y'] : command.type === 'startWave' ? ['type'] : null;
  if (!allowed || Object.keys(command).some(key => !allowed.includes(key))) fail('INVALID_COMMAND', 'Недопустимые поля команды');
  if (state.phase !== 'build') fail('BUILD_ONLY', 'Строить можно между волнами');
  if (command.type === 'startWave') {
    if (state.hp <= 0 || state.wave >= Number.MAX_SAFE_INTEGER) fail('RUN_ENDED', 'Партия завершена');
    const wave = state.wave + 1, stats = towerWaveStats(wave);
    state.wave = wave; state.phase = 'wave';
    state.spawn = { total: stats.count, remaining: stats.count, emitted: 0, nextTick: state.tick + 1 };
    for (const tower of state.towers) tower.cooldown = 0;
    return state;
  }
  const { x, y } = command;
  if (!integer(x) || !integer(y) || x < 0 || x >= 10 || y < 0 || y >= 14) fail('INVALID_TILE', 'Неверная клетка');
  const index = state.towers.findIndex(tower => tower.x === x && tower.y === y);
  if (command.type === 'place') {
    if (!Object.hasOwn(TOWER_CONFIG.towers, command.towerType)) fail('INVALID_TOWER', 'Неизвестная башня');
    if (index !== -1 || !generateTowerMap(state.seed).buildable.some(cell => cell.x === x && cell.y === y)) fail('INVALID_TILE', 'Здесь нельзя строить');
    const price = TOWER_CONFIG.towers[command.towerType].price;
    if (state.coins < price) fail('NOT_ENOUGH_COINS', 'Не хватает монет партии');
    state.coins -= price;
    state.towers.push({ x, y, type: command.towerType, level: 1, invested: price, cooldown: 0, shot: null });
  } else {
    if (index === -1) fail('NO_TOWER', 'В этой клетке нет башни');
    const tower = state.towers[index];
    if (command.type === 'sell') {
      state.coins = Math.min(1000000000000, state.coins + Math.floor(tower.invested * 65 / 100));
      state.towers.splice(index, 1);
    } else {
      if (tower.level >= 3) fail('MAX_LEVEL', 'Максимальный уровень');
      const price = TOWER_CONFIG.towers[tower.type].upgrades[tower.level - 1];
      if (state.coins < price) fail('NOT_ENOUGH_COINS', 'Не хватает монет партии');
      state.coins -= price; tower.invested += price; tower.level++;
    }
  }
  return state;
}

export function towerEnemyPosition(state, enemy, map = generateTowerMap(state.seed)) {
  const last = map.path.length - 1, segment = Math.min(last, Math.floor(enemy.progress / 1000));
  const from = map.path[segment], to = map.path[Math.min(last, segment + 1)], remainder = enemy.progress % 1000;
  return { x: from.x * 1000 + (to.x - from.x) * remainder, y: from.y * 1000 + (to.y - from.y) * remainder };
}
function spawnEnemy(state, stats) {
  const number = state.spawn.emitted;
  const choice = (number + state.wave + (state.seed % 7)) % 6;
  const type = state.wave >= 3 && choice === 0 ? 'brute' : state.wave >= 2 && choice <= 2 ? 'dasher' : 'crawler';
  const base = TOWER_CONFIG.enemies[type], hp = Math.floor(base.hp * stats.hpScale / 1000);
  state.enemies.push({ id: state.nextEnemyId++, type, hp, maxHp: hp, progress: 0, slowTicks: 0 });
  state.spawn.emitted++; state.spawn.remaining--; state.spawn.nextTick = state.tick + stats.interval;
}

/** Mutates canonical state one tick. Optional cached map must be derived from this state's seed. */
export function stepTower(state, map = generateTowerMap(state.seed)) {
  if (state.phase !== 'wave') return state;
  state.tick++;
  const stats = towerWaveStats(state.wave), endProgress = (map.path.length - 1) * 1000;
  if (state.spawn.remaining > 0 && state.tick >= state.spawn.nextTick && state.enemies.length < TOWER_CONFIG.maxEnemies) spawnEnemy(state, stats);
  for (const enemy of state.enemies) {
    const base = TOWER_CONFIG.enemies[enemy.type], speed = base.speed + stats.speedExtra;
    enemy.progress += enemy.slowTicks > 0 ? Math.floor(speed * base.slowFactor / 1000) : speed;
    if (enemy.slowTicks > 0) enemy.slowTicks--;
    if (enemy.progress >= endProgress) { state.hp = Math.max(0, state.hp - base.nestDamage); enemy.hp = 0; }
  }
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  if (state.hp <= 0) { state.phase = 'defeat'; return state; }
  const positions = state.enemies.map(enemy => towerEnemyPosition(state, enemy, map));
  for (const tower of state.towers) {
    if (tower.cooldown > 0) tower.cooldown--;
    if (tower.cooldown > 0) continue;
    const profile = towerStats(tower); let target = -1;
    for (let index = 0; index < state.enemies.length; index++) {
      const enemy = state.enemies[index], pos = positions[index];
      if (enemy.hp <= 0 || (pos.x - tower.x * 1000) ** 2 + (pos.y - tower.y * 1000) ** 2 > profile.range ** 2) continue;
      if (target === -1 || enemy.progress > state.enemies[target].progress || (enemy.progress === state.enemies[target].progress && enemy.id < state.enemies[target].id)) target = index;
    }
    if (target === -1) continue;
    const hit = state.enemies[target], position = positions[target];
    tower.cooldown = profile.interval; tower.shot = { tick: state.tick, x: position.x, y: position.y };
    for (let index = 0; index < state.enemies.length; index++) {
      const enemy = state.enemies[index], pos = positions[index];
      if (enemy.hp <= 0 || (index !== target && (!profile.splash || (pos.x - position.x) ** 2 + (pos.y - position.y) ** 2 > profile.splash ** 2))) continue;
      enemy.hp -= profile.damage;
      if (profile.slow) enemy.slowTicks = Math.max(enemy.slowTicks, profile.slow);
      if (enemy.hp <= 0) state.coins = Math.min(1000000000000, state.coins + TOWER_CONFIG.enemies[enemy.type].bounty + stats.bountyExtra);
    }
    // The slow tower has damage and a bounded factor: stacking never compounds or immobilizes.
    void hit;
  }
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  if (state.spawn.remaining === 0 && state.enemies.length === 0) {
    state.completedWave = state.wave; state.phase = 'build';
    state.coins = Math.min(1000000000000, state.coins + stats.clearBonus);
  }
  return state;
}

export function replayTowerCheckpoint(previous, commands, ticks) {
  if (!Array.isArray(commands) || commands.length > TOWER_CONFIG.maxCommands || !integer(ticks) || ticks < 0 || ticks > TOWER_CONFIG.maxCheckpointTicks) fail('INVALID_CHECKPOINT', 'Слишком большой checkpoint');
  const state = JSON.parse(JSON.stringify(previous)), map = generateTowerMap(state.seed);
  for (const command of commands) applyTowerCommand(state, command);
  for (let tick = 0; tick < ticks; tick++) {
    if (state.phase !== 'wave') fail('INVALID_TICKS', 'Лишние шаги после завершения волны');
    stepTower(state, map);
  }
  return state;
}

/** Integrity comparison, not a signature or an anti-bot secret. Authoritative replay is required. */
export function towerStateHash(state) {
  const encoded = JSON.stringify(state); let hash = 2166136261;
  for (let index = 0; index < encoded.length; index++) hash = Math.imul(hash ^ encoded.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function towerRewardAmount(wave) {
  if (!integer(wave) || wave < 3) return 0;
  return wave >= 25 ? 4 : wave >= 15 ? 3 : wave >= 8 ? 2 : 1;
}
