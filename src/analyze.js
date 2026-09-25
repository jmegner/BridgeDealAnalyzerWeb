import {
  initialState,
  nextSeat,
  playCard,
  scoreContract,
  holding,
  rank,
} from "./bridge.js";
import { detectTechniques } from "./techniques.js";

export const ANALYSIS_VERSION = 1;
export function analyzeBoard(board, solver, onProgress = () => {}) {
  const started = performance.now();
  onProgress({ phase: "Calculating the double-dummy table", fraction: 0 });
  const table = solver.table(board.hands);
  const par = solver.par(table, board.dealer, board.vulnerable);
  // A stable representative is sufficient for finding examples. Retain all par alternatives for display.
  // Prefer the longer trump hand as declarer when either partner can play at par.
  // This keeps "dummy reversal" meaningful instead of arbitrarily swapping the roles.
  const length = (c) =>
    c.trump < 4 ? holding(board.hands, c.declarer, c.trump).length : 0;
  const contract =
    [...par.contracts].sort(
      (a, b) =>
        a.trump - b.trump ||
        length(b) - length(a) ||
        a.declarer - b.declarer ||
        a.level - b.level,
    )[0] ?? null;
  if (!contract)
    return {
      version: ANALYSIS_VERSION,
      table,
      par,
      contract,
      cards: [],
      findings: [],
      tricks: 0,
      milliseconds: performance.now() - started,
    };
  solver.reset();
  let state = initialState(board.hands, contract.trump, contract.declarer);
  const states = [state],
    cards = [],
    expected = table[contract.trump * 4 + contract.declarer];
  for (let ply = 0; ply < 52; ply++) {
    const moves = solver.solve(state);
    if (!moves.length) throw new Error("DDS returned no legal continuation.");
    const remaining = 13 - state.completed.length;
    const total =
      state.won[contract.declarer % 2] +
      (nextSeat(state) % 2 === contract.declarer % 2
        ? moves[0].score
        : remaining - moves[0].score);
    if (total !== expected)
      throw new Error(
        `Optimal-play verification failed at card ${ply + 1}: ${total} tricks, expected ${expected}.`,
      );
    // Retain defensive honors when equally good plays exist. This often leaves
    // the bridge mechanism visible instead of conceding its trick prematurely.
    // Only maximum-score moves are eligible: no defensive cooperation is added.
    const best = moves.filter((m) => m.score === moves[0].score);
    if (nextSeat(state) % 2 !== contract.declarer % 2)
      best.sort(
        (a, b) =>
          rank(a.card) - rank(b.card) || a.order - b.order || a.card - b.card,
      );
    const card = best[0].card;
    cards.push(card);
    state = playCard(state, card);
    states.push(state);
    if (ply % 4 === 3)
      onProgress({
        phase: `Playing trick ${Math.floor(ply / 4) + 1} of 13`,
        fraction: (ply + 1) / 52,
      });
  }
  const tricks = state.won[contract.declarer % 2];
  if (tricks !== expected)
    throw new Error("Replay result disagrees with the double-dummy table.");
  const scoreNS =
    scoreContract(contract, tricks, board.vulnerable) *
    (contract.declarer % 2 ? -1 : 1);
  if (scoreNS !== par.score)
    throw new Error("Replay score disagrees with par.");
  onProgress({ phase: "Identifying techniques", fraction: 1 });
  const findings = detectTechniques(states);
  return {
    version: ANALYSIS_VERSION,
    table,
    par,
    contract,
    cards,
    tricks,
    findings,
    milliseconds: performance.now() - started,
  };
}
