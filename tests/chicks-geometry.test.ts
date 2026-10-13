import { describe, expect, it } from 'vitest';
import type { ChickGenesV2, Stage } from '../src/types';
import { buildGeometry, GROUND_CONTACT, type Point } from '../src/chicks/geometry';
import { gaitFoot, poseFrame } from '../src/chicks/animation';
import { genesFor, isValidGenes, NEUTRAL_GENES, SHAPES, type ChickPose } from '../src/chicks/models';
import { buildChickMarkup, renderChickSvg } from '../src/chicks/renderer';
import { PREVIEW_CHICKS } from '../src/chicks/previewFixtures';

const stages: Stage[] = ['baby', 'teen', 'adult'];

/** Flatten actual registered cubic contours for point-in-fill assertions. */
function outlinePoints(path: string): Point[] {
  const tokens = path.match(/[A-Za-z]|-?(?:\d*\.)?\d+/g)!;
  const points: Point[] = [];
  let cursor = { x: 0, y: 0 };
  let index = 0;
  const point = () => ({ x: Number(tokens[index++]), y: Number(tokens[index++]) });
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'M') { cursor = point(); points.push(cursor); }
    else if (command === 'C') {
      const start = cursor; const a = point(); const b = point(); const end = point();
      for (let i = 1; i <= 32; i++) {
        const t = i / 32; const u = 1 - t;
        points.push({ x: u ** 3 * start.x + 3 * u ** 2 * t * a.x + 3 * u * t ** 2 * b.x + t ** 3 * end.x,
          y: u ** 3 * start.y + 3 * u ** 2 * t * a.y + 3 * u * t ** 2 * b.y + t ** 3 * end.y });
      }
      cursor = end;
    } else if (command !== 'Z') throw new Error(`Unsupported contour ${command}`);
  }
  return points;
}
function contains(points: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]; const b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

describe('Chick System 2.0 original morphology', () => {
  it('has 30 deterministic valid families covering all palette zones and morphologies', () => {
    expect(PREVIEW_CHICKS).toHaveLength(30);
    expect(new Set(PREVIEW_CHICKS.map((bird) => JSON.stringify(bird.genes))).size).toBe(30);
    expect(new Set(PREVIEW_CHICKS.map((bird) => bird.appearanceId)).size).toBe(12);
    for (const [field, choices] of Object.entries(SHAPES)) {
      expect(new Set(PREVIEW_CHICKS.map((bird) => bird.genes[field as keyof typeof SHAPES])).size).toBe(choices.length);
    }
    for (const bird of PREVIEW_CHICKS) expect(isValidGenes(bird.genes)).toBe(true);
  });

  it('keeps every anchor finite, inside viewbox and rooted in the real torso for 720 combinations', () => {
    for (const headShape of SHAPES.headShape) for (const bodyShape of SHAPES.bodyShape)
      for (const legShape of SHAPES.legShape) for (const eyeStyle of SHAPES.eyeStyle) for (const stage of stages) {
        const genes = { ...NEUTRAL_GENES, headShape, bodyShape, legShape, eyeStyle };
        const geometry = buildGeometry(genes, stage);
        for (const anchor of Object.values(geometry.anchors)) {
          expect(Number.isFinite(anchor.x) && Number.isFinite(anchor.y)).toBe(true);
          expect(anchor.x).toBeGreaterThan(0); expect(anchor.x).toBeLessThan(320);
          expect(anchor.y).toBeGreaterThan(0); expect(anchor.y).toBeLessThan(320);
        }
        expect(geometry.anchors.groundContact).toEqual(GROUND_CONTACT);
        expect(geometry.anchors.footContactLeft.y).toBe(282);
        expect(geometry.anchors.footContactRight.y).toBe(282);
        const contour = outlinePoints(geometry.body.path);
        for (const key of ['legRootLeft', 'legRootRight', 'wingRootLeft', 'wingRootRight', 'tailRoot'] as const)
          expect(contains(contour, geometry.anchors[key]), `${stage}/${bodyShape}/${key}`).toBe(true);
      }
  });

  it('keeps the entire eye contour inside each actual head contour in side and front views', () => {
    for (const headShape of SHAPES.headShape) for (const eyeStyle of SHAPES.eyeStyle) for (const stage of stages) {
      const genes = { ...NEUTRAL_GENES, headShape, eyeStyle };
      const geometry = buildGeometry(genes, stage);
      const boundary = outlinePoints(geometry.head.path);
      for (const front of [false, true]) for (const far of [false, true]) {
        const center = front ? { x: geometry.head.center.x + (far ? .18 : -.18) * geometry.head.width,
          y: geometry.anchors[far ? 'eyeRight' : 'eyeLeft'].y } : geometry.anchors[far ? 'eyeRight' : 'eyeLeft'];
        const radius = geometry.eyeRadius * (far && !front ? .66 : 1);
        const horizontal = far && !front ? .76 : 1;
        for (let step = 0; step < 32; step++) {
          const angle = step * Math.PI / 16;
          const point = { x: center.x + Math.cos(angle) * (radius * horizontal + .7),
            y: center.y + Math.sin(angle) * (radius * (eyeStyle === 'curious' ? 1.07 : 1) + .7) };
          expect(contains(boundary, point), `${headShape}/${eyeStyle}/${stage}/${front}/${far}`).toBe(true);
        }
      }
    }
  });

  it('changes real silhouette paths for every head/body shape even with one identical palette', () => {
    for (const stage of stages) {
      expect(new Set(SHAPES.headShape.map((headShape) => buildGeometry({ ...NEUTRAL_GENES, headShape }, stage).head.path)).size).toBe(5);
      expect(new Set(SHAPES.bodyShape.map((bodyShape) => buildGeometry({ ...NEUTRAL_GENES, bodyShape }, stage).body.path)).size).toBe(4);
      for (const field of ['beakShape', 'wingShape', 'tailShape', 'crestShape'] as const) {
        expect(new Set(SHAPES[field].map((variant) => renderChickSvg({ chick: { stage, genes: { ...NEUTRAL_GENES, [field]: variant } } }))).size).toBe(SHAPES[field].length);
      }
    }
  });

  it('age changes proportions and keeps all saved traits and color zones untouched', () => {
    for (const bird of PREVIEW_CHICKS) {
      const saved = JSON.stringify(bird.genes);
      const geometries = stages.map((stage) => buildChickMarkup({ chick: { ...bird, stage } }));
      expect(new Set(geometries.map((g) => g.geometry.head.width / g.geometry.body.width)).size).toBe(3);
      for (const rendered of geometries) expect(rendered.genes).toBe(bird.genes);
      expect(JSON.stringify(bird.genes)).toBe(saved);
    }
  });

  it('uses a fixed neutral V2 fallback for unknown, incomplete and unsafe genes', () => {
    for (const genes of [undefined, { ...NEUTRAL_GENES, headShape: 'future' }, { ...NEUTRAL_GENES, detailVariant: 7 },
      { ...NEUTRAL_GENES, colors: { ...NEUTRAL_GENES.colors, head: '"><script>alert(1)</script>' } }]) {
      expect(genesFor({ stage: 'baby', genes: genes as ChickGenesV2 })).toBe(NEUTRAL_GENES);
      const svg = renderChickSvg({ chick: { stage: 'baby', genes: genes as ChickGenesV2 } });
      expect(svg).not.toContain('<script>'); expect(svg).not.toContain('future');
    }
  });

  it('a walking cycle always has a planted foot and the other foot swings naturally', () => {
    const anchor = { x: 100, y: 282 };
    for (let step = 0; step <= 100; step++) {
      const left = gaitFoot(anchor, step / 100);
      const right = gaitFoot(anchor, step / 100 + .5);
      expect(Math.max(left.y, right.y)).toBeCloseTo(282);
      expect(left.y).toBeLessThanOrEqual(282); expect(right.y).toBeLessThanOrEqual(282);
      expect(Math.abs(left.x - 100)).toBeLessThanOrEqual(9.001);
    }
    expect(gaitFoot(anchor, .8).y).toBeLessThan(275);
    expect(gaitFoot(anchor, .1).x).toBeGreaterThan(gaitFoot(anchor, .5).x);
  });

  it('feeding reaches the ground grain with its articulated beak in all 180 extreme configurations', () => {
    for (const headShape of SHAPES.headShape) for (const bodyShape of SHAPES.bodyShape)
      for (const legShape of SHAPES.legShape) for (const stage of stages) {
        const geometry = buildGeometry({ ...NEUTRAL_GENES, headShape, bodyShape, legShape }, stage);
        const frame = poseFrame(geometry, 'feed', .5);
        const angle = frame.headAngle * Math.PI / 180;
        const dx = geometry.anchors.beakRoot.x + 12 * geometry.head.width / 87 - geometry.anchors.neck.x;
        const dy = geometry.anchors.beakRoot.y - geometry.anchors.neck.y;
        const x = geometry.anchors.neck.x + dx * Math.cos(angle) - dy * Math.sin(angle) + frame.headOffsetX;
        const y = geometry.anchors.neck.y + dx * Math.sin(angle) + dy * Math.cos(angle) + frame.headOffset + frame.bodyOffset;
        expect(x).toBeCloseTo(236); expect(y).toBeCloseTo(279);
        expect(frame.leftFoot.y).toBe(282); expect(frame.rightFoot.y).toBe(282);
        expect(geometry.body.center.y + geometry.body.height / 2 + frame.bodyOffset).toBeLessThanOrEqual(282);
      }
  });

  it('every pose has finite transforms without moving the idle/walk/feed contact plane', () => {
    const poses: ChickPose[] = ['idle', 'walk', 'turn', 'look', 'preen', 'feed', 'play', 'sleep', 'wake', 'flap', 'hit', 'hatch', 'grow'];
    for (const bird of PREVIEW_CHICKS) for (const stage of stages) for (const pose of poses) {
      const geometry = buildGeometry(bird.genes, stage);
      for (const phase of [0, .25, .5, .75, 1]) {
        const frame = poseFrame(geometry, pose, phase);
        for (const value of Object.values(frame)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
        const markup = renderChickSvg({ chick: { ...bird, stage }, pose, phase });
        expect(markup).not.toMatch(/NaN|Infinity|undefined/);
        expect(markup).not.toContain('<filter'); expect(markup).not.toContain('<animate');
      }
    }
  });

  it('portrait and Flaps exports share identical morphology markup and omit the flight shadow', () => {
    for (const bird of PREVIEW_CHICKS) {
      const options = { chick: bird, pose: 'flap' as const, phase: .25, shadow: false, id: 'same-avatar' };
      expect(renderChickSvg(options)).toContain(buildChickMarkup(options).markup);
      expect(renderChickSvg(options)).not.toContain('chick-shadow');
      expect(renderChickSvg(options)).toContain('xmlns="http://www.w3.org/2000/svg"');
    }
  });

  it('turns through a centered front face and a clocked blink survives controlled rendering', () => {
    for (const bird of PREVIEW_CHICKS) {
      const front = buildChickMarkup({ chick: bird, pose: 'turn', phase: .5, direction: 'left' });
      expect(front.geometry.head.center.x).toBe(160);
      expect(front.geometry.body.center.x).toBe(160);
      expect(front.geometry.anchors.groundContact).toEqual(GROUND_CONTACT);
      const closed = buildChickMarkup({ chick: bird, pose: 'walk', phase: .3, blink: true });
      expect(closed.markup).not.toContain('class="chick-v2-eye');
      expect(closed.markup).toContain('stroke="#f7f1e3"');
    }
  });

  it('preening reaches the near wing while the entire head stays above the ground', () => {
    for (const headShape of SHAPES.headShape) for (const bodyShape of SHAPES.bodyShape)
      for (const legShape of SHAPES.legShape) for (const stage of stages) {
        const geometry = buildGeometry({ ...NEUTRAL_GENES, headShape, bodyShape, legShape }, stage);
        const frame = poseFrame(geometry, 'preen', .5);
        const angle = frame.headAngle * Math.PI / 180;
        for (const point of outlinePoints(geometry.head.path)) {
          const dx = point.x - geometry.anchors.neck.x;
          const dy = point.y - geometry.anchors.neck.y;
          const y = geometry.anchors.neck.y + dx * Math.sin(angle) + dy * Math.cos(angle) + frame.headOffset + frame.bodyOffset;
          expect(y).toBeLessThan(282);
        }
      }
  });
});
