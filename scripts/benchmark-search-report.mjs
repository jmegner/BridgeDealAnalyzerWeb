// Verify the selected replays and publish the v2 comparison without changing v1 data.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { replay, scoreContract, TECHNIQUES } from "../src/bridge.js";
import { detectTechniques } from "../src/techniques.js";

const input = process.argv[2] || ".build/optimal-search-v2/results.ndjson";
const base = "reports/technique-benchmark-2026-09-25",
  out = "reports/optimal-search-2026-09-26";
const boards = JSON.parse(readFileSync(`${base}/corpus.json`, "utf8"));
const readResults = (path) =>
  new Map(
    readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((s) => {
        const r = JSON.parse(s);
        return [r.id, r];
      }),
  );
const old = readResults(`${base}/results.ndjson`),
  results = readResults(input);
assert.equal(results.size, boards.length);
const hit = (r, t) => r.findings.some((f) => f.technique === t);
let trials = 0,
  replays = 0;
for (const b of boards) {
  const r = results.get(b.id),
    previous = old.get(b.id);
  assert.ok(!r.error, `${b.id}: ${r.error}`);
  assert.equal(r.key, b.key);
  assert.deepEqual(r.par.par, previous.normal.par);
  assert.deepEqual(r.par.contract, previous.normal.contract);
  assert.deepEqual(r.source.contract, b.contract);
  for (const mode of ["par", "source"]) {
    const a = r[mode];
    assert.equal(a.version, 2);
    assert.equal(a.requestedMode, mode);
    assert.equal(a.contractOrigin, mode);
    assert.equal(a.search.linesExamined, 12);
    assert.ok(a.search.distinctLines >= 1 && a.search.distinctLines <= 12);
    assert.ok(a.search.selectedLine >= 1 && a.search.selectedLine <= 12);
    assert.equal(a.cards.length, 52);
    assert.equal(new Set(a.cards).size, 52);
    const states = replay(b.hands, a.contract, a.cards),
      last = states.at(-1);
    assert.equal(last.completed.length, 13);
    assert.equal(last.won[a.contract.declarer % 2], a.tricks);
    assert.equal(a.tricks, a.table[a.contract.trump * 4 + a.contract.declarer]);
    assert.equal(
      a.scoreNS,
      scoreContract(a.contract, a.tricks, b.vulnerable) *
        (a.contract.declarer % 2 ? -1 : 1),
    );
    assert.deepEqual(a.table, previous.normal.table);
    assert.deepEqual(a.par, previous.normal.par);
    if (mode === "par") assert.equal(a.scoreNS, a.par.score);
    assert.deepEqual(a.findings, detectTechniques(states));
    // No originally detected family may disappear, even if it was not a source label.
    for (const f of previous[mode === "par" ? "normal" : "published"].findings)
      assert.ok(hit(a, f.technique), `${b.id}/${mode}: lost ${f.technique}`);
    trials += a.search.linesExamined;
    replays++;
  }
}
mkdirSync(out, { recursive: true });
copyFileSync(input, `${out}/results.ndjson`);
copyFileSync(input + ".manifest.json", `${out}/runner-manifest.json`);
const summary = TECHNIQUES.map((technique) => {
  const bs = boards.filter((b) => b.labels[technique]);
  return {
    technique,
    boards: bs.length,
    before: bs.filter((b) => hit(old.get(b.id).normal, technique)).length,
    par: bs.filter((b) => hit(results.get(b.id).par, technique)).length,
    source: bs.filter((b) => hit(results.get(b.id).source, technique)).length,
    either: bs.filter(
      (b) =>
        hit(results.get(b.id).par, technique) ||
        hit(results.get(b.id).source, technique),
    ).length,
  };
});
const csv = [
  [
    "board",
    "id",
    "technique",
    "before",
    "par",
    "pbn_contract",
    "either",
    "par_selected_line",
    "pbn_selected_line",
    "source_url",
  ],
];
for (const b of boards)
  for (const t of Object.keys(b.labels)) {
    const r = results.get(b.id);
    csv.push([
      b.benchmarkBoard,
      b.id,
      t,
      hit(old.get(b.id).normal, t),
      hit(r.par, t),
      hit(r.source, t),
      hit(r.par, t) || hit(r.source, t),
      r.par.search.selectedLine,
      r.source.search.selectedLine,
      b.url,
    ]);
  }
writeFileSync(
  `${out}/board-results.csv`,
  csv
    .map((row) =>
      row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
    )
    .join("\n") + "\n",
);
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2) + "\n");
const validation = {
  status: "passed",
  boards: boards.length,
  replaysVerified: replays,
  optimalTrialsCheckedDuringAnalysis: trials,
  allOriginalTechniqueFamiliesPreserved: true,
  allParResultsUnchanged: true,
  allEvidenceRecomputedFromSelectedReplay: true,
};
writeFileSync(
  `${out}/validation.json`,
  JSON.stringify(validation, null, 2) + "\n",
);
const cell = (n, d) => `${n}/${d} (${((100 * n) / d).toFixed(1)}%)`;
const table = summary
  .map(
    (s) =>
      `| ${s.technique} | ${cell(s.before, s.boards)} | ${cell(s.par, s.boards)} | ${cell(s.source, s.boards)} | ${cell(s.either, s.boards)} |`,
  )
  .join("\n");
const squeeze = boards.filter((b) => b.labels.Squeeze?.tier === "individual");
const subset = (mode) =>
  squeeze.filter((b) => hit(results.get(b.id)[mode], "Squeeze")).length;
const anyHit = (b, mode) =>
  Object.keys(b.labels).some((t) => hit(results.get(b.id)[mode], t));
const counts = {
  before: boards.filter((b) =>
    Object.keys(b.labels).some((t) => hit(old.get(b.id).normal, t)),
  ).length,
  par: boards.filter((b) => anyHit(b, "par")).length,
  either: boards.filter((b) => anyHit(b, "par") || anyHit(b, "source")).length,
};
writeFileSync(
  `${out}/README.md`,
  `# Bounded optimal-play search and PBN contracts — 26 September 2026

Implemented recommendations 1 and 2 from the [original report](../technique-benchmark-2026-09-25/README.md). The same 412 frozen deals were analyzed in both modes. No detector rules were changed.

The old par workflow retrieved an expected technique on **${counts.before} distinct deals**. The new par workflow retrieves one on **${counts.par}**; checking both contract modes retrieves one on **${counts.either}**.

| Expected technique | Before: one par line | Now: par mode | Now: PBN-contract mode | Found in either mode |
| --- | ---: | ---: | ---: | ---: |
${table}

“Either mode” is the union across two separately saved replays. It is not a claim that all findings appear in one line, or that a single analysis in the UI automatically searches both contracts. Choose each mode and analyze it to obtain both results.

As before, these are retrieval rates on source-labelled positives, not overall detector accuracy. The squeeze denominator includes 131 book/chapter-level labels and 41 individually annotated examples. On the 41 individual examples, the new par mode finds ${subset("par")} and PBN mode finds ${subset("source")}. The original assumptions, duplicate exclusions and source-label limitations remain unchanged; see the [original corpus](../technique-benchmark-2026-09-25/corpus.json).

## What changed

- **Bounded search:** up to 12 complete optimal continuations per contract. Trials vary optimal opening leads and declarer preferences for ruffing, shortening, cashing side suits, and tie choices. All moves must preserve the DDS optimum. The first trial uses the old selection policy.
- **One useful replay:** prefer more distinct technique types, while retaining the types found in the first trial. Ties keep the earlier trial. Evidence is never merged across replays. The trial count and selected line appear in the details and export.
- **PBN contracts:** the collection's “Contract to study” selector offers par (default) and the PBN Contract/Declarer. Missing, invalid and passed-out PBN contracts fall back explicitly to par. Doubled and redoubled contracts are supported. Source-contract scores are displayed separately from the par benchmark.
- **Saved modes:** par and PBN replays are cached separately, survive reload, and are both exported. Different source contracts for the same cards are retained as separate study records. Older analysis versions are queued for reanalysis.

Par selection and the technique recognition rules are unchanged. PBN mode still generates double-dummy optimal play; it does not follow the source's recorded Play tags. Some teaching maneuvers need imperfect defense or different continuations and will still be missed. The search trades additional CPU work for improved retrieval; Stop/Skip and the existing per-hand timeout remain available.

## Validation

All 412 boards completed both modes without errors: **${replays} selected replays** and **${trials} trial continuations**, including repeated lines. Every trial was checked for optimal trick count card by card during analysis. The saved replays were independently replayed for legality, trick totals, score, and technique evidence. All old par results and all originally detected technique families were preserved, including families not listed in the source label. See [validation.json](validation.json).

Node tests cover contract parsing/inheritance, missing and invalid metadata, non-par scores, source play with passed-out par, the search bound, two recovered misses, and independent DDS checks of selected cards. Browser tests exercise both caches through reload/export, fallback messages, distinct source contracts, desktop/mobile layout, stop/resume and the real WASM solver on the built GitHub Pages subpath.

## Reproduce

From the repository root:

\`\`\`powershell
node scripts/benchmark-search.mjs .build/optimal-search-v2/rerun.ndjson
node scripts/benchmark-search-report.mjs .build/optimal-search-v2/rerun.ndjson
\`\`\`

Use a new output path after code or input changes. The runner fingerprints inputs/code, uses three independent solver workers, and permits 180 seconds per board for both modes together. The report generator verifies all results before writing the comparison files. [Board-level CSV](board-results.csv), [full plays and evidence](results.ndjson), [summary data](summary.json), and [runner metadata](runner-manifest.json) are included.
`,
);
console.log(
  JSON.stringify({ summary, validation, distinctDealHits: counts }, null, 2),
);
