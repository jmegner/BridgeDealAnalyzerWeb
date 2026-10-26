import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePbn, sourceContractFromTags } from "../src/pbn.js";
import { analyzeBoard, ANALYSIS_VERSION } from "../src/analyze.js";
import { createSolver } from "../src/solver.js";
import { replay, scoreContract, initialState, nextSeat, suit } from "../src/bridge.js";
import { detectTechniques } from "../src/techniques.js";
const cases = JSON.parse(
  readFileSync(
    new URL(
      "../reports/technique-benchmark-2026-09-25/case-studies.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const solver = await createSolver();
test.after(() => solver.dispose());

test("PBN contracts preserve strain, declarer and doubles without making missing metadata fatal", () => {
  for (const [contract, trump, doubled] of [
    ["4S", 0, 0],
    ["2hX", 1, 1],
    ["6DXX", 2, 2],
    ["1C", 3, 0],
    ["3NT", 4, 0],
    ["3N", 4, 0],
  ]) {
    assert.deepEqual(
      sourceContractFromTags({ contract, declarer: " e " }).sourceContract,
      { level: Number(contract[0]), trump, doubled, declarer: 1 },
    );
  }
  for (const tags of [
    {},
    { contract: "?" },
    { contract: "Pass" },
    { contract: "8S", declarer: "S" },
    { contract: "4SX", declarer: "?" },
  ]) {
    const parsed = sourceContractFromTags(tags);
    assert.equal(parsed.sourceContract, null);
    assert.match(parsed.sourceContractWarning, /using par/);
  }
  const text = readFileSync(
    new URL("../samples/teaching-hands.pbn", import.meta.url),
    "utf8",
  );
  const b = parsePbn(text).boards[0];
  const pair = parsePbn(
    `[Event "Test"]\n[Board "1"]\n[Deal "${b.tags.deal}"]\n[Contract "4HXX"]\n[Declarer "W"]\n[Event "#"]\n[Board "2"]\n[Deal "#"]\n[Contract "#"]\n[Declarer "#"]`,
  );
  assert.deepEqual(pair.errors, []);
  assert.equal(pair.boards[1].sourceContract.doubled, 2);
  assert.equal(pair.boards[1].sourceContract.declarer, 3);
});

test("Bounded optimal search recovers teaching examples and keeps evidence in one genuine optimal replay", () => {
  for (const id of ["c0538e64d25b", "28d0cafb3727"]) {
    const b = cases.find((x) => x.board.id === id).board;
    const baseline = analyzeBoard(b, solver, () => {}, { maxLines: 1 });
    const progress = [];
    const found = analyzeBoard(b, solver, (p) => progress.push(p.fraction));
    const label = id === "c0538e64d25b" ? "Dummy reversal" : "Crossruff";
    assert.ok(!baseline.findings.some((f) => f.technique === label));
    assert.ok(found.findings.some((f) => f.technique === label));
    assert.equal(found.version, ANALYSIS_VERSION);
    assert.equal(found.search.linesExamined, 12);
    assert.ok(found.search.selectedLine > 1);
    assert.equal(found.search.limit, 12);
    assert.ok(
      progress.every(
        (p, i) => p >= 0 && p <= 1 && (!i || p >= progress[i - 1]),
      ),
    );
    const states = replay(b.hands, found.contract, found.cards);
    assert.equal(states.at(-1).completed.length, 13);
    assert.deepEqual(found.findings, detectTechniques(states));
    solver.reset();
    for (let ply = 0; ply < 52; ply++) {
      const moves = solver.solve(states[ply]);
      assert.equal(
        moves.find((m) => m.card === found.cards[ply]).score,
        Math.max(...moves.map((m) => m.score)),
      );
    }
    assert.equal(found.scoreNS, found.par.score);
  }
});

test("Teaching mode uses the supplied contract and score while preserving the par benchmark", () => {
  const b = {
    ...cases[3].board,
    sourceContract: { level: 6, trump: 0, declarer: 2, doubled: 2 },
  };
  const result = analyzeBoard(b, solver, () => {}, {
    contractMode: "source",
    maxLines: 1,
  });
  assert.deepEqual(result.contract, b.sourceContract);
  assert.equal(result.contractOrigin, "source");
  assert.equal(result.requestedMode, "source");
  assert.equal(result.fallbackReason, null);
  assert.equal(result.tricks, result.table[2]);
  assert.equal(
    result.scoreNS,
    scoreContract(b.sourceContract, result.tricks, b.vulnerable),
  );
  assert.notEqual(result.scoreNS, result.par.score);
  // Source mode also works when the par result has no contract to replay.
  const noPar = { ...solver, par: () => ({ score: 0, contracts: [] }) };
  assert.equal(
    analyzeBoard(b, noPar, () => {}, { maxLines: 1 }).cards.length,
    0,
  );
  assert.equal(
    analyzeBoard(b, noPar, () => {}, { contractMode: "source", maxLines: 1 })
      .cards.length,
    52,
  );
});

test("Missing or malformed source contracts fall back explicitly, and search bounds are enforced", () => {
  const b = {
    ...cases[3].board,
    sourceContract: { level: 8, trump: 9, declarer: 7, doubled: 0 },
  };
  const r = analyzeBoard(b, solver, () => {}, {
    contractMode: "source",
    maxLines: 1,
  });
  assert.equal(r.contractOrigin, "par");
  assert.equal(r.requestedMode, "source");
  assert.match(r.fallbackReason, /using par/);
  assert.equal(r.scoreNS, r.par.score);
  assert.throws(
    () => analyzeBoard(b, solver, () => {}, { contractMode: "typo" }),
    /Unknown contract mode/,
  );
  assert.throws(
    () => analyzeBoard(b, solver, () => {}, { maxLines: 13 }),
    /between 1 and 12/,
  );
});

test("Every lead suit has its own verified result, score and technique replay, including inferior leads", () => {
  const board = parsePbn(readFileSync(new URL("../samples/example-collection.pbn", import.meta.url), "utf8"))
    .boards.find((b) => b.board === "19");
  for (const contractMode of ["par", "source"]) {
    const b = { ...board, sourceContract: { level: 4, trump: 1, declarer: 3, doubled: 2 } };
    const progress = [];
    const result = analyzeBoard(b, solver, (p) => progress.push(p.fraction), { contractMode, maxLines: 1 });
    assert.deepEqual(result.leadAnalyses.map((lead) => lead.suit), [0, 1, 2, 3]);
    assert.ok(result.leadAnalyses.some((lead) => !lead.optimal && lead.tricks > result.tricks));
    assert.ok(progress.every((p, i) => p >= 0 && p <= 1 && (!i || p >= progress[i - 1])));
    for (const lead of result.leadAnalyses) {
      assert.equal(lead.available, true);
      assert.equal(suit(lead.cards[0]), lead.suit);
      const states = replay(b.hands, result.contract, lead.cards);
      assert.equal(states.at(-1).completed.length, 13);
      assert.equal(states.at(-1).won[result.contract.declarer % 2], lead.tricks);
      assert.deepEqual(lead.findings, detectTechniques(states));
      assert.equal(lead.scoreNS, scoreContract(result.contract, lead.tricks, b.vulnerable) * -1);
      assert.equal(lead.optimal, lead.tricks === result.tricks);
      solver.reset();
      for (let ply = 0; ply < 52; ply++) {
        const moves = solver.solve(states[ply]).filter((m) => ply || suit(m.card) === lead.suit);
        const chosen = moves.find((m) => m.card === lead.cards[ply]);
        assert.equal(chosen.score, Math.max(...moves.map((m) => m.score)));
        const defending = nextSeat(states[ply]) % 2 !== result.contract.declarer % 2;
        const total = states[ply].won[result.contract.declarer % 2] +
          (defending ? 13 - states[ply].completed.length - chosen.score : chosen.score);
        assert.equal(total, lead.tricks);
      }
    }
  }
});

test("Void lead suits are unavailable, and passed-out boards have no lead replays", () => {
  const b = {
    hands: [0, 1, 2, 3].map((s) => Array.from({ length: 13 }, (_, r) => s * 13 + r)),
    dealer: 0, vulnerable: 0,
    sourceContract: { level: 1, trump: 4, declarer: 0, doubled: 0 },
  };
  const result = analyzeBoard(b, solver, () => {}, { contractMode: "source", maxLines: 1 });
  assert.deepEqual(result.leadAnalyses.filter((lead) => !lead.available),
    [0, 2, 3].map((suit) => ({ suit, available: false })));
  assert.equal(result.leadAnalyses[1].cards.length, 52);
  const noPar = { ...solver, par: () => ({ score: 0, contracts: [] }) };
  assert.deepEqual(analyzeBoard(b, noPar).leadAnalyses, []);
});
