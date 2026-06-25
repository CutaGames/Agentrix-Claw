import { readFileSync } from 'fs';
import vm from 'vm';

const games = ['poker', 'towerdefense', 'rhythm', 'racing', 'snake', 'shooter', 'match3', 'breakout', 'runner'];

function extractScripts(html) {
  const out = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[0].slice(0, m[0].indexOf('>'));
    if (/\bsrc\s*=/.test(attrs)) continue;
    out.push(m[1]);
  }
  return out.join('\n;\n');
}

// minimal harness replicating GamePlaytestService
function playtest(html) {
  const script = extractScripts(html);
  try { new vm.Script(script, { filename: 'g.js' }); } catch (e) { return { ok: false, reason: 'syntax: ' + e.message }; }
  let error = null, hadCanvas = false, touchedDom = false;
  const rafQueue = [], elements = [];
  const STR_PROPS = new Set(['fillStyle','strokeStyle','lineWidth','globalAlpha','font','lineCap','lineJoin','lineDashOffset','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY','textBaseline','textAlign','globalCompositeOperation','miterLimit','filter','direction','imageSmoothingEnabled','imageSmoothingQuality']);
  const ctxStub = new Proxy({}, { get(_t, p) {
    if (p === 'measureText') return () => ({ width: 8 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => ({ addColorStop() {} });
    if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return typeof p === 'string' && STR_PROPS.has(p) ? '' : () => undefined;
  }, set() { return true; } });
  function makeEl(tag) {
    const h = {};
    const el = { tagName: (tag||'div').toUpperCase(), style: {}, dataset: {}, children: [], width: 360, height: 640, clientWidth: 360, clientHeight: 640, value: '', textContent: '', innerHTML: '', className: '',
      classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
      getContext(){ hadCanvas = true; return ctxStub; },
      getBoundingClientRect(){ return { left:0, top:0, right:360, bottom:640, width:360, height:640 }; },
      setAttribute(){}, getAttribute(){return null;}, appendChild(c){ touchedDom=true; this.children.push(c); return c; }, removeChild(){}, insertBefore(c){touchedDom=true;return c;},
      querySelector(){ return makeEl('div'); }, querySelectorAll(){ return []; },
      addEventListener(t, fn){ (h[t]=h[t]||[]).push(fn); }, removeEventListener(){}, focus(){}, play(){ return {catch(){}}; },
      _h: h, dispatch(t, ev){ (h[t]||[]).forEach(fn=>{try{fn.call(el,ev);}catch(e){error=error||e.message;}}); const on=el['on'+t]; if(typeof on==='function'){try{on.call(el,ev);}catch(e){error=error||e.message;}} } };
    elements.push(el); return el;
  }
  function mkEvent(extra){ return Object.assign({ preventDefault(){}, stopPropagation(){}, touches:[{clientX:100,clientY:200}], changedTouches:[{clientX:100,clientY:200}], clientX:100, clientY:200, key:'', keyCode:0, deltaY:0 }, extra||{}); }
  const docH = {};
  const documentStub = { getElementById:()=>makeEl('div'), querySelector:()=>makeEl('div'), querySelectorAll:()=>[], createElement:(t)=>makeEl(t), createTextNode:()=>({}), addEventListener:(t,fn)=>{(docH[t]=docH[t]||[]).push(fn);}, removeEventListener(){}, body:makeEl('body'), documentElement:makeEl('html'), head:makeEl('head'), title:'', hidden:false, visibilityState:'visible' };
  const lsM = {}; const localStorageStub = { getItem:k=>k in lsM?lsM[k]:null, setItem:(k,v)=>{lsM[k]=String(v);}, removeItem:k=>{delete lsM[k];}, clear:()=>{} };
  const winH = {};
  const sandbox = { console:{log(){},warn(){},error(){},info(){},debug(){}}, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Map, Set, Symbol, Promise, Float32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, ArrayBuffer, parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
    __GAME_CONFIG:{title:'PT',difficulty:'normal',seed:1}, __reportError:e=>{error=error||(e&&e.message||e);},
    requestAnimationFrame:cb=>{rafQueue.push(cb);return rafQueue.length;}, cancelAnimationFrame(){}, setTimeout:cb=>{try{typeof cb==='function'&&rafQueue.push(()=>cb());}catch{}return 0;}, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    performance:{now:()=>Date.now()}, devicePixelRatio:2, innerWidth:390, innerHeight:780, document:documentStub, localStorage:localStorageStub,
    AudioContext:function(){return new Proxy({},{get:()=>()=>({connect(){},start(){},stop(){}})});}, Image:function(){return makeEl('img');}, alert(){}, navigator:{userAgent:'pt',vibrate(){}},
    addEventListener(t,fn){(winH[t]=winH[t]||[]).push(fn);}, removeEventListener(){} };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox; sandbox.webkitAudioContext = sandbox.AudioContext;
  try {
    const ctx = vm.createContext(sandbox);
    vm.runInContext(`try{\n${script}\n}catch(__e){__reportError(__e);}`, ctx, { timeout: 4000 });
    elements.forEach(el=>{try{el.dispatch('click',mkEvent());}catch(e){error=error||e.message;}});
    (winH['resize']||[]).forEach(fn=>{try{fn(mkEvent());}catch(e){error=error||e.message;}});
    (winH['keydown']||[]).forEach(fn=>{try{fn(mkEvent({key:'ArrowRight'}));}catch(e){error=error||e.message;}});
    let frames=0, t=16; const start=Date.now();
    while(frames<120){ if(Date.now()-start>4000)break; const batch=rafQueue.splice(0,rafQueue.length); if(!batch.length)break; for(const cb of batch){try{cb(t);}catch(e){error=error||e.message;} if(error)return{ok:false,reason:'runtime: '+error,frames:frames+1};} frames++; t+=16; }
    if(error) return { ok:false, reason:'runtime: '+error, frames };
    return { ok:true, frames, hadCanvas, touchedDom };
  } catch(e){ return { ok:false, reason:'vm: '+e.message }; }
}

let allOk = true;
for (const g of games) {
  try {
    const html = readFileSync(new URL(`./${g}/index.html`, import.meta.url), 'utf8');
    const r = playtest(html);
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${g.padEnd(14)} frames=${r.frames||0} canvas=${r.hadCanvas||false}${r.ok?'':'  reason='+r.reason}`);
    if (!r.ok) allOk = false;
  } catch (e) {
    console.log(`ERR   ${g}: ${e.message}`); allOk = false;
  }
}
// negative control: broken script must FAIL
const broken = '<!doctype html><html><body><canvas id="c"></canvas><script>var x=document.getElementById("c");y.foo();function loop(){requestAnimationFrame(loop);}loop();</script></body></html>';
const nb = playtest(broken);
console.log(`${!nb.ok ? 'PASS' : 'FAIL'}  [negative-control] expected FAIL -> got ${nb.ok?'ok':'fail'} (${nb.reason||''})`);
if (nb.ok) allOk = false;
console.log(allOk ? '\nALL OK' : '\nSOME FAILED');
process.exit(allOk ? 0 : 1);
