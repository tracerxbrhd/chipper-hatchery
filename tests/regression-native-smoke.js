import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, operation, ctx } from './helpers.js';
import { giftFixture } from './gifts-helpers.js';
import { createTowerService } from '../tgcloud/lib/towerService.js';
import { createTowerState, towerStateHash } from '../tgcloud/lib/towerRules.js';
import { BALANCE } from '../tgcloud/lib/domain.js';
import { createSocialService } from '../tgcloud/lib/social.js';
import { createGuestService } from '../tgcloud/lib/guestService.js';
import { CHICK_PRESETS, GENE_OPTIONS, generateGenes, validGenes } from '../tgcloud/lib/chickGenes.js';
import { refreshProfileIdentity, verifiedProfileIdentity, sanitizeTelegramPhotoUrl } from '../tgcloud/lib/profileIdentity.js';
let groups=0;
async function run(name, work) { await work(); groups++; console.log(`PASS ${name}`); }
await run('concurrent hatch and purchase preserve one bird and one debit', async()=>{
 const f=fixture(); const boot=await f.call('bootstrap'); assert.equal(boot.ok,true);
 const hatches=await Promise.all(Array.from({length:10},()=>f.call('hatchEgg',operation({eggId:boot.state.egg.id}))));
 assert(hatches.every(x=>x.ok)); assert.equal(new Set(hatches.map(x=>x.result.chickId)).size,1);
 const row=await f.store.read('101'); assert.equal(row.state.chicks.length,1); assert.equal(row.state.telemetry.totals.first_hatch,1);
 await f.seedFeathers(12); const buys=await Promise.all(Array.from({length:10},()=>f.call('buyEgg',operation())));
 assert.equal(buys.filter(x=>x.ok).length,1); assert.equal((await f.call('getHome')).state.player.feathers,6);
});
await run('daily claim CAS and seven-day receipt replay credit once',async()=>{
 const f=fixture(); await f.initial(); const key=operation();
 const results=await Promise.all(Array.from({length:10},()=>f.call('claimDailyBonus',key)));
 assert(results.every(x=>x.ok)); assert.equal((await f.store.read('101')).state.player.feathers,1);
 f.advance(7*86400000); const old=await f.call('claimDailyBonus',key); assert.equal(old.state.player.feathers,1);
 const next=await f.call('claimDailyBonus',operation()); assert.equal(next.state.player.feathers,2);
 assert.equal((await f.call('claimDailyBonus',operation())).error.code,'ALREADY_CLAIMED');
});
await run('server sleep survives requests and care stays blocked until wake',async()=>{
 const f=fixture(); const chickId=await f.initial(); const first=await f.call('careAction',operation({chickId,action:'sleep'}));
 assert.equal(first.ok,true); const until=first.state.chicks[0].sleepUntil; f.advance(600000);
 assert.equal((await f.call('careAction',operation({chickId,action:'sleep'}))).state.chicks[0].sleepUntil,until);
 assert.equal((await f.call('careAction',operation({chickId,action:'feed'}))).error.code,'CHICK_SLEEPING');
 f.advance(35*60000); const wake=await f.call('getHome'); assert.equal(wake.state.chicks[0].sleepUntil,null); assert.equal(wake.state.chicks[0].energy,100);
});
await run('Flaps duplicate finishes credit once and preserve cooldown',async()=>{
 const f=fixture(); await f.initial(); const start=await f.call('startFlapsRun',operation()); assert.equal(start.ok,true); f.advance(25000);
 const key=operation({runId:start.result.runId,score:8,endReason:'crash'});
 const finishes=await Promise.all(Array.from({length:10},()=>f.call('finishFlapsRun',key)));
 assert(finishes.every(x=>x.ok&&x.result.rewarded)); const row=await f.store.read('101');
 assert.equal(row.state.player.feathers,1); assert.equal(row.state.telemetry.totals.flaps_finished,1);
 await f.call('finishFlapsRun',operation({runId:start.result.runId,score:8,endReason:'crash'}));
 assert.equal((await f.store.read('101')).state.player.feathers,1);
});
await run('gift transfer preserves historical genes, age, owner uniqueness and balance',async()=>{
 const f=await giftFixture(); const balance=f.totalFeathers(); const {giftId}=await f.offer();
 const key=operation({giftId,accept:true}); const accepted=await f.gift('respondGift',key,202); assert.equal(accepted.ok,true);
 assert.deepEqual(f.owners(),[202]); assert.equal(f.totalFeathers(),balance);
 assert.deepEqual((await f.store.read('202')).state.chicks.find(c=>c.id===f.extra.id),f.extra);
 const repeat=await f.gift('respondGift',key,202); assert.equal(repeat.ok,true); assert.deepEqual(f.owners(),[202]);
});
await run('gift accept/cancel race leaves exactly one owner across eight schedules',async()=>{
 for(let attempt=0;attempt<8;attempt++){
  const f=await giftFixture();const {giftId}=await f.offer();
  const accept=()=>f.gift('respondGift',operation({giftId,accept:true}),202);
  const cancel=()=>f.gift('cancelGift',operation({giftId}));
  await Promise.all(attempt%2?[accept(),cancel()]:[cancel(),accept()]); assert.equal(f.owners().length,1);
 }
});
await run('Nest Defense start replay, owner check, claimed-wave rejection and retirement',async()=>{
 const f=fixture(); await f.initial(); const tower=createTowerService({database:f.database,store:f.store,gameService:f.service,now:()=>f.now,random:()=>.1,id:randomUUID});
 const call=(method,input,owner=101)=>tower.call(method,input,ctx(owner)); const key=operation();
 const starts=await Promise.all(Array.from({length:10},()=>call('startTowerRun',key))); assert(starts.every(x=>x.ok));
 const run=starts[0].result.run; assert.equal(new Set(starts.map(x=>x.result.run.runId)).size,1); assert.deepEqual(run.checkpoint,createTowerState(run.seed));
 await f.initial(202); assert.equal((await call('getTowerRun',{runId:run.runId},202)).error.code,'RUN_NOT_FOUND');
 assert.equal((await call('finishTowerRun',operation({runId:run.runId,endReason:'retire',wave:999}))).error.code,'INVALID_REQUEST');
 assert.equal((await call('checkpointTowerRun',operation({runId:run.runId,revision:0,commands:[],ticks:0,expectedHash:towerStateHash(run.checkpoint),hp:999}))).error.code,'INVALID_REQUEST');
 const retired=await call('finishTowerRun',operation({runId:run.runId,endReason:'retire'}));assert.equal(retired.ok,true);assert.equal(retired.state.player.feathers,0);
});

await run('care cooldown and absence keep economy bounded without penalty',async()=>{
 const f=fixture(); const chickId=await f.initial();
 assert.equal((await f.call('careAction',operation({chickId,action:'feed'}))).ok,true);
 assert.equal((await f.call('careAction',operation({chickId,action:'feed'}))).error.code,'CARE_COOLDOWN');
 assert.equal((await f.call('careAction',operation({chickId,action:'play'}))).state.player.feathers,1);
 f.advance(30*86400000); const after=await f.call('getHome'); assert.equal(after.ok,true);
 assert.equal(after.state.chicks[0].id,chickId); assert.equal(after.state.player.feathers,1);
 for(const need of ['hunger','mood','energy']) assert(after.state.chicks[0][need]>=BALANCE.minNeed);
});
await run('Codex legacy backfill preserves birds, receipts, balance and stabilizes revision',async()=>{
 const f=fixture();await f.initial();await f.seedFeathers(42);
 const row=await f.store.read('101');delete row.state.player.discoveredTraits;row.state.balanceVersion='0.3.0';await f.store.compareAndSwap('101',row.revision,row.state);
 const before=await f.store.read('101');const codex=await f.call('listTraitCodex');assert.equal(codex.ok,true);assert.equal(codex.result.codex.found,10);
 const after=await f.store.read('101');assert.deepEqual(after.state.chicks,before.state.chicks);assert.deepEqual(after.state.receipts,before.state.receipts);assert.equal(after.state.player.feathers,42);
 await f.call('listTraitCodex');assert.equal((await f.store.read('101')).revision,after.revision);
});
await run('social consent, private profiles, friend guest whitelist and blocking',async()=>{
 const f=fixture();await f.initial();await f.initial(202);
 const social=createSocialService({database:f.database,gameService:f.service,now:()=>f.now,id:randomUUID});
 const call=(method,input={},owner=101)=>social.call(method,input,ctx(owner));
 const a=(await call('getSocial')).result.social.profile;const b=(await call('getSocial',{},202)).result.social.profile;
 assert.equal(a.visibility,'private');assert.equal((await call('getPublicProfile',{profileId:a.profileId},202)).error.code,'PROFILE_UNAVAILABLE');
 const link=(await call('createSocialLink',operation({kind:'invite'}),202)).result;
 assert.equal((await call('sendFriendRequest',operation({profileId:b.profileId,inviteToken:link.link.token}))).ok,true);
 const incoming=(await call('getSocial',{},202)).result.social.incoming[0];assert(incoming);
 assert.equal((await call('respondFriendRequest',operation({requestId:incoming.requestId,accept:true}),202)).ok,true);
 await call('updatePrivacy',operation({visibility:'friends',collectionVisibility:'friends'}),202);
 const guests=createGuestService({database:f.database,gameService:f.service,now:()=>f.now});const before=await f.store.read('202');
 const guest=await guests.call('getGuestChick',{profileId:b.profileId},ctx());assert.equal(guest.ok,true);
 assert.deepEqual(Object.keys(guest.result.guest.chick).sort(),['appearanceId','appearanceVersion','bornAt','genes','id','name','rarity','stage']);assert.deepEqual(await f.store.read('202'),before);
 assert.equal((await call('blockUser',operation({profileId:b.profileId,blocked:true}))).ok,true);
 assert.equal((await guests.call('getGuestChick',{profileId:b.profileId},ctx())).error.code,'PROFILE_UNAVAILABLE');
});
await run('gene generator remains original V2 and covers actual attainable variants',async()=>{
 let seed=0x71c205;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const seen=Object.fromEntries(Object.keys(GENE_OPTIONS).map(key=>[key,new Set()]));
 for(let i=0;i<5000;i++){const genes=generateGenes(CHICK_PRESETS[i%CHICK_PRESETS.length],random);assert(validGenes(genes));for(const key of Object.keys(GENE_OPTIONS))seen[key].add(genes[key]);}
 for(const [key,options]of Object.entries(GENE_OPTIONS))assert.deepEqual([...seen[key]].sort(),[...options].sort());
});
await run('verified Telegram identity rejects unsafe/foreign hints and unsafe avatar URLs',async()=>{
 const state={player:{telegramId:'101',displayName:'Chipper nickname'}};
 assert.equal(verifiedProfileIdentity({initDataUnsafe:{user:{id:101,first_name:'forged'}}},1),null);
 assert.equal(refreshProfileIdentity(state,{initData:{user:{id:202,first_name:'foreign'}}},1),false);
 assert.equal(refreshProfileIdentity(state,{initData:{user:{id:101,first_name:'Owner'}}},1),true);assert.equal(state.player.displayName,'Chipper nickname');
 for(const url of ['http://t.me/a.jpg','javascript:alert(1)','https://t.me.evil.test/a.jpg','https://evil.test@t.me/a'])assert.equal(sanitizeTelegramPhotoUrl(url),null);
});
assert.equal(BALANCE.eggCost,6); console.log(`Native Node + real SQLite smoke: ${groups} groups PASS. Separate diagnostic; not npm check/test:ui.`);
