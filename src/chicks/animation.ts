import type { ChickGeometry, Point } from './geometry';
import type { ChickPose } from './models';

export interface PoseFrame {
  bodyOffset: number; headAngle: number; headOffset: number; headOffsetX: number; wingAngle: number; tailAngle: number;
  leftFoot: Point; rightFoot: Point; closedEyes: boolean; openBeak: boolean; front: number;
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** A planted foot moves backwards relative to the moving pelvis; swing lifts it. */
export function gaitFoot(anchor: Point, phase: number, stride = 18, lift = 11): Point {
  const cycle = ((phase % 1) + 1) % 1;
  if (cycle <= .6) return { x: anchor.x + stride * (.5 - cycle / .6), y: anchor.y };
  const t = (cycle - .6) / .4;
  return { x: anchor.x + stride * (t - .5), y: anchor.y - Math.sin(t * Math.PI) * lift };
}

export function poseFrame(geometry: ChickGeometry, pose: ChickPose, phase = 0): PoseFrame {
  const t = clamp(Number.isFinite(phase) ? phase : 0);
  const wave = Math.sin(t * Math.PI * 2);
  const frame: PoseFrame = {
    bodyOffset: 0, headAngle: 0, headOffset: 0, headOffsetX: 0, wingAngle: 0, tailAngle: 0,
    leftFoot: { ...geometry.anchors.footContactLeft }, rightFoot: { ...geometry.anchors.footContactRight },
    closedEyes: pose === 'sleep', openBeak: false, front: 0,
  };
  switch (pose) {
    case 'walk':
      frame.bodyOffset = -Math.abs(wave) * 1.7;
      frame.leftFoot = gaitFoot(frame.leftFoot, t, 16, geometry.legLength * .3);
      frame.rightFoot = gaitFoot(frame.rightFoot, t + .5, 16, geometry.legLength * .3);
      frame.headAngle = wave * 2; frame.tailAngle = -wave * 4; frame.wingAngle = wave * 3;
      break;
    case 'turn': frame.front = Math.sin(t * Math.PI); frame.headAngle = wave * 3; break;
    case 'look': frame.front = .88; frame.headAngle = Math.sin(t * Math.PI) * -8; break;
    case 'preen': {
      const bend = Math.sin(t * Math.PI);
      frame.headAngle = 105 * bend;
      const angle = frame.headAngle * Math.PI / 180;
      const tip = { x: geometry.anchors.beakRoot.x + 12 * geometry.head.width / 87, y: geometry.anchors.beakRoot.y };
      const dx = tip.x - geometry.anchors.neck.x;
      const dy = tip.y - geometry.anchors.neck.y;
      const tipX = geometry.anchors.neck.x + dx * Math.cos(angle) - dy * Math.sin(angle);
      const tipY = geometry.anchors.neck.y + dx * Math.sin(angle) + dy * Math.cos(angle);
      frame.headOffsetX = (geometry.anchors.wingRootLeft.x + 15 - tipX) * bend;
      frame.headOffset = (geometry.anchors.wingRootLeft.y + 21 - tipY) * bend;
      frame.wingAngle = -14 * bend;
      break;
    }
    case 'feed': {
      const peck = Math.sin(t * Math.PI);
      frame.headAngle = peck * 68;
      // Crouch never pushes the underside of the torso through the ground.
      frame.bodyOffset = Math.max(0, Math.min(geometry.legLength - 10, 20)) * peck;
      const angle = frame.headAngle * Math.PI / 180;
      const tip = { x: geometry.anchors.beakRoot.x + 12 * geometry.head.width / 87, y: geometry.anchors.beakRoot.y };
      const dx = tip.x - geometry.anchors.neck.x;
      const dy = tip.y - geometry.anchors.neck.y;
      const tipX = geometry.anchors.neck.x + dx * Math.cos(angle) - dy * Math.sin(angle);
      const tipY = geometry.anchors.neck.y + dx * Math.sin(angle) + dy * Math.cos(angle);
      frame.headOffsetX = (236 - tipX) * peck;
      frame.headOffset = (279 - tipY - frame.bodyOffset) * peck;
      frame.openBeak = t > .32 && t < .72; frame.tailAngle = -wave * 5;
      break;
    }
    case 'play':
      frame.bodyOffset = -Math.sin(t * Math.PI) * 23;
      frame.leftFoot.y += frame.bodyOffset; frame.rightFoot.y += frame.bodyOffset;
      frame.headAngle = -wave * 7; frame.wingAngle = -Math.sin(t * Math.PI) * 52; frame.openBeak = true;
      break;
    case 'sleep':
      frame.bodyOffset = geometry.legLength * .67;
      frame.headAngle = 17; frame.headOffset = 7; frame.wingAngle = 7;
      break;
    case 'wake':
      frame.bodyOffset = geometry.legLength * .67 * (1 - t);
      frame.headAngle = (1 - t) * 17 - Math.sin(t * Math.PI) * 12;
      frame.wingAngle = -Math.sin(t * Math.PI) * 36; frame.closedEyes = t < .3;
      break;
    case 'flap':
      frame.wingAngle = -35 + wave * 48; frame.tailAngle = wave * 6;
      frame.leftFoot = { x: frame.leftFoot.x - 7, y: geometry.anchors.legRootLeft.y + geometry.legLength * .48 };
      frame.rightFoot = { x: frame.rightFoot.x - 9, y: geometry.anchors.legRootRight.y + geometry.legLength * .4 };
      break;
    case 'hit': frame.closedEyes = true; frame.wingAngle = -22; frame.headAngle = 12; break;
    case 'hatch': frame.headAngle = -Math.sin(t * Math.PI) * 8; frame.wingAngle = -Math.sin(t * Math.PI) * 24; break;
    case 'grow': frame.headAngle = -Math.sin(t * Math.PI) * 4; break;
    default: frame.headAngle = wave * 1.6; frame.tailAngle = wave * 2; break;
  }
  return frame;
}
