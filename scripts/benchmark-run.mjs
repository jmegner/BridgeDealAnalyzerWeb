// Reproducible benchmark of the unmodified app. One WASM instance per worker.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync, globSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { createSolver } from '../src/solver.js';
import { analyzeBoard } from '../src/analyze.js';
import { initialState, nextSeat, playCard, rank, legalCards } from '../src/bridge.js';
import { detectTechniques } from '../src/techniques.js';

function line(board, contract, solver, prefix = []) {
  solver.reset();
  let state = initialState(board.hands, contract.trump, contract.declarer);
  const states = [state], cards = [], concessions = [];
  for (let ply = 0; ply < 52; ply++) {
    const moves = solver.solve(state);
    const best = moves.filter(m => m.score === moves[0].score);
    if (nextSeat(state) % 2 !== contract.declarer % 2)
      best.sort((a,b) => rank(a.card)-rank(b.card) || a.order-b.order || a.card-b.card);
    const card = prefix[ply] ?? best[0].card;
    if (!legalCards(state).includes(card)) throw new Error(`Illegal source card at ply ${ply+1}`);
    // Absence from the best moves means a recorded choice loses DD value.
    if (!best.some(m => m.card === card)) concessions.push({ply:ply+1, seat:nextSeat(state), card});
    cards.push(card); state = playCard(state,card); states.push(state);
  }
  return {contract,cards,tricks:state.won[contract.declarer%2],findings:detectTechniques(states),concessions,prefixLength:prefix.length};
}

if (!isMainThread) {
  const solver = await createSolver();
  parentPort.on('message', board => {
    const started = performance.now();
    const out = {id:board.id,key:board.key};
    try { out.normal = analyzeBoard(board,solver); } catch(e) { out.error = e.message; }
    if (board.contract) {
      try { out.published = line(board,board.contract,solver); } catch(e) { out.publishedError=e.message; }
      if (board.play?.length) {
        try { out.source = line(board,board.contract,solver,board.play); } catch(e) { out.sourceError=e.message; }
      }
    }
    out.elapsed = performance.now()-started;
    parentPort.postMessage(out);
  });
} else {
  const input = process.argv[2] || '.build/technique-benchmark/selected.json';
  const output = process.argv[3] || '.build/technique-benchmark/results.ndjson';
  const boards = JSON.parse(readFileSync(input,'utf8'));
  const hash = createHash('sha256').update(readFileSync(input));
  for (const path of [...globSync('src/*.js'),...globSync('vendor/**/*.{js,wasm}'),'scripts/benchmark-run.mjs'].sort())
    hash.update(path).update(readFileSync(path));
  const fingerprint=hash.digest('hex'), manifest=output+'.manifest.json';
  if (existsSync(output) && (!existsSync(manifest) || JSON.parse(readFileSync(manifest,'utf8')).fingerprint!==fingerprint))
    throw new Error('Output belongs to different or unverified inputs/code. Choose a fresh output path.');
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(manifest,JSON.stringify({input,fingerprint,started:new Date().toISOString(),node:process.version},null,2));
  const done = new Set(existsSync(output) ? readFileSync(output,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s).id) : []);
  const queue = boards.filter(b=>!done.has(b.id)); let completed=0;
  console.log(JSON.stringify({input,total:boards.length,cached:done.size,pending:queue.length}));
  await Promise.all(Array.from({length:Math.min(3,queue.length)},()=>new Promise(resolve=>{
    let worker, timer, current;
    const start = () => {
      worker = new Worker(new URL(import.meta.url));
      worker.on('message',result=>{ clearTimeout(timer); appendFileSync(output,JSON.stringify(result)+'\n'); completed++;
        console.log(JSON.stringify({completed,id:result.id,ms:Math.round(result.elapsed),findings:result.normal?.findings.map(f=>f.technique),error:result.error})); next(); });
      worker.on('error',error=>{ clearTimeout(timer); appendFileSync(output,JSON.stringify({id:current.id,key:current.key,error:error.message})+'\n'); start(); });
      next();
    };
    const next = () => {
      current=queue.shift();
      if (!current) { worker.terminate(); resolve(); return; }
      worker.postMessage(current);
      timer=setTimeout(async()=>{ const failed=current; await worker.terminate(); appendFileSync(output,JSON.stringify({id:failed.id,key:failed.key,error:'180 second timeout'})+'\n'); console.log(JSON.stringify({timeout:failed.id})); start(); },180000);
    };
    start();
  })));
}
