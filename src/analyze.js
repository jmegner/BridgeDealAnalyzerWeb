import { scoreContract, holding, initialState, suit, SUITS } from "./bridge.js";
import { findOptimalPlay, MAX_SEARCH_LINES } from "./optimal-play.js";
import { validSourceContract } from "./pbn.js";

export const ANALYSIS_VERSION = 3;
export function analyzeBoard(
  board,
  solver,
  onProgress = () => {},
  options = {},
) {
  const mode = options.contractMode ?? "par";
  if (!["par", "source"].includes(mode))
    throw new Error("Unknown contract mode.");
  const started = performance.now();
  onProgress({ phase: "Calculating the double-dummy table", fraction: 0 });
  const table = solver.table(board.hands);
  const par = solver.par(table, board.dealer, board.vulnerable);
  // A stable representative is sufficient for finding examples. Retain all par alternatives for display.
  // Prefer the longer trump hand as declarer when either partner can play at par.
  // This keeps "dummy reversal" meaningful instead of arbitrarily swapping the roles.
  const length = (c) =>
    c.trump < 4 ? holding(board.hands, c.declarer, c.trump).length : 0;
  const parContract =
    [...par.contracts].sort(
      (a, b) =>
        a.trump - b.trump ||
        length(b) - length(a) ||
        a.declarer - b.declarer ||
        a.level - b.level,
    )[0] ?? null;
  const useSource =
    mode === "source" && validSourceContract(board.sourceContract);
  const contract = useSource ? { ...board.sourceContract } : parContract;
  const selection = {
    requestedMode: mode,
    contractOrigin: useSource ? "source" : "par",
    fallbackReason:
      mode === "source" && !useSource
        ? board.sourceContractWarning ||
          "No complete PBN contract and declarer supplied; using par."
        : null,
  };
  if (!contract)
    return {
      version: ANALYSIS_VERSION,
      table,
      par,
      contract,
      ...selection,
      scoreNS: 0,
      search: {
        linesExamined: 0,
        distinctLines: 0,
        selectedLine: 0,
        limit: MAX_SEARCH_LINES,
      },
      cards: [],
      findings: [],
      leadAnalyses: [],
      tricks: 0,
      milliseconds: performance.now() - started,
    };
  solver.reset();
  const openingMoves = solver.solve(
    initialState(board.hands, contract.trump, contract.declarer),
  );
  const availableSuits = [0, 1, 2, 3].filter((s) =>
    openingMoves.some((m) => suit(m.card) === s),
  );
  let searchesDone = 0;
  const progress = (label) => (p) =>
    onProgress({
      phase: `${label} · ${p.phase}`,
      fraction: (searchesDone + p.fraction) / availableSuits.length,
    });
  const play = findOptimalPlay(
    board.hands,
    contract,
    table[contract.trump * 4 + contract.declarer],
    solver,
    progress("Best defense"),
    options.maxLines,
  );
  searchesDone++;
  const { tricks } = play;
  const scoreNS =
    scoreContract(contract, tricks, board.vulnerable) *
    (contract.declarer % 2 ? -1 : 1);
  if (!useSource && scoreNS !== par.score)
    throw new Error("Replay score disagrees with par.");
  const leadAnalyses = [0, 1, 2, 3].map((openingSuit) => {
    const moves = openingMoves.filter((m) => suit(m.card) === openingSuit);
    if (!moves.length) return { suit: openingSuit, available: false };
    const expected = 13 - Math.max(...moves.map((m) => m.score));
    let leadPlay;
    if (openingSuit === suit(play.cards[0])) {
      // Reuse the unrestricted search's selected replay for its lead suit.
      leadPlay = play;
      if (expected !== tricks)
        throw new Error("Opening-lead result disagrees with the double-dummy table.");
    } else {
      leadPlay = findOptimalPlay(
        board.hands,
        contract,
        expected,
        solver,
        progress(`${SUITS[openingSuit]} lead`),
        options.maxLines,
        openingSuit,
      );
      searchesDone++;
    }
    return {
      suit: openingSuit,
      available: true,
      optimal: expected === tricks,
      ...leadPlay,
      scoreNS:
        scoreContract(contract, leadPlay.tricks, board.vulnerable) *
        (contract.declarer % 2 ? -1 : 1),
    };
  });
  onProgress({ phase: "Identifying techniques", fraction: 1 });
  return {
    version: ANALYSIS_VERSION,
    table,
    par,
    contract,
    ...selection,
    ...play,
    scoreNS,
    leadAnalyses,
    milliseconds: performance.now() - started,
  };
}
