import assert from 'node:assert/strict';
import { poseFrame } from '../src/chicks/animation.ts';
import { buildGeometry } from '../src/chicks/geometry.ts';
import { NEUTRAL_GENES, SHAPES, visualDetailsFor } from '../src/chicks/models.ts';
import { COMIC_DURATIONS, createWorldModel, personalityForSeed, startWorldCare, stepWorld, worldFrame, setWorldTarget } from '../src/world/worldEngine.ts';
import { WORLD_HOME, WORLD_FOOD, isInsideWorld, worldSeed, worldDistance } from '../src/world/worldMath.ts';
const stages=['baby','teen','adult'], comics=Object.keys(COMIC_DURATIONS);
let samples=0;
for(const stage of stages) for(const headShape of SHAPES.headShape) for(const bodyShape of SHAPES.bodyShape) for(const legShape of SHAPES.legShape){
 const g=buildGeometry({...NEUTRAL_GENES,headShape,bodyShape,legShape},stage);
 for(const pose of comics)for(let i=0;i<=40;i++){
  const f=poseFrame(g,pose,i/40);for(const v of Object.values(f))if(typeof v==='number')assert.ok(Number.isFinite(v));
  assert.ok(f.bodyScaleX>.8&&f.bodyScaleY>.8);assert.ok(f.leftFoot.y<=282&&f.rightFoot.y<=282); samples++;
 }
 const f=poseFrame(g,'feed',.5),angle=f.headAngle*Math.PI/180,dx=g.anchors.beakRoot.x+12*g.head.width/87-g.anchors.neck.x,dy=g.anchors.beakRoot.y-g.anchors.neck.y;
 assert.ok(Math.abs(g.anchors.neck.x+dx*Math.cos(angle)-dy*Math.sin(angle)+f.headOffsetX-236)<1e-9);
 assert.ok(Math.abs(g.anchors.neck.y+dx*Math.sin(angle)+dy*Math.cos(angle)+f.headOffset+f.bodyOffset-279)<1e-9);
 assert.ok(g.body.center.y+g.body.height/2+f.bodyOffset<=282);
}
const expected={dreamer:'stretch',nosy:'startle',wiggler:'shake',dandy:'sneeze',clumsy:'stumble'};
for(let i=0;i<50;i++){const v=visualDetailsFor({id:`original-${i}`,genes:NEUTRAL_GENES,stage:'baby'});assert.equal(personalityForSeed(v.fingerprint),expected[v.personality]);}
const found=new Set();let boundSamples=0;
for(let seed=0;seed<6;seed++){const model=createWorldModel(seed);for(let i=0;i<18000;i++){const f=stepWorld(model,.05,false);assert.ok(isInsideWorld(f.position));boundSamples++;if(comics.includes(f.mode))found.add(f.mode);}}
assert.deepEqual([...found].sort(),comics.sort());
for(const pose of comics){const model=createWorldModel(41);model.mode=pose;assert.equal(startWorldCare(model,'feed'),true);assert.equal(model.mode,'feed');model.mode=pose;stepWorld(model,.05,true);assert.equal(model.mode,'sleep');assert.equal(model.lift,0);assert.equal(model.target,null);}
for(const fps of [30,60,120]){const m=createWorldModel(1);setWorldTarget(m,{u:.74,v:.61});for(let i=0;i<fps;i++)stepWorld(m,1/fps,false);assert.ok(Math.abs(worldDistance(m.position,WORLD_HOME)-.17)<1e-9);}
const legacy=createWorldModel(worldSeed('living-chick')), modes=new Set();for(let i=0;i<120*60;i++)modes.add(stepWorld(legacy,1/60,false).mode);assert.ok(modes.has('walk')&&modes.has('look'));assert.ok(modes.has('preen')||modes.has('peck')||modes.has('yawn'));
console.log(JSON.stringify({result:'PASS',comicFrameSamples:samples,boundedAmbientSamples:boundSamples,comics:[...found],personalities:50,legacyModes:[...modes],preserved:'feeding reach, planted ground, care/sleep authority, frame-rate-independent walking'}));
