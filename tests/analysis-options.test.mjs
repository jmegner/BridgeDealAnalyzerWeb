import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePbn, sourceContractFromTags } from "../src/pbn.js";
import { analyzeBoard, ANALYSIS_VERSION } from "../src/analyze.js";
import { createSolver } from "../src/solver.js";
import { replay, scoreContract } from "../src/bridge.js";
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
