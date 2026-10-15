import type { ChickGeometry, Point } from './geometry';
import type { ChickPose } from './models';

export interface PoseFrame {
  bodyOffset: number; headAngle: number; headOffset: number; headOffsetX: number; wingAngle: number; tailAngle: number;
  leftFoot: Point; rightFoot: Point; closedEyes: boolean; openBeak: boolean; front: number;
  bodyScaleX: number; bodyScaleY: number; bodyAngle: number;
  eyelid: number; eyeOffsetX: number; eyeOffsetY: number; browAngle: number;
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const pulse = (t: number, start: number, end: number) => t <= start || t >= end ? 0 : Math.sin((t - start) / (end - start) * Math.PI);

/** A planted foot moves backwards relative to the moving pelvis; swing lifts it. */
export function gaitFoot(anchor: Point, phase: number, stride = 18, lift = 11): Point {
  const cycle = ((phase % 1) + 1) % 1;
  if (cycle <= .6) return { x: anchor.x + stride * (.5 - cycle / .6), y: anchor.y };
  const t = (cycle - .6) / .4;
  return { x: anchor.x + stride * (t - .5), y: anchor.y - Math.sin(t * Math.PI) * lift };
}

export function poseFrame(geometry: ChickGeometry, pose: ChickPose, phase = 0, reaction = 0): PoseFrame {
  const t = clamp(Number.isFinite(phase) ? phase : 0);
  const wave = Math.sin(t * Math.PI * 2);
  const frame: PoseFrame = {
    bodyOffset: 0, headAngle: 0, headOffset: 0, headOffsetX: 0, wingAngle: 0, tailAngle: 0,
    leftFoot: { ...geometry.anchors.footContactLeft }, rightFoot: { ...geometry.anchors.footContactRight },
    closedEyes: pose === 'sleep', openBeak: false, front: 0,
    bodyScaleX: 1, bodyScaleY: 1, bodyAngle: 0, eyelid: 0, eyeOffsetX: 0, eyeOffsetY: 0, browAngle: 0,
  };
  switch (pose) {
    case 'walk':
      frame.bodyOffset = -Math.abs(wave) * 1.7;
      frame.leftFoot = gaitFoot(frame.leftFoot, t, 16, geometry.legLength * .3);
      frame.rightFoot = gaitFoot(frame.rightFoot, t + .5, 16, geometry.legLength * .3);
      frame.headAngle = Math.sin((t - .08) * Math.PI * 2) * 3;
      frame.tailAngle = -Math.sin((t - .15) * Math.PI * 2) * 7; frame.wingAngle = wave * 5;
      frame.bodyAngle = wave * 1.4; frame.bodyScaleY = 1 - Math.abs(wave) * .012;
      break;
    case 'turn':
      frame.front = Math.sin(t * Math.PI); frame.headAngle = wave * 6;
      frame.bodyScaleX = 1 - Math.sin(t * Math.PI) * .12; frame.tailAngle = -wave * 12;
      frame.wingAngle = -Math.sin(t * Math.PI) * 8;
      break;
    case 'look':
      frame.front = .88; frame.headAngle = Math.sin(t * Math.PI) * -11;
      frame.eyeOffsetX = Math.sin(t * Math.PI) * 2; frame.browAngle = -Math.sin(t * Math.PI) * 7;
      break;
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
    case 'play': {
      // Crouch first, spring into a short arc, then absorb the landing.
      const crouch = pulse(t, 0, .24), airborne = pulse(t, .18, .76), landing = pulse(t, .72, 1);
      frame.bodyOffset = Math.min(5, geometry.legLength * .18) * (crouch + landing) - airborne * 27;
      frame.leftFoot.y -= airborne * 27; frame.rightFoot.y -= airborne * 24;
      frame.bodyScaleX = 1 + (crouch + landing) * .09 - airborne * .035;
      frame.bodyScaleY = 1 - (crouch + landing) * .075 + airborne * .055;
      frame.headAngle = -Math.sin((t - .08) * Math.PI * 2) * 11;
      frame.wingAngle = -airborne * 59; frame.tailAngle = Math.sin((t - .17) * Math.PI * 2) * 12;
      frame.openBeak = t > .2 && t < .72; break;
    }
    case 'tap':
      frame.headAngle = Math.sin(t * Math.PI) * (reaction === 1 ? 13 : -10);
      frame.wingAngle = reaction === 2 ? -Math.sin(t * Math.PI) * 26 : -4;
      frame.closedEyes = reaction === 1 && t > .2 && t < .8;
      frame.openBeak = reaction === 0 && t > .15 && t < .7;
      frame.tailAngle = wave * 5;
      frame.bodyScaleY = 1 - Math.sin(t * Math.PI) * .035;
      frame.browAngle = Math.sin(t * Math.PI) * (reaction === 0 ? -12 : 8);
      break;
    case 'stroke':
      frame.closedEyes = true; frame.headAngle = -10;
      frame.headOffset = 2; frame.wingAngle = 5; frame.tailAngle = -5 + wave * 4;
      frame.bodyAngle = wave * 1.5; frame.bodyScaleX = 1.025; frame.bodyScaleY = .98;
      break;
    case 'held':
      // Hip and ankle coordinates come from this bird's anatomy, never a generic sprite.
      frame.leftFoot = { x: geometry.anchors.legRootLeft.x + 3, y: geometry.anchors.legRootLeft.y + geometry.legLength * 1.1 };
      frame.rightFoot = { x: geometry.anchors.legRootRight.x - 3, y: geometry.anchors.legRootRight.y + geometry.legLength * 1.04 };
      frame.leftFoot.x += wave * 3; frame.rightFoot.y += Math.sin((t + .2) * Math.PI * 2) * 3;
      frame.wingAngle = -24 + wave * 5; frame.headAngle = -8; frame.tailAngle = 7 - wave * 5;
      frame.bodyScaleX = .97; frame.bodyScaleY = 1.035; frame.browAngle = -8;
      break;
    case 'land':
      frame.bodyOffset = Math.min(geometry.legLength * .23, 6) * Math.sin(t * Math.PI);
      frame.headAngle = Math.sin(t * Math.PI) * 6; frame.wingAngle = -Math.sin(t * Math.PI) * 12;
      frame.bodyScaleX = 1 + Math.sin(t * Math.PI) * .09;
      frame.bodyScaleY = 1 - Math.sin(t * Math.PI) * .075;
      frame.tailAngle = Math.sin(t * Math.PI * 2) * 9;
      break;
    case 'peck':
      frame.headAngle = 18 * Math.sin(t * Math.PI); frame.headOffset = 3 * Math.sin(t * Math.PI);
      break;
    case 'yawn':
      frame.closedEyes = t > .2 && t < .8; frame.openBeak = t > .2 && t < .8;
      frame.headAngle = -12 * Math.sin(t * Math.PI); frame.wingAngle = -10 * Math.sin(t * Math.PI);
      break;
    case 'sleep':
      frame.bodyOffset = geometry.legLength * .67;
      frame.headAngle = 17; frame.headOffset = 7; frame.wingAngle = 7;
      frame.bodyScaleY = .96 + wave * .008; frame.bodyScaleX = 1.025;
      break;
    case 'wake':
      frame.bodyOffset = geometry.legLength * .67 * (1 - ease(t));
      frame.headAngle = (1 - ease(t)) * 17 - Math.sin(t * Math.PI) * 19;
      frame.wingAngle = -Math.sin(t * Math.PI) * 45; frame.closedEyes = t < .3;
      frame.bodyScaleY = 1 + Math.sin(t * Math.PI) * .055; frame.browAngle = -Math.sin(t * Math.PI) * 9;
      break;
    case 'flap':
      frame.wingAngle = -35 + wave * 48; frame.tailAngle = wave * 6;
      frame.leftFoot = { x: frame.leftFoot.x - 7, y: geometry.anchors.legRootLeft.y + geometry.legLength * .48 };
      frame.rightFoot = { x: frame.rightFoot.x - 9, y: geometry.anchors.legRootRight.y + geometry.legLength * .4 };
      break;
    case 'hit': frame.closedEyes = true; frame.wingAngle = -22; frame.headAngle = 12; break;
    case 'hatch':
      frame.headAngle = -Math.sin(t * Math.PI) * 13; frame.wingAngle = -Math.sin(t * Math.PI) * 38;
      frame.bodyScaleX = 1 + pulse(t, 0, .4) * .1 - pulse(t, .3, .85) * .04;
      frame.bodyScaleY = 1 - pulse(t, 0, .4) * .09 + pulse(t, .3, .85) * .07;
      frame.openBeak = t > .4 && t < .7; break;
    case 'grow':
      frame.headAngle = -Math.sin(t * Math.PI) * 8; frame.wingAngle = -Math.sin(t * Math.PI) * 18;
      frame.bodyScaleX = 1 - Math.sin(t * Math.PI) * .025; frame.bodyScaleY = 1 + Math.sin(t * Math.PI) * .035;
      break;
    case 'sneeze': {
      const inhale = pulse(t, 0, .55), sneeze = pulse(t, .48, .73), recover = pulse(t, .68, 1);
      frame.headAngle = -inhale * 21 + sneeze * 32 - recover * 8;
      frame.headOffsetX = -inhale * 3 + sneeze * 7;
      frame.bodyScaleX = 1 - inhale * .04 + sneeze * .09;
      frame.bodyScaleY = 1 + inhale * .04 - sneeze * .07;
      frame.closedEyes = t > .47 && t < .74; frame.openBeak = t > .22 && t < .72;
      frame.wingAngle = -sneeze * 31; frame.tailAngle = -sneeze * 17 + recover * 11;
      frame.browAngle = -inhale * 14; break;
    }
    case 'startle': {
      const anticipation = pulse(t, 0, .2), jump = pulse(t, .14, .7), recover = pulse(t, .64, 1);
      frame.bodyOffset = anticipation * Math.min(4, geometry.legLength * .14) - jump * 15;
      frame.leftFoot.y -= jump * 14; frame.rightFoot.y -= jump * 12;
      frame.bodyScaleX = 1 + anticipation * .07 - jump * .06 + recover * .04;
      frame.bodyScaleY = 1 - anticipation * .07 + jump * .1 - recover * .035;
      frame.headAngle = -jump * 13 + recover * 7; frame.wingAngle = -jump * 62;
      frame.openBeak = jump > .2; frame.browAngle = -jump * 19; frame.tailAngle = jump * 17;
      break;
    }
    case 'stretch': {
      const reach = pulse(t, .08, .98);
      frame.bodyScaleY = 1 + reach * .085; frame.bodyScaleX = 1 - reach * .055;
      frame.headAngle = -reach * 24; frame.headOffset = -reach * 5;
      frame.wingAngle = -reach * 76; frame.tailAngle = reach * 16;
      frame.closedEyes = reach > .7; frame.openBeak = reach > .5; frame.browAngle = reach * 8;
      break;
    }
    case 'shake': {
      const envelope = Math.sin(t * Math.PI), rattle = Math.sin(t * Math.PI * 12) * envelope;
      frame.bodyAngle = rattle * 3.3; frame.headAngle = -rattle * 10;
      frame.wingAngle = -18 * envelope - rattle * 14; frame.tailAngle = rattle * 17;
      frame.bodyScaleX = 1 + envelope * .04; frame.bodyScaleY = 1 - envelope * .035;
      frame.closedEyes = t > .18 && t < .78; break;
    }
    case 'stumble': {
      const tip = pulse(t, 0, .58), catchStep = pulse(t, .4, .95);
      frame.bodyAngle = tip * 12 - catchStep * 6;
      frame.headAngle = -tip * 17 + catchStep * 10; frame.headOffsetX = tip * 3;
      frame.wingAngle = -tip * 54; frame.tailAngle = -tip * 18;
      frame.leftFoot.x += tip * 9; frame.rightFoot.x += catchStep * 11;
      frame.rightFoot.y -= catchStep * 7; frame.eyeOffsetX = -tip * 2; frame.browAngle = -tip * 15;
      break;
    }
    default:
      frame.headAngle = wave * 1.7; frame.tailAngle = Math.sin((t - .1) * Math.PI * 2) * 3;
      frame.bodyScaleY = 1 + wave * .009; frame.wingAngle = Math.sin((t - .2) * Math.PI * 2) * 1.6;
      frame.eyelid = Math.max(0, wave) * .1;
      break;
  }
  return frame;
}
