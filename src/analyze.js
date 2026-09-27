import { scoreContract, holding } from "./bridge.js";
import { findOptimalPlay, MAX_SEARCH_LINES } from "./optimal-play.js";
import { validSourceContract } from "./pbn.js";

export const ANALYSIS_VERSION = 2;
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
      tricks: 0,
      milliseconds: performance.now() - started,
    };
  const play = findOptimalPlay(
    board.hands,
    contract,
    table[contract.trump * 4 + contract.declarer],
    solver,
    onProgress,
    options.maxLines,
  );
  const { tricks } = play;
  const scoreNS =
    scoreContract(contract, tricks, board.vulnerable) *
    (contract.declarer % 2 ? -1 : 1);
  if (!useSource && scoreNS !== par.score)
    throw new Error("Replay score disagrees with par.");
  onProgress({ phase: "Identifying techniques", fraction: 1 });
  return {
    version: ANALYSIS_VERSION,
    table,
    par,
    contract,
    ...selection,
    ...play,
    scoreNS,
    milliseconds: performance.now() - started,
  };
}
