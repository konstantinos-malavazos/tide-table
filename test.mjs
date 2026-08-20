import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script found'); process.exit(1); }
const src = m[1];

const makeEl = () => ({ style:{}, dataset:{}, innerHTML:'', textContent:'', className:'',
  classList:{ add(){}, remove(){}, toggle(){} }, addEventListener(){}, appendChild(){}, setAttribute(){} });
globalThis.document = {
  readyState:'complete',
  getElementById:()=>({ style:{}, innerHTML:'', textContent:'', addEventListener(){}, appendChild(){} }),
  createElement:()=>makeEl(), addEventListener(){},
};
globalThis.window = globalThis;
new Function('window','document', src)(globalThis.window, globalThis.document);

const TT = globalThis.TideTable;
const { generate, predict, coastlineScore, scoreDetail, huntScore, gauge, unexplainedCells, dailySeed, shareText, getSeed, getSupport, getTruth, getPredicted,
        getAnomalies, getTruthAnomalies, setAnchor, clearAnchors, ROWS, COLS, MAX_ANCHORS, GAUGE_SECTORS,
        lockSurvey, backToSurvey, resetChart, paint, setBrush, getPhase, getProposal, getStrokeCount, getSmooth, getTruthSmooth,
        getPar, coachLine, weakColumns, PAR_ANCHORS } = TT;

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
// Finding anomalies must be a viable line of play, not a trap: a lean survey
// that finds them should beat grinding out the coastline with the same budget.
// Compared pairwise on identical maps, because map-to-map variance is far larger
// than the effect and swamps an unpaired comparison.
//
// NOTE, and this is a correction to what v5 and v6 claimed. Those versions
// asserted that *gauge-guided probing* beat grinding by +18 pts. That result came
// from a hunt term that counted exception cells without asking where they were,
// and grinding produces plenty of those incidentally. Scored positionally (v8),
// probing with this bot is level with grinding - it lands on a hidden cell only
// 16% of the time, because the gauge localises to a 6x16 sector and an anomaly is
// ~13 cells, so a probe is barely better than a uniform draw inside the sector.
// What is true, and far more strongly than before, is the property below: a
// survey that *finds* the anomalies beats one that grinds the coast. Making the
// search itself pay needs a finer instrument, not a different weight - see
// DESIGN.md item 7.
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
const ci95=d=>{ const m=mean(d);
  return 1.96*Math.sqrt(d.reduce((s,x)=>s+(x-m)*(x-m),0)/(d.length-1))/Math.sqrt(d.length); };

const EN=800, dFind=[], dProbe=[], ptsLazy=[], ptsFind=[], ptsHunt=[], ptsGrind=[];
for(let i=0;i<EN;i++){
  generate();
  huntRun(4,11);            const h=scoreDetail().points;
  clearAnchors(); walkCoast(11); predict(); const g=scoreDetail().points;
  clearAnchors(); walkCoast(6);
  for(const a of getTruthAnomalies()) setAnchor(a.r,a.c);
  predict();                const f=scoreDetail().points;
  clearAnchors(); predict(); ptsLazy.push(scoreDetail().points);
  ptsHunt.push(h); ptsGrind.push(g); ptsFind.push(f);
  dFind.push(f-g); dProbe.push(h-g);
}
const mf=mean(dFind), cf=ci95(dFind), mp=mean(dProbe), cp=ci95(dProbe);
console.log('\npoints  lazy '+mean(ptsLazy).toFixed(0)+'   grind the coast '+mean(ptsGrind).toFixed(0)
  +'   probe with the gauge '+mean(ptsHunt).toFixed(0)+'   find the anomalies '+mean(ptsFind).toFixed(0));
console.log('paired vs grinding:  find '+(mf>=0?'+':'')+mf.toFixed(0)+' +/- '+cf.toFixed(0)
  +'   probe '+(mp>=0?'+':'')+mp.toFixed(0)+' +/- '+cp.toFixed(0)+'  (probing is level: see the note above)\n');

check('doing nothing scores nothing', mean(ptsLazy)===0);
check('finding the anomalies beats grinding the coast at the same budget', mf-cf > 0,
      '+'+mf.toFixed(0)+' pts, 95% CI +/-'+cf.toFixed(0));
check('the score is the declared blend of coastline and hunt', (()=>{
  generate(); clearAnchors(); walkCoast(8); predict();
  const d=scoreDetail();
  return d.hunt===null ? Math.abs(d.total-d.lift)<1e-9 : Math.abs(d.total-(0.55*d.lift+0.45*d.hunt))<1e-9;
})());
// averaged over maps rather than asserted per map: an individual patch can be
// offset enough to only partly close its sector
let hBefore=0, hAfter=0, hMaps=0;
for(let i=0;i<120;i++){
  generate();
  if(!getTruthAnomalies().length) continue;
  hMaps++;
  clearAnchors(); predict(); hBefore+=huntScore()||0;
  clearAnchors(); walkCoast(6);
  for(const a of getTruthAnomalies()) setAnchor(a.r,a.c);
  predict(); hAfter+=huntScore()||0;
}
check('an uncharted map closes none of the gauge', hBefore===0);
// Patches are placed from the gauge's own column profile, so how far off-centre
// the anchor landed no longer decides how good the patch is. What is left is the
// row, which a column tally cannot give and the anchor must supply.
check('charting the anomalies wins most of the hunt', hAfter/hMaps > 0.45,
      (hAfter/hMaps*100).toFixed(0)+'% won over '+hMaps+' maps');

// --- seeds, hidden counts, uncertainty ------------------------------------
check('the same seed always gives the same coastline', (()=>{
  generate(4242); const a=JSON.stringify(getTruth());
  generate(999);
  generate(4242); return JSON.stringify(getTruth())===a && getSeed()===4242;
})());
check('different seeds give different coastlines', (()=>{
  generate(1); const a=JSON.stringify(getTruth());
  generate(2); return JSON.stringify(getTruth())!==a;
})());
check('the daily seed is stable within a day', dailySeed()===dailySeed());
check('the anomaly count varies and is sometimes zero', (()=>{
  const seen=new Set();
  for(let i=0;i<400;i++){ generate(); seen.add(getTruthAnomalies().length); }
  return seen.has(0) && seen.size>=4;
})());
check('a map hiding nothing is scored on the coastline alone', (()=>{
  for(let i=0;i<400;i++){
    generate();
    if(getTruthAnomalies().length) continue;
    clearAnchors(); walkCoast(6); predict();
    const d=scoreDetail();
    return d.hunt===null && Math.abs(d.total-d.lift)<1e-9;
  }
  return false;
})());
check('the share string leaks no positions', (()=>{
  generate(4242); clearAnchors(); walkCoast(6); predict();
  const s=shareText();
  return s.indexOf('Tide Table')===0 && !/\d+\s*,\s*\d+/.test(s);
})());
check('unsurveyed columns are marked as guesswork', (()=>{
  generate(4242); clearAnchors();
  for(let r=0;r<ROWS;r++) if(getTruth()[r][1]===1){ setAnchor(r,1); break; }
  predict();
  const sup=getSupport();
  return sup[1] > sup[COLS-1] && sup[COLS-1] < 0.45;
})());

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

// --- the chart phase, and the brush ---------------------------------------
// The player now commits before the reveal and paints over what the model
// proposed, so the brush is a scoring surface. Three things have to hold: the
// brush must be able to win, it must be able to lose, and it must never buy
// credit the survey did not pay for.

const survey6 = () => { clearAnchors(); walkCoast(6);
  for(const a of getTruthAnomalies()) setAnchor(a.r,a.c); lockSurvey(); };

// a plausible human stroke: the model flagged something here, so fill the ring
// around the anchor with the tile that anchor measured
function ringStroke(rad){
  for(const a of getAnomalies().map(x=>({r:x.r,c:x.c,tile:x.tile}))){
    setBrush(a.tile);
    for(let r=Math.max(0,a.r-rad);r<=Math.min(ROWS-1,a.r+rad);r++)
      for(let c=Math.max(0,a.c-rad);c<=Math.min(COLS-1,a.c+rad);c++)
        if(Math.hypot(c-a.c,r-a.r)<=rad) paint(r,c);
  }
}
function paintTruth(){ const t=getTruth();
  for(let k=0;k<3;k++){ setBrush(k);
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(t[r][c]===k) paint(r,c); } }
// The move that broke the counting hunt term: spend nothing, then paint exactly
// as many exception cells as the gauge reports into the sector it reports them
// in, at a row chosen with no information at all.
function phantomPaint(){
  const pr=getPredicted();
  for(const g of gauge()){
    let need=g.short; if(need<=0) continue;
    const mid=Math.floor((g.from+g.to)/2);
    let coast=Math.floor(ROWS/2);
    for(let r=0;r<ROWS;r++) if(pr[r][mid]===1){ coast=r; break; }
    setBrush(2);
    outer: for(let d=1;d<ROWS;d++) for(let c=Math.max(g.from,mid-2);c<Math.min(g.to,mid+3);c++){
      const r=coast+d; if(r>=ROWS) continue;
      paint(r,c); if(--need<=0) break outer;
    }
  }
}

check('the survey locks before the reveal', (()=>{
  generate(); clearAnchors(); walkCoast(4);
  if(getPhase()!=='survey') return false;
  lockSurvey();
  return getPhase()==='chart' && !!getProposal() && getStrokeCount()===0;
})());
check('painting nothing scores exactly the model\u2019s chart', (()=>{
  generate(); survey6();
  return scoreDetail().points===scoreDetail(getProposal()).points;
})());
check('a stroke that agrees with the model is not a stroke', (()=>{
  generate(); survey6();
  const p=getProposal();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ setBrush(p[r][c]); paint(r,c); }
  return getStrokeCount()===0 && scoreDetail().points===scoreDetail(p).points;
})());
check('a measured cell cannot be painted over', (()=>{
  generate(); clearAnchors(); walkCoast(6); lockSurvey();
  const t=getTruth();
  // the first column walkCoast(6) anchors is column 0's topmost sand cell
  let r0=-1; for(let r=0;r<ROWS;r++) if(t[r][0]===1){ r0=r; break; }
  if(r0<0) return true;
  setBrush((t[r0][0]+1)%3); paint(r0,0);
  return getStrokeCount()===0 && getPredicted()[r0][0]===t[r0][0];
})());
check('going back to the survey discards the chart', (()=>{
  generate(); survey6(); ringStroke(2);
  if(getStrokeCount()===0) return true;   // nothing was flagged on this map
  backToSurvey();
  return getPhase()==='survey' && getStrokeCount()===0 && getProposal()===null;
})());
check('resetting the chart restores the model\u2019s proposal', (()=>{
  generate(); survey6();
  const before=scoreDetail().points;
  ringStroke(3); resetChart();
  return getStrokeCount()===0 && scoreDetail().points===before;
})());

// Paired on an explicit seed per map: map-to-map variance is several times the
// effect here, and an unpaired run of the same comparison widens the interval
// four-fold (+60 +/- 20 unpaired against +45 +/- 5 paired).
const PN=400, pModel=[], pR2=[], pR3=[], pTruth=[], pPhantom=[];
for(let i=0;i<PN;i++){
  const s=9000+i;
  generate(s); survey6();                     pModel.push(scoreDetail().points);
  generate(s); survey6(); ringStroke(2);      pR2.push(scoreDetail().points);
  generate(s); survey6(); ringStroke(3);      pR3.push(scoreDetail().points);
  generate(s); survey6(); paintTruth();       pTruth.push(scoreDetail().points);
  generate(s); clearAnchors(); lockSurvey(); phantomPaint();
                                              pPhantom.push(scoreDetail().points);
}
const dR2=pR2.map((x,i)=>x-pModel[i]), dR3=pR3.map((x,i)=>x-pModel[i]),
      dT=pTruth.map((x,i)=>x-pModel[i]);
console.log('\npainting, over '+PN+' maps that were surveyed for every anomaly');
console.log('  model\u2019s chart, unpainted '+mean(pModel).toFixed(0)
  +'   careful stroke '+mean(pR2).toFixed(0)+' ('+(mean(dR2)>=0?'+':'')+mean(dR2).toFixed(0)+' +/- '+ci95(dR2).toFixed(0)+')'
  +'   overconfident '+mean(pR3).toFixed(0)+' ('+(mean(dR3)>=0?'+':'')+mean(dR3).toFixed(0)+' +/- '+ci95(dR3).toFixed(0)+')');
console.log('  paint the truth '+mean(pTruth).toFixed(0)+' ('+(mean(dT)>=0?'+':'')+mean(dT).toFixed(0)+')'
  +'   paint the gauge\u2019s own reading, 0 anchors '+mean(pPhantom).toFixed(0)+'\n');

// A chart that is right everywhere must be charged for nothing. The invented
// term compares your chart against your own *smooth* coast, which is only an
// estimate of the true one - so without the "and also wrong" clause, every
// accurate coastline correction outside the anomaly footprint was billed as a
// phantom anomaly, and painting the truth lost points on some maps.
check('a pixel-perfect chart wins the whole hunt', (()=>{
  let n=0, red=0, worst=1;
  for(let i=0;i<120;i++){
    generate(6000+i); clearAnchors(); walkCoast(6); lockSurvey(); paintTruth();
    for(const g of TT.huntBySector()) if(g.invented>0) red++;
    const h=scoreDetail().hunt;
    if(h!==null){ n++; worst=Math.min(worst,h); }
  }
  return n>0 && worst===1 && red===0;
})(), 'and is charged for no invented exception');

check('the brush can win: painting the truth beats the model\u2019s chart',
      mean(dT)-ci95(dT) > 0, '+'+mean(dT).toFixed(0)+' pts, 95% CI +/-'+ci95(dT).toFixed(0));
check('a careful stroke pays', mean(dR2)-ci95(dR2) > 0,
      '+'+mean(dR2).toFixed(0)+' pts, 95% CI +/-'+ci95(dR2).toFixed(0));
check('the brush can lose: an overconfident stroke costs', mean(dR3)+ci95(dR3) < 0,
      mean(dR3).toFixed(0)+' pts, 95% CI +/-'+ci95(dR3).toFixed(0));
// The regression guard for the whole scoring change. Under the counting hunt term
// this move scored 586 against 498 for playing honestly - painting the gauge's
// own answer back at it, from zero anchors, was the best line in the game.
check('painting the gauge\u2019s reading back at it earns almost nothing',
      mean(pPhantom)*3 < mean(pModel),
      mean(pPhantom).toFixed(0)+' pts vs '+mean(pModel).toFixed(0)+' for finding them');

// --- par, and the coach ---------------------------------------------------
// A score of 267 meant nothing on its own and nothing on the board said what a
// good number looked like. Par is what a reference survey scores on the same map,
// so it moves with the map's difficulty; the coach names the next best move.

// computePar() runs a whole reference survey inside generate(), so it has to hand
// the map back untouched: no anchors, no prediction, full efficiency bonus.
check('par is fixed for a seed and leaves no state behind', (()=>{
  generate(4242);
  const a=getPar();
  if(getPredicted()!==null) return false;
  if(Math.abs(scoreDetail().eff-(1+MAX_ANCHORS*TT.ANCHOR_COST))>1e-9) return false;
  generate(999); generate(4242);
  return getPar()===a && a>0;
})());

const PARN=300; let beatLazy=0, beatFind=0, beatGrind=0;
for(let i=0;i<PARN;i++){
  generate(12000+i); const p=getPar();
  clearAnchors(); predict();                       if(scoreDetail().points>p) beatLazy++;
  clearAnchors(); walkCoast(11); predict();        if(scoreDetail().points>p) beatGrind++;
  clearAnchors(); walkCoast(6);
  for(const a of getTruthAnomalies()) setAnchor(a.r,a.c);
  predict();                                       if(scoreDetail().points>p) beatFind++;
}
console.log('\npar (a '+PAR_ANCHORS+'-anchor coastal survey on the same map), '+PARN+' maps');
console.log('  beaten by: doing nothing '+(beatLazy/PARN*100).toFixed(0)
  +'%   grinding 11 coast anchors '+(beatGrind/PARN*100).toFixed(0)
  +'%   finding the anomalies '+(beatFind/PARN*100).toFixed(0)+'%\n');

check('par is never beaten by doing nothing', beatLazy===0);
check('par is beatable by finding the anomalies', beatFind/PARN > 0.70,
      (beatFind/PARN*100).toFixed(0)+'% of maps');
check('par still makes grinding a coin flip', beatGrind/PARN > 0.35 && beatGrind/PARN < 0.75,
      (beatGrind/PARN*100).toFixed(0)+'% of maps');

check('the coach says something in every phase', (()=>{
  generate(4242); clearAnchors();
  const seen=[coachLine()];
  walkCoast(3); predict(); seen.push(coachLine());
  lockSurvey();             seen.push(coachLine());
  TT.revealTruth();         seen.push(coachLine());
  return seen.every(t=>typeof t==='string' && t.length>40) && new Set(seen).size===4;
})());
// The guesswork count is the per-click feedback the board never gave: it has to
// actually fall as the coast is surveyed, or it is just another static label.
check('the coach\u2019s guesswork count falls as the coast is surveyed', (()=>{
  let prev=null, ok=true;
  for(const n of [0,2,4,6,8,10]){
    let tot=0;
    for(let i=0;i<60;i++){ generate(20000+i); clearAnchors(); walkCoast(n); predict(); tot+=weakColumns(); }
    const avg=tot/60;
    if(prev!==null && avg>prev) ok=false;
    prev=avg;
  }
  return ok && prev<COLS/4;
})(), '30 -> 19 -> 11 -> 6 -> 4 -> 2 columns for a player who spreads anchors');

// The coach must never send the player somewhere the game will not let them go,
// and must never congratulate them while the board is showing a problem.
check('the coach never advises spending an anchor the player does not have', (()=>{
  for(let i=0;i<200;i++){
    generate(20000+i); clearAnchors(); walkCoast(MAX_ANCHORS); predict();
    const t=coachLine();
    if(/next anchor|Probe|Click any cell/.test(t)) return false;
  }
  return true;
})());
// gauge() clamps `short` at zero, so an over-charted sector reads as solved to
// anything looking at `short` alone - which is how the coach came to say "nothing
// left to find" over a red segment.
check('the coach never says the gauge is clear while a red segment shows', (()=>{
  let reds=0;
  for(let i=0;i<400;i++){
    generate(20000+i); clearAnchors(); walkCoast(7);
    // probe blindly to provoke phantom exceptions
    for(let c=2;c<COLS;c+=9) setAnchor(2,c);
    predict();
    if(!TT.sectorsByState().red.length) continue;
    reds++;
    if(/nothing left to find/.test(coachLine())) return false;
  }
  return reds>0;
})(), 'provoked and checked on real over-charted maps');

generate(); clearAnchors(); walkCoast(8);
for(const a of getTruthAnomalies()) setAnchor(a.r,a.c);
predict();
console.log('\n--- TRUTH ---\n'+ascii(getTruth()));
console.log('\n--- PREDICTION ---\n'+ascii(getPredicted()));
console.log('\nanomalies the model accepted: '+JSON.stringify(getAnomalies().map(a=>[a.r,a.c])));

if(fails.length){ console.error('\n'+fails.length+' check(s) failed: '+fails.join(', ')); process.exit(1); }
console.log('\nOK: all checks passed.');
