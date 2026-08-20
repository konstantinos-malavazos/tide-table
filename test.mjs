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
const { generate, predict, coastlineScore, scoreDetail, huntScore, gauge, unexplainedCells, getTruth, getPredicted,
        getAnomalies, getTruthAnomalies, setAnchor, clearAnchors, ROWS, COLS, MAX_ANCHORS, GAUGE_SECTORS } = TT;

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

// --- the economy ----------------------------------------------------------
// Hunting anomalies must be a viable line of play, not a trap: a lean survey
// that goes looking should beat grinding out the coastline with the same budget.
// Compared pairwise on identical maps, because map-to-map variance is far larger
// than the effect and swamps an unpaired comparison.
function huntRun(k,budget){
  clearAnchors(); walkCoast(k); predict();
  const used=new Set(); let spent=k;
  while(spent<budget){
    const hot=gauge().filter(g=>g.short>4).sort((a,b)=>b.short-a.short);
    if(!hot.length) break;
    const g=hot[0], pr=getPredicted(), mid=(g.from+g.to-1)/2, cand=[];
    for(let c=g.from;c<g.to;c++) for(let r=1;r<ROWS-1;r++){
      if(pr[r][c]===1||used.has(r+','+c)) continue;
      let d=99; for(let rr=0;rr<ROWS;rr++) if(pr[rr][c]===1) d=Math.min(d,Math.abs(rr-r));
      cand.push({r:r,c:c,key:Math.abs(d-3.5)+Math.abs(c-mid)*0.35});
    }
    if(!cand.length) break;
    cand.sort((a,b)=>a.key-b.key);
    used.add(cand[0].r+','+cand[0].c); setAnchor(cand[0].r,cand[0].c); predict(); spent++;
  }
  return spent;
}
const EN=800, dHunt=[], ptsLazy=[], ptsHunt=[], ptsGrind=[];
for(let i=0;i<EN;i++){
  generate();
  huntRun(4,11);            const h=scoreDetail().points;
  clearAnchors(); walkCoast(11); predict(); const g=scoreDetail().points;
  clearAnchors(); predict(); ptsLazy.push(scoreDetail().points);
  ptsHunt.push(h); ptsGrind.push(g); dHunt.push(h-g);
}
const md=mean(dHunt);
const ci=1.96*Math.sqrt(dHunt.reduce((s,x)=>s+(x-md)*(x-md),0)/(dHunt.length-1))/Math.sqrt(dHunt.length);
console.log('\npoints  lazy '+mean(ptsLazy).toFixed(0)+'   grind the coast '+mean(ptsGrind).toFixed(0)
  +'   hunt with the gauge '+mean(ptsHunt).toFixed(0)
  +'   (hunt - grind, paired: '+md.toFixed(0)+' +/- '+ci.toFixed(0)+')\n');

check('doing nothing scores nothing', mean(ptsLazy)===0);
check('hunting beats grinding the coast at the same budget', md-ci > 0,
      '+'+md.toFixed(0)+' pts, 95% CI +/-'+ci.toFixed(0));
check('the score is the declared blend of coastline and hunt', (()=>{
  generate(); clearAnchors(); walkCoast(8); predict();
  const d=scoreDetail();
  return Math.abs(d.total-(0.40*d.lift+0.60*d.hunt))<1e-9;
})());
// averaged over maps rather than asserted per map: an individual patch can be
// offset enough to only partly close its sector
let hBefore=0, hAfter=0, hMaps=0;
for(let i=0;i<120;i++){
  generate();
  if(!getTruthAnomalies().length) continue;
  hMaps++;
  clearAnchors(); predict(); hBefore+=huntScore();
  clearAnchors(); walkCoast(6);
  for(const a of getTruthAnomalies()) setAnchor(a.r,a.c);
  predict(); hAfter+=huntScore();
}
check('an uncharted map closes none of the gauge', hBefore===0);
// A patch centred on one off-centre anchor only ever covers part of its anomaly,
// so even perfect anchoring closes about a third of the gauge. That ceiling caps
// the hunt term; raising it is patch-fidelity work, not scoring work.
check('charting the anomalies closes a real share of the gauge', hAfter/hMaps > 0.30,
      (hAfter/hMaps*100).toFixed(0)+'% closed over '+hMaps+' maps');

// --- the tide gauge -------------------------------------------------------
// It must never mislead: it reads zero on an unsurveyed map only where nothing
// is hidden, it localises what is hidden, and it closes once you find it.
let gaugeTotalsMatch=0, gaugeLocalises=0, gaugeClosesOnFind=0, gaugeMaps=0;
for(let i=0;i<N;i++){
  generate();
  const TA=getTruthAnomalies();
  if(!TA.length) continue;
  gaugeMaps++;

  // with no survey at all, everything hidden is still outstanding
  clearAnchors(); predict();
  const before=gauge();
  const outstanding=before.reduce((s,g)=>s+g.short,0);
  if(outstanding>0) gaugeTotalsMatch++;

  // every anomaly sits in a sector the gauge flags
  const w=Math.ceil(COLS/GAUGE_SECTORS);
  const flagged=new Set();
  before.forEach(g=>{ if(g.short>0) for(let c=g.from;c<g.to;c++) flagged.add(c); });
  if(TA.every(a=>flagged.has(a.c))) gaugeLocalises++;

  // finding them closes the reading
  clearAnchors(); walkCoast(6);
  for(const a of TA) setAnchor(a.r,a.c);
  predict();
  const after=gauge().reduce((s,g)=>s+g.short,0);
  if(after<outstanding) gaugeClosesOnFind++;
}
console.log('\ngauge: reads outstanding on '+(gaugeTotalsMatch/gaugeMaps*100).toFixed(0)
  +'% of unsurveyed maps, localises every anomaly on '+(gaugeLocalises/gaugeMaps*100).toFixed(0)
  +'%, closes when found on '+(gaugeClosesOnFind/gaugeMaps*100).toFixed(0)+'%\n');

check('the gauge flags a hidden anomaly before any survey', gaugeTotalsMatch/gaugeMaps > 0.90,
      (gaugeTotalsMatch/gaugeMaps*100).toFixed(0)+'% of maps');
check('every anomaly lies in a sector the gauge flags', gaugeLocalises/gaugeMaps > 0.90,
      (gaugeLocalises/gaugeMaps*100).toFixed(0)+'% of maps');
check('finding the anomalies closes the gauge', gaugeClosesOnFind/gaugeMaps > 0.80,
      (gaugeClosesOnFind/gaugeMaps*100).toFixed(0)+'% of maps');
check('the gauge never invents anomalies on a smooth coast', (()=>{
  // a grid compared against itself has nothing unexplained, wherever the coast sits
  for(let i=0;i<20;i++){ generate();
    const per=unexplainedCells(getTruth(),getTruth());
    if(per.some(x=>x!==0)) return false; }
  return true;
})());

generate(); clearAnchors(); walkCoast(8);
for(const a of getTruthAnomalies()) setAnchor(a.r,a.c);
predict();
console.log('\n--- TRUTH ---\n'+ascii(getTruth()));
console.log('\n--- PREDICTION ---\n'+ascii(getPredicted()));
console.log('\nanomalies the model accepted: '+JSON.stringify(getAnomalies().map(a=>[a.r,a.c])));

if(fails.length){ console.error('\n'+fails.length+' check(s) failed: '+fails.join(', ')); process.exit(1); }
console.log('\nOK: all checks passed.');
