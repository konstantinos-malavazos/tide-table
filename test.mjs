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
const { generate, predict, coastlineScore, getTruth, getPredicted, setAnchor, clearAnchors, ROWS, COLS, MAX_ANCHORS } = TT;

const chars=['~','.','#'];
const ascii=g=>g.map(r=>r.map(t=>chars[t]).join('')).join('\n');

// 0-anchor baseline
generate();
predict();
const s0 = coastlineScore();
console.log('ROWSxCOLS', ROWS, COLS, 'MAX_ANCHORS', MAX_ANCHORS);
console.log('0-anchor coastline score:', (s0*100).toFixed(1)+'%');

// place anchors: sample every ~2.5 columns along the true sand line
clearAnchors();
let placed=0;
for(let c=0;c<COLS && placed<MAX_ANCHORS;c+=Math.round(COLS/MAX_ANCHORS)){
  for(let r=0;r<ROWS;r++){
    if(getTruth()[r][c]===1){ setAnchor(r,c); placed++; break; }
  }
}
predict();
const s1 = coastlineScore();
console.log('coast-sampled anchors:', placed, '-> score', (s1*100).toFixed(1)+'%');
console.log('improved:', s1>s0);

console.log('\n--- TRUTH ---\n'+ascii(getTruth()));
console.log('\n--- PREDICTION (anchored) ---\n'+ascii(getPredicted()));

if(!(s1>s0)){ console.error('anchors did not improve score'); process.exit(1); }
console.log('\nOK: no exceptions, anchors improve coastline score.');
