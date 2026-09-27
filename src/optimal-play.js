import {
  initialState,
  nextSeat,
  playCard,
  holding,
  rank,
  suit,
  partner,
} from "./bridge.js";
import { detectTechniques } from "./techniques.js";

export const MAX_SEARCH_LINES = 12;

function baselineOrder(a, b, defending) {
  return (
    (defending ? rank(a.card) - rank(b.card) : 0) ||
    a.order - b.order ||
    rank(a.card) - rank(b.card) ||
    a.card - b.card
  );
}

// Move preferences guide a bounded search; DDS decides which moves are eligible.
function preference(state, card, style) {
  const seat = nextSeat(state),
    other = partner(seat),
    trump = state.trump;
  const strain = suit(card),
    leading = state.trick.length === 0;
  const ruffing =
    !leading && suit(state.trick[0].card) !== trump && strain === trump;
  if (style === "cash") return (strain !== trump ? 20 : 0) + rank(card);
  if (style === "ruff" || style === "declarer" || style === "dummy") {
    const target =
      style === "declarer" ? state.declarer : partner(state.declarer);
    const targetRuff = style === "ruff" || seat === target;
    const canRuff =
      leading &&
      strain !== trump &&
      !holding(state.hands, other, strain).length &&
      holding(state.hands, other, trump).length;
    return (
      (ruffing && targetRuff ? 80 : 0) +
      (canRuff && (style === "ruff" || other === target) ? 60 : 0) +
      (leading && strain !== trump ? 20 : 0) -
      rank(card) / 20
    );
  }
  return 0;
}

function noise(seed, ply, card) {
  let n =
    Math.imul(seed ^ (ply + 1), 0x45d9f3b) ^ Math.imul(card + 1, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function findOptimalPlay(
  hands,
  contract,
  expected,
  solver,
  onProgress,
  maxLines = MAX_SEARCH_LINES,
) {
  if (
    !Number.isInteger(maxLines) ||
    maxLines < 1 ||
    maxLines > MAX_SEARCH_LINES
  )
    throw new Error(
      `Search must examine between 1 and ${MAX_SEARCH_LINES} lines.`,
    );
  const styles = [
    "baseline",
    "baseline",
    "baseline",
    "baseline",
    "ruff",
    "declarer",
    "dummy",
    "cash",
    "random",
    "ruff",
    "declarer",
    "cash",
  ];
  const seed = hands.reduce(
    (n, h, seat) =>
      h.reduce((n, c) => (n + Math.imul(c + 1, (seat + 1) * 7919)) >>> 0, n),
    0,
  );
  let selected,
    baselineTechniques,
    openingMoves = [],
    selectedLine = 1;
  const distinct = new Set();
  for (let line = 0; line < maxLines; line++) {
    solver.reset();
    let state = initialState(hands, contract.trump, contract.declarer);
    const states = [state],
      cards = [];
    for (let ply = 0; ply < 52; ply++) {
      const moves = solver.solve(state);
      if (!moves.length) throw new Error("DDS returned no legal continuation.");
      const bestScore = Math.max(...moves.map((m) => m.score));
      const defending = nextSeat(state) % 2 !== contract.declarer % 2;
      const total =
        state.won[contract.declarer % 2] +
        (defending ? 13 - state.completed.length - bestScore : bestScore);
      if (total !== expected)
        throw new Error(
          `Optimal-play verification failed at card ${ply + 1}: ${total} tricks, expected ${expected}.`,
        );
      const best = moves
        .filter((m) => m.score === bestScore)
        .sort((a, b) => baselineOrder(a, b, defending));
      if (line === 0 && ply === 0) {
        // Equivalent ranks do not consume the opening-lead exploration budget.
        openingMoves = best
          .filter((m, i) => best.findIndex((n) => n.order === m.order) === i)
          .map((m) => m.card);
      }
      let card;
      if (ply === 0) {
        const index = line < 4 ? line : line >= 8 ? line - 4 : 0;
        card = openingMoves[index % openingMoves.length];
      } else {
        if (!defending && line >= 4)
          best.sort(
            (a, b) =>
              preference(state, b.card, styles[line]) -
                preference(state, a.card, styles[line]) ||
              (line >= 8
                ? noise(seed + line, ply, a.card) -
                  noise(seed + line, ply, b.card)
                : 0) ||
              baselineOrder(a, b, false),
          );
        card = best[0].card;
      }
      // An opening lead chosen in another trial must still be optimal here.
      if (!best.some((m) => m.card === card))
        throw new Error("Search selected a non-optimal move.");
      state = playCard(state, card);
      cards.push(card);
      states.push(state);
      if (ply % 4 === 3)
        onProgress({
          phase: `Exploring optimal line ${line + 1} of ${maxLines} · trick ${Math.floor(ply / 4) + 1}`,
          fraction: (line + (ply + 1) / 52) / maxLines,
        });
    }
    const tricks = state.won[contract.declarer % 2];
    if (tricks !== expected)
      throw new Error("Replay result disagrees with the double-dummy table.");
    const key = cards.join(",");
    if (distinct.has(key)) continue;
    distinct.add(key);
    const findings = detectTechniques(states),
      types = new Set(findings.map((f) => f.technique));
    if (!selected) {
      selected = { cards, tricks, findings };
      baselineTechniques = types;
    }
    // Keep every technique present in the old single-line result. All displayed
    // findings must belong to this one replay; never merge evidence across lines.
    else if (
      [...baselineTechniques].every((t) => types.has(t)) &&
      types.size > new Set(selected.findings.map((f) => f.technique)).size
    ) {
      selected = { cards, tricks, findings };
      selectedLine = line + 1;
    }
  }
  return {
    ...selected,
    search: {
      linesExamined: maxLines,
      distinctLines: distinct.size,
      selectedLine,
      limit: MAX_SEARCH_LINES,
    },
  };
}
