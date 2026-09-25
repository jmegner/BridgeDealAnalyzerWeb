import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSolver } from "../src/solver.js";
import { parsePbn } from "../src/pbn.js";
import { analyzeBoard } from "../src/analyze.js";
import { replay, nextSeat } from "../src/bridge.js";
const solver = await createSolver();
const boards = parsePbn(
  readFileSync(
    new URL("../samples/teaching-hands.pbn", import.meta.url),
    "utf8",
  ),
).boards;

test("Real DDS3 WASM calculates a known table value and legal 52-card optimal replays", () => {
  for (const board of boards) {
    const result = analyzeBoard(board, solver);
    assert.equal(result.cards.length, 52);
    assert.equal(new Set(result.cards).size, 52);
    assert.equal(result.table.length, 20);
    const states = replay(board.hands, result.contract, result.cards);
    assert.equal(states.at(-1).completed.length, 13);
    assert.equal(
      result.tricks,
      result.table[result.contract.trump * 4 + result.contract.declarer],
    );
    // Independent solves with a fresh TT verify every chosen card, including the last trick.
    solver.reset();
    for (let i = 0; i < 52; i++) {
      const moves = solver.solve(states[i]);
      const chosen = moves.find((m) => m.card === result.cards[i]);
      assert.ok(chosen);
      assert.equal(chosen.score, Math.max(...moves.map((m) => m.score)));
      const declTotal =
        states[i].won[result.contract.declarer % 2] +
        (nextSeat(states[i]) % 2 === result.contract.declarer % 2
          ? chosen.score
          : 13 - states[i].completed.length - chosen.score);
      assert.equal(declTotal, result.tricks);
    }
    if (board.board === "4") assert.equal(result.table[1 * 4 + 2], 13);
  }
});
test("Dealer par accounts for doubled sacrifices and passed-out boards", () => {
  const table = Array(20).fill(0);
  table[0] = 10;
  table[2] = 10; // NS can make 4S
  table[13] = 10;
  table[15] = 10; // EW can take 10 tricks in clubs
  const par = solver.par(table, 0, 0);
  assert.equal(par.score, 100);
  assert.ok(
    par.contracts.some(
      (c) => c.level === 5 && c.trump === 3 && c.doubled === 1,
    ),
  );
  const passed = solver.par(Array(20).fill(6), 0, 0);
  assert.equal(passed.score, 0);
  assert.deepEqual(passed.contracts, []);
});
test("Complete generated deals demonstrate all five techniques with genuine optimal play", () => {
  const examples = parsePbn(
    readFileSync(
      new URL("../samples/example-collection.pbn", import.meta.url),
      "utf8",
    ),
  ).boards;
  const expected = {
    338: "Squeeze",
    19: "Elimination / endplay",
    318: "Trump coup",
    8: "Crossruff",
    3: "Dummy reversal",
  };
  const reference = new Map();
  for (const board of examples) {
    const result = analyzeBoard(board, solver);
    assert.ok(
      result.findings.some((f) => f.technique === expected[board.board]),
      `${board.board} should demonstrate ${expected[board.board]}`,
    );
    for (const finding of result.findings) {
      assert.ok(
        finding.start >= 0 && finding.end <= 52 && finding.start < finding.end,
      );
      assert.ok(finding.evidence.every((e) => e.ply >= 0 && e.ply < 52));
    }
    reference.set(board.board, result.cards);
  }
  // Reordered batches must not change the chosen line through stale solver state.
  for (const board of examples.toReversed())
    assert.deepEqual(
      analyzeBoard(board, solver).cards,
      reference.get(board.board),
    );
});
