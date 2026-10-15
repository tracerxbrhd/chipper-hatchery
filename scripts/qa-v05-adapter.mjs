import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/api/telegram.ts', import.meta.url),'utf8'), {mode:'strip'});
const { setupTelegram } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Element {}
globalThis.HTMLElement = Element;
function host({ memory, saveData, theme='dark' }={}) {
 const connection = Object.assign(new EventTarget(), { saveData });
 Object.defineProperty(globalThis,'navigator',{ configurable:true,value:{deviceMemory:memory,connection} });
 const listeners = new Map(), colors = [], properties = new Map();
 const system = Object.assign(new EventTarget(),{ matches:theme==='dark' });
 const root={dataset:{},style:{setProperty:(k,v)=>properties.set(k,v)}};
 globalThis.document=Object.assign(new EventTarget(),{documentElement:root,activeElement:null,hidden:false});
 const app={initData:'synthetic-local-adapter-only',colorScheme:theme,viewportStableHeight:568,isActive:true,version:'9.1',
  safeAreaInset:{top:24,bottom:16,left:0,right:0},contentSafeAreaInset:{top:72,bottom:16,left:0,right:0},
  ready(){},expand(){},disableVerticalSwipes(){},enableVerticalSwipes(){},isVersionAtLeast(){return true},
  onEvent:(name,cb)=>listeners.set(name,cb),offEvent:(name,cb)=>{assert.equal(listeners.get(name),cb);listeners.delete(name)},
  setHeaderColor:value=>colors.push(['header',value]),setBackgroundColor:value=>colors.push(['background',value]),setBottomBarColor:value=>colors.push(['bottom',value])};
 globalThis.window=Object.assign(new EventTarget(),{Telegram:{WebApp:app},innerWidth:360,innerHeight:568,matchMedia:()=>system,setTimeout,clearTimeout});
 return {root,app,system,connection,listeners,colors,properties};
}
let h=host();let clean=setupTelegram();
assert.equal(h.root.dataset.theme,'dark');assert.equal(h.root.dataset.glass,'on');assert.equal(h.root.dataset.active,'true');
assert.deepEqual(h.colors.slice(-3).map(x=>x[1]),['#17152b','#17152b','#17152b']);
assert.equal(h.properties.get('--app-height'),'568px');assert.equal(h.properties.get('--tg-safe-bottom'),'16px');
assert.equal(h.properties.get('--tg-chrome-left'),'96px');assert.equal(h.root.dataset.hud,'compact');
h.app.colorScheme='light';h.listeners.get('themeChanged')();
assert.equal(h.root.dataset.theme,'light');assert.deepEqual(h.colors.slice(-3).map(x=>x[1]),['#fff7e9','#fff7e9','#fff7e9']);
h.connection.saveData=true;h.connection.dispatchEvent(new Event('change'));assert.equal(h.root.dataset.glass,'off');
h.connection.saveData=false;h.connection.dispatchEvent(new Event('change'));assert.equal(h.root.dataset.glass,'on');
h.listeners.get('deactivated')();assert.equal(h.root.dataset.active,'false');h.app.isActive=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.root.dataset.active,'false');
h.app.isActive=true;h.listeners.get('activated')();assert.equal(h.root.dataset.active,'true');
document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.root.dataset.active,'false');
clean();assert.equal(h.listeners.size,0);h.connection.saveData=true;h.connection.dispatchEvent(new Event('change'));assert.equal(h.root.dataset.glass,'on');
for(const memory of [1,2]) {h=host({memory});clean=setupTelegram();assert.equal(h.root.dataset.glass,'off');clean();}
for(const memory of [0,4,undefined]) {h=host({memory});clean=setupTelegram();assert.equal(h.root.dataset.glass,'on');clean();}
h=host({saveData:true});clean=setupTelegram();assert.equal(h.root.dataset.glass,'off');clean();
console.log('PASS: 7 adapter scenarios: day/night native colors; stable viewport/native corridors; save-data changes; low-memory fallback; absent hints; hide/deactivate/resume; exact listener cleanup. Synthetic DOM/adapter assertions, not browser/device evidence.');
