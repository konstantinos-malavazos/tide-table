// Headless checks for reef.html. Same trick as test.mjs: run the page's script in
// a DOM stub and assert the properties the design depends on - above all that the
// game is deducible, because that is the thing the coastline version was not.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const el = () => ({ style:{}, dataset:{}, className:'', textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){}}, addEventListener(){}, appendChild(){}, disabled:false });
globalThis.document={ readyState:'complete', getElementById:el, createElement:el, addEventListener(){} };
globalThis.window=globalThis;
globalThis.location={search:''};
globalThis.localStorage={getItem:()=>'1',setItem(){}};
new Function('window','document','location','localStorage',src)
  (globalThis.window,globalThis.document,globalThis.location,globalThis.localStorage);
const R=globalThis.Reef;
const { build, reading, ruledOut, ringCount, getReefs, ping, getPings, getMarks,
        COLS, ROWS, REEFS, PINGS, SEP, N, dist, xy } = R;

const fails=[];
const check=(name,cond,detail)=>{ console.log((cond?'  ok  ':'  FAIL')+'  '+name+(detail?'   ('+detail+')':''));
  if(!cond) fails.push(name); };
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const med=a=>[...a].sort((x,y)=>x-y)[a.length>>1];

console.log('board '+COLS+'x'+ROWS+', '+REEFS+' reefs, '+PINGS+' pings\n');

// --- the map ---------------------------------------------------------------
check('every board hides exactly '+REEFS+' reefs', (()=>{
  for(let s=0;s<400;s++){ build(s); if(getReefs().length!==REEFS) return false; }
  return true;
})());
check('reefs stay off the rim and '+SEP+' apart', (()=>{
  for(let s=0;s<400;s++){ build(s); const rf=getReefs();
    for(const r of rf){ const [x,y]=xy(r);
      if(x<1||y<1||x>COLS-2||y>ROWS-2) return false;
      for(const q of rf) if(q!==r && dist(r,q)<SEP) return false; }
  }
  return true;
})());
check('the same seed always gives the same board', (()=>{
  build(4242); const a=JSON.stringify(getReefs()); build(7); build(4242);
  return JSON.stringify(getReefs())===a;
})());

// --- the instrument --------------------------------------------------------
check('a ping reports the true distance to the nearest reef', (()=>{
  for(let s=0;s<100;s++){ build(s); const rf=getReefs();
    for(let i=0;i<N;i++){
      const truth=Math.min(...rf.map(r=>dist(i,r)));
      if(reading(i)!==truth) return false; } }
  return true;
})());
// The one invariant the whole game rests on: the board may never rule out a cell
// that actually holds a reef, or the deduction it teaches would be a lie.
check('a cell holding a reef is never ruled out', (()=>{
  for(let s=0;s<300;s++){ build(s); const rf=getReefs();
    for(let k=0;k<PINGS;k++) ping((k*37+s*11)%N);
    for(const r of rf) if(ruledOut(r)) return false; }
  return true;
})());
check('every reef sits on the ring of every ping', (()=>{
  for(let s=0;s<200;s++){ build(s); const rf=getReefs();
    for(let k=0;k<PINGS;k++){
      const p=(k*53+s*7)%N;
      if(ruledOut(p)) continue;
      ping(p);
      // the reading is the nearest reef, so at least one reef is exactly on it
      if(!rf.some(r=>dist(p,r)===getPings().get(p))) return false; } }
  return true;
})());
check('pinging a reef directly counts as finding it', (()=>{
  build(4242); const r=getReefs()[0];
  // simulate the click path the page uses
  const before=getMarks().size;
  ping(r);
  return reading(r)===0 && getPings().get(r)===0;
})());

// --- is it a game? ---------------------------------------------------------
// Enumerate every placement consistent with the readings. If that set collapses
// for a player who thinks and stays large for one who does not, there is a real
// decision here. This is exactly the test the coastline game failed.
const legal=[]; for(let i=0;i<N;i++){ const [x,y]=xy(i);
  if(x>=1&&y>=1&&x<=COLS-2&&y<=ROWS-2) legal.push(i); }
const combos=[]; (function rec(s,acc){ if(acc.length===REEFS){combos.push(acc.slice());return;}
  for(let i=s;i<legal.length;i++){ if(acc.some(j=>dist(legal[i],j)<SEP))continue;
    acc.push(legal[i]); rec(i+1,acc); acc.pop(); }})(0,[]);
const askOf=(cand,p)=>Math.min(...cand.map(r=>dist(p,r)));
const narrow=(reefs,ps)=>{ let alive=combos;
  for(const q of ps){ const a=Math.min(...reefs.map(r=>dist(q,r)));
    alive=alive.filter(c=>askOf(c,q)===a); }
  return alive; };
const bestGuess=alive=>{ const f=new Map();
  for(const c of alive) for(const r of c) f.set(r,(f.get(r)||0)+1);
  return [...f.entries()].sort((a,b)=>b[1]-a[1]).slice(0,REEFS).map(e=>e[0]); };

function thinking(reefs,B){ let alive=combos, ps=[];
  for(let t=0;t<B;t++){
    const smp=alive.length>1200? alive.filter((_,i)=>i%Math.ceil(alive.length/1200)===0):alive;
    let best=null;
    for(let q=0;q<N;q++){ if(ps.includes(q))continue;
      const b={}; for(const c of smp){ const k=askOf(c,q); b[k]=(b[k]||0)+1; }
      let w=0; for(const k in b) w=Math.max(w,b[k]);
      if(!best||w<best.w) best={q,w}; }
    ps.push(best.q); const a=Math.min(...reefs.map(r=>dist(best.q,r)));
    alive=alive.filter(c=>askOf(c,best.q)===a); }
  return alive;
}
const pattern=B=>{ const ps=[];
  for(let y=1;y<ROWS-1&&ps.length<B;y+=2) for(let x=1;x<COLS-1&&ps.length<B;x+=3) ps.push(y*COLS+x);
  let k=0; while(ps.length<B){ const i=(k*29)%N; if(!ps.includes(i)) ps.push(i); k++; }
  return ps.slice(0,B); };
let _r=5; const rnd=()=>{ _r=(_r*1103515245+12345)&0x7fffffff; return _r/0x7fffffff; };
const scatter=B=>{ const s=new Set(); while(s.size<B) s.add(Math.floor(rnd()*N)); return [...s]; };

const MAPS=24;
const res={think:[],patt:[],rand:[]};
let solvedThink=0;
for(let m=0;m<MAPS;m++){
  build(9000+m); const rf=getReefs();
  const a=thinking(rf,PINGS);          res.think.push(bestGuess(a).filter(g=>rf.includes(g)).length);
  if(a.length===1) solvedThink++;
  res.patt.push(bestGuess(narrow(rf,pattern(PINGS))).filter(g=>rf.includes(g)).length);
  res.rand.push(bestGuess(narrow(rf,scatter(PINGS))).filter(g=>rf.includes(g)).length);
}
console.log('\nreefs found at '+PINGS+' pings, over '+MAPS+' boards');
console.log('  thinking about each ping  '+mean(res.think).toFixed(2)+' of '+REEFS
  +'   (pinned the board exactly on '+solvedThink+'/'+MAPS+')');
console.log('  a fixed pattern           '+mean(res.patt).toFixed(2)+' of '+REEFS);
console.log('  scattering pings at random '+mean(res.rand).toFixed(2)+' of '+REEFS+'\n');

// The property the whole redesign exists to satisfy.
check('thinking beats a fixed pattern', mean(res.think) > mean(res.patt) + 0.5,
      mean(res.think).toFixed(2)+' vs '+mean(res.patt).toFixed(2)+' reefs');
check('a fixed pattern is not enough to solve it', mean(res.patt) < REEFS - 0.8,
      mean(res.patt).toFixed(2)+' of '+REEFS);
check('good play pins the board most of the time', solvedThink/MAPS > 0.5,
      solvedThink+'/'+MAPS+' boards narrowed to one answer');
check('the budget matters: fewer pings find fewer reefs', (()=>{
  const at=B=>{ let t=0; for(let m=0;m<12;m++){ build(9000+m); const rf=getReefs();
    t+=bestGuess(thinking(rf,B)).filter(g=>rf.includes(g)).length; } return t/12; };
  const lo=at(4), hi=at(PINGS);
  console.log('    (4 pings -> '+lo.toFixed(2)+' reefs, '+PINGS+' pings -> '+hi.toFixed(2)+')');
  return hi > lo + 1.0;
})());

if(fails.length){ console.error('\n'+fails.length+' check(s) failed: '+fails.join(', ')); process.exit(1); }
console.log('\nOK: all checks passed.');
