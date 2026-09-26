// Verify exported inputs and legal, complete, correctly scored solver replays.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parsePbn} from '../src/pbn.js';
import {initialState,playCard,legalCards,scoreContract} from '../src/bridge.js';
const dir='reports/technique-benchmark-2026-09-25';
const boards=JSON.parse(readFileSync(`${dir}/corpus.json`,'utf8'));
const results=new Map(readFileSync(`${dir}/results.ndjson`,'utf8').trim().split('\n').map(s=>{const r=JSON.parse(s);return[r.id,r]}));
const normalized=hands=>JSON.stringify(hands.map(h=>[...h].sort((a,b)=>a-b)));
const packs={};
for(const [name,label] of Object.entries({'all':null,'squeeze':'Squeeze','elimination-endplay':'Elimination / endplay','trump-coup':'Trump coup','dummy-reversal':'Dummy reversal','crossruff':'Crossruff'})){
 const parsed=parsePbn(readFileSync(`${dir}/${name}.pbn`,'utf8'),name);
 assert.deepEqual(parsed.errors,[],`${name} import errors`);
 const expected=boards.filter(b=>!label||b.labels[label]);assert.equal(parsed.boards.length,expected.length);
 parsed.boards.forEach((b,n)=>{
  assert.equal(normalized(b.hands),normalized(expected[n].hands));
  assert.equal(b.dealer,expected[n].dealer);assert.equal(b.vulnerable,expected[n].vulnerable);
 });packs[name]=parsed.boards.length;
}
let replays=0;
for(const b of boards){
 const r=results.get(b.id);assert.ok(r.normal,`${b.id}: missing normal analysis`);assert.equal(r.key,b.key);
 for(const mode of ['normal','published','source']){
  const run=r[mode];if(!run)continue;
  assert.equal(run.cards.length,52);assert.equal(new Set(run.cards).size,52);
  let state=initialState(b.hands,run.contract.trump,run.contract.declarer);
  for(const card of run.cards){assert.ok(legalCards(state).includes(card),`${b.id}/${mode}: illegal card`);state=playCard(state,card);}
  assert.equal(state.won[run.contract.declarer%2],run.tricks);
  if(mode!=='source'||!run.concessions.length)assert.equal(run.tricks,r.normal.table[run.contract.trump*4+run.contract.declarer],`${b.id}/${mode}: DD trick count`);
  if(mode==='normal'){
   const nsScore=scoreContract(run.contract,run.tricks,b.vulnerable)*(run.contract.declarer%2===0?1:-1);
   assert.equal(nsScore,run.par.score,`${b.id}: par score`);
  }
  for(const f of run.findings){assert.ok(f.start>=0&&f.end<=52&&f.start<f.end);}
  replays++;
 }
}
const nativeImports=[];
for(const path of new Set(boards.filter(b=>b.format==='pbn').map(b=>b.path))){
 const bytes=readFileSync(path);let text;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
 const parsed=parsePbn(text,path);
 nativeImports.push({path,boards:parsed.boards.length,errorCount:parsed.errors.length,errors:parsed.errors});
}
let hashes=0;
for(const m of JSON.parse(readFileSync(`${dir}/sources.json`,'utf8'))){
 assert.equal(createHash('sha256').update(readFileSync(m.download)).digest('hex'),m.sha256);hashes++;
}
// Independently read the fixed compass columns in the exported PBN play tables.
const paired=JSON.parse(readFileSync(`${dir}/case-studies.json`,'utf8'));
const playTables=[...readFileSync(`${dir}/case-studies.pbn`,'utf8').matchAll(/\[Play "([NESW])"\]\s*([\s\S]*?)\*/g)];
assert.equal(playTables.length,paired.length*2);
for(let i=0;i<playTables.length;i++){
 const example=paired[Math.floor(i/2)],line=i%2?example.alternative:example.normal;
 const first='NESW'.indexOf(playTables[i][1]);
 let state=initialState(example.board.hands,line.contract.trump,line.contract.declarer),cards=[];
 const rows=playTables[i][2].trim().split('\n');assert.equal(rows.length,13);
 for(const row of rows){
  const values=row.trim().split(/\s+/);assert.equal(values.length,4);
  for(let j=0;j<4;j++){
   const seat=(state.leader+state.trick.length)%4,code=values[(seat-first+4)%4];
   const card='SHDC'.indexOf(code[0])*13+'23456789TJQKA'.indexOf(code[1]);
   assert.ok(legalCards(state).includes(card));cards.push(card);state=playCard(state,card);
  }
 }
 assert.deepEqual(cards,line.cards);
}
const output={status:'passed',packs,replaysVerified:replays,pairedPbnPlayTablesVerified:playTables.length,normalBoards:boards.length,downloadHashesVerified:hashes,nativeImports};
writeFileSync(`${dir}/validation.json`,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({...output,nativeImports:nativeImports.map(({errors,...rest})=>rest)},null,2));
