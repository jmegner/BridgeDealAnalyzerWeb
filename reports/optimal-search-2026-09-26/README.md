# Bounded optimal-play search and PBN contracts — 26 September 2026

Implemented recommendations 1 and 2 from the [original report](../technique-benchmark-2026-09-25/README.md). The same 412 frozen deals were analyzed in both modes. No detector rules were changed.

The old par workflow retrieved an expected technique on **50 distinct deals**. The new par workflow retrieves one on **100**; checking both contract modes retrieves one on **127**.

| Expected technique | Before: one par line | Now: par mode | Now: PBN-contract mode | Found in either mode |
| --- | ---: | ---: | ---: | ---: |
| Squeeze | 7/172 (4.1%) | 18/172 (10.5%) | 18/172 (10.5%) | 23/172 (13.4%) |
| Elimination / endplay | 4/65 (6.2%) | 9/65 (13.8%) | 8/65 (12.3%) | 12/65 (18.5%) |
| Trump coup | 5/63 (7.9%) | 12/63 (19.0%) | 17/63 (27.0%) | 17/63 (27.0%) |
| Dummy reversal | 9/52 (17.3%) | 15/52 (28.8%) | 22/52 (42.3%) | 24/52 (46.2%) |
| Crossruff | 25/62 (40.3%) | 46/62 (74.2%) | 42/62 (67.7%) | 51/62 (82.3%) |

“Either mode” is the union across two separately saved replays. It is not a claim that all findings appear in one line, or that a single analysis in the UI automatically searches both contracts. Choose each mode and analyze it to obtain both results.

As before, these are retrieval rates on source-labelled positives, not overall detector accuracy. The squeeze denominator includes 131 book/chapter-level labels and 41 individually annotated examples. On the 41 individual examples, the new par mode finds 9 and PBN mode finds 6. The original assumptions, duplicate exclusions and source-label limitations remain unchanged; see the [original corpus](../technique-benchmark-2026-09-25/corpus.json).

## What changed

- **Bounded search:** up to 12 complete optimal continuations per contract. Trials vary optimal opening leads and declarer preferences for ruffing, shortening, cashing side suits, and tie choices. All moves must preserve the DDS optimum. The first trial uses the old selection policy.
- **One useful replay:** prefer more distinct technique types, while retaining the types found in the first trial. Ties keep the earlier trial. Evidence is never merged across replays. The trial count and selected line appear in the details and export.
- **PBN contracts:** the collection's “Contract to study” selector offers par (default) and the PBN Contract/Declarer. Missing, invalid and passed-out PBN contracts fall back explicitly to par. Doubled and redoubled contracts are supported. Source-contract scores are displayed separately from the par benchmark.
- **Saved modes:** par and PBN replays are cached separately, survive reload, and are both exported. Different source contracts for the same cards are retained as separate study records. Older analysis versions are queued for reanalysis.

Par selection and the technique recognition rules are unchanged. PBN mode still generates double-dummy optimal play; it does not follow the source's recorded Play tags. Some teaching maneuvers need imperfect defense or different continuations and will still be missed. The search trades additional CPU work for improved retrieval; Stop/Skip and the existing per-hand timeout remain available.

## Validation

All 412 boards completed both modes without errors: **824 selected replays** and **9888 trial continuations**, including repeated lines. Every trial was checked for optimal trick count card by card during analysis. The saved replays were independently replayed for legality, trick totals, score, and technique evidence. All old par results and all originally detected technique families were preserved, including families not listed in the source label. See [validation.json](validation.json).

Node tests cover contract parsing/inheritance, missing and invalid metadata, non-par scores, source play with passed-out par, the search bound, two recovered misses, and independent DDS checks of selected cards. Browser tests exercise both caches through reload/export, fallback messages, distinct source contracts, desktop/mobile layout, stop/resume and the real WASM solver on the built GitHub Pages subpath.

## Reproduce

From the repository root:

```powershell
node scripts/benchmark-search.mjs .build/optimal-search-v2/rerun.ndjson
node scripts/benchmark-search-report.mjs .build/optimal-search-v2/rerun.ndjson
```

Use a new output path after code or input changes. The runner fingerprints inputs/code, uses three independent solver workers, and permits 180 seconds per board for both modes together. The report generator verifies all results before writing the comparison files. [Board-level CSV](board-results.csv), [full plays and evidence](results.ndjson), [summary data](summary.json), and [runner metadata](runner-manifest.json) are included.
