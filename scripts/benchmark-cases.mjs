// Export five verified examples of a miss caused by choosing another optimal line.
import {readFileSync,writeFileSync} from 'node:fs';
import {initialState,nextSeat,playCard,RANKS} from '../src/bridge.js';
const dir='reports/technique-benchmark-2026-09-25';
const boards=JSON.parse(readFileSync(`${dir}/corpus.json`,'utf8'));
const results=new Map(readFileSync(`${dir}/results.ndjson`,'utf8').trim().split('\n').map(s=>{const r=JSON.parse(s);return[r.id,r]}));
const ids=['d2a507e58415','54e40ab9da30','8a47b4f181cd','c0538e64d25b','28d0cafb3727'];
const cases=[];let pbn='% PBN 2.1\n% Each deal appears twice: normal line and a different DD-optimal continuation.\n';
for(const id of ids){
 const b=boards.find(x=>x.id===id),r=results.get(id);cases.push({board:b,normal:r.normal,alternative:r.source});
 for(const mode of ['normal','source']){
  const line=r[mode],c=line.contract,first=(c.declarer+1)%4;
  const deal='N:'+b.hands.map(h=>Array.from({length:4},(_,s)=>[...h].sort((a,b)=>b-a).filter(c=>Math.floor(c/13)===s).map(c=>RANKS[c%13]).join('')).join('.')).join(' ');
  const tags={Event:mode==='normal'?'Normal app line':'Alternative DD-optimal line',Site:b.url,Date:'????.??.??',Board:b.benchmarkBoard,Dealer:'NESW'[b.dealer],Vulnerable:['None','All','NS','EW'][b.vulnerable],Deal:deal,Declarer:'NESW'[c.declarer],Contract:`${c.level}${['S','H','D','C','NT'][c.trump]}${'X'.repeat(c.doubled||0)}`,Result:line.tricks,BenchmarkID:id,Play:'NESW'[first]};
  pbn+='\n'+Object.entries(tags).map(([k,v])=>`[${k} "${String(v).replaceAll('\\','\\\\').replaceAll('"','\\"')}"]`).join('\n')+'\n';
  let state=initialState(b.hands,c.trump,c.declarer);
  for(let trick=0;trick<13;trick++){
   const row=[];
   for(let j=0;j<4;j++){
    const card=line.cards[trick*4+j],seat=nextSeat(state);row[(seat-first+4)%4]='SHDC'[Math.floor(card/13)]+RANKS[card%13];state=playCard(state,card);
   }
   pbn+=row.join(' ')+'\n';
  }
  pbn+='*\n';
 }
}
writeFileSync(`${dir}/case-studies.pbn`,pbn);
writeFileSync(`${dir}/case-studies.json`,JSON.stringify(cases,null,2)+'\n');
console.log(`Exported ${cases.length} paired optimal-line examples.`);
