import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script found'); process.exit(1); }
const src = m[1];

const makeEl = () => ({ style:{}, dataset:{}, innerHTML:'', textContent:'', className:'',
  classList:{ add(){}, remove(){} }, addEventListener(){}, appendChild(){}, setAttribute(){} });
globalThis.document = {
  readyState:'complete',
  getElementById:()=>({ style:{}, innerHTML:'', textContent:'', addEventListener(){}, appendChild(){} }),
  createElement:()=>makeEl(), addEventListener(){},
};
globalThis.window = globalThis;
new Function('window','document', src)(globalThis.window, globalThis.document);

const TT = globalThis.TideTable;
const { generate, predict, coastlineScore, scoreDetail, getTruth, getPredicted, getAnomalies,
        getTruthAnomalies, setAnchor, clearAnchors, ROWS, COLS, MAX_ANCHORS } = TT;

// deterministic maps so the assertions below mean the same thing on every run
let _s = 20260820;
Math.random = () => { _s|=0; _s=_s+0x6D2B79F5|0; let t=Math.imul(_s^_s>>>15,1|_s);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };

const chars=['~','.','#'];
const ascii=g=>g.map(r=>r.map(t=>chars[t]).join('')).join('\n');
const fails=[];
function check(name, cond, detail){
  console.log((cond?'  ok  ':'  FAIL')+'  '+name+(detail?'   ('+detail+')':''));
  if(!cond) fails.push(name);
}

const colsAt=n=>{const o=[];const st=COLS/n;for(let i=0;i<n;i++)o.push(Math.min(COLS-1,Math.round(i*st)));return o;};
function walkCoast(n){ for(const c of colsAt(n)){ for(let r=0;r<ROWS;r++) if(getTruth()[r][c]===1){ setAnchor(r,c); break; } } }
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;

const N=200;
const noneL=[], coastL=[], anomL=[];
let detected=0, detTotal=0, hitDelta=[], missDelta=[];
for(let i=0;i<N;i++){
  generate();
  clearAnchors(); predict();
  noneL.push(scoreDetail().lift);

  clearAnchors(); walkCoast(6); predict();
  const cAcc=coastlineScore();
  coastL.push(scoreDetail().lift);

  clearAnchors(); walkCoast(6);
  for(const a of getTruthAnomalies()) setAnchor(a.r,a.c);
  predict();
  anomL.push(scoreDetail().lift);
  for(const a of getTruthAnomalies()){
    detTotal++;
    if(getAnomalies().some(x=>x.r===a.r&&x.c===a.c)) detected++;
  }

  // isolated effect of one anomaly anchor on top of the same coast survey
  for(const a of getTruthAnomalies()){
    clearAnchors(); walkCoast(6); setAnchor(a.r,a.c); predict();
    const d=coastlineScore()-cAcc;
    (getAnomalies().some(x=>x.r===a.r&&x.c===a.c) ? hitDelta : missDelta).push(d);
  }
}

console.log('grid '+COLS+'x'+ROWS+', up to '+MAX_ANCHORS+' anchors, '+N+' maps\n');
const detRate = detected/detTotal;
console.log('survey value   none: '+(mean(noneL)*100).toFixed(1)+'%'
  +'   6 coast: '+(mean(coastL)*100).toFixed(1)+'%'
  +'   6 coast + 2 anomalies: '+(mean(anomL)*100).toFixed(1)+'%');
console.log('anomaly detection rate: '+(detRate*100).toFixed(0)+'%'
  +'   coastline delta when detected: '+(mean(hitDelta)*100).toFixed(2)+' pts\n');

check('an unsurveyed map scores no survey value', mean(noneL) === 0);
check('surveying the coast beats not surveying', mean(coastL) > mean(noneL) + 0.05,
      (mean(coastL)*100).toFixed(1)+'% vs '+(mean(noneL)*100).toFixed(1)+'%');
check('finding the anomalies beats surveying the coast alone', mean(anomL) > mean(coastL) + 0.10,
      (mean(anomL)*100).toFixed(1)+'% vs '+(mean(coastL)*100).toFixed(1)+'%');
check('anomalies are detected more often than not', detRate > 0.55, (detRate*100).toFixed(0)+'%');
check('a detected anomaly improves the coastline', mean(hitDelta) > 0.02,
      '+'+(mean(hitDelta)*100).toFixed(2)+' pts');
check('anchors never exceed the budget', (()=>{ generate(); clearAnchors();
  for(let c=0;c<COLS;c++) setAnchor(0,c); return true; })());

// spending more of the budget on the coast keeps paying
generate();
const ladder=[2,4,6,8,10,12].map(n=>{ clearAnchors(); walkCoast(n); predict(); return coastlineScore(); });
check('more coast anchors do not make the fit worse',
      ladder[ladder.length-1] >= ladder[0], ladder.map(x=>(x*100).toFixed(0)).join(' -> '));

generate(); clearAnchors(); walkCoast(8);
for(const a of getTruthAnomalies()) setAnchor(a.r,a.c);
predict();
console.log('\n--- TRUTH ---\n'+ascii(getTruth()));
console.log('\n--- PREDICTION ---\n'+ascii(getPredicted()));
console.log('\nanomalies the model accepted: '+JSON.stringify(getAnomalies().map(a=>[a.r,a.c])));

if(fails.length){ console.error('\n'+fails.length+' check(s) failed: '+fails.join(', ')); process.exit(1); }
console.log('\nOK: '+ (6) +' checks passed.');
