# Internet teaching-deal benchmark — 25 September 2026

**The current app finds relatively few of the techniques these sources teach.** Crossruffs do best; squeezes and elimination/endplays do poorly. This is a measure of whether the whole workflow retrieves a useful example, **not an accuracy or false-positive estimate for the detectors alone**.

I collected **412 distinct complete deals**, with at least 50 source-labelled examples in each of the five technique families. Two deals have two expected labels. The app and DDS/WASM were left unchanged at commit `3fd8883e673ed698de85e9cddc7c87faafd7f1aa`, analysis version 1.

## Results

A hit means the app reported the expected technique family somewhere in its chosen line. It need not be the identical maneuver or suits described by the source.

| Expected technique | Distinct deals | Normal app: par contract and one optimal line | Diagnostic: source contract and one optimal line |
| --- | ---: | ---: | ---: |
| Squeeze | 172 | **7 / 172 — 4.1%** | 5 / 172 — 2.9% |
| Elimination / endplay | 65 | **4 / 65 — 6.2%** | 4 / 65 — 6.2% |
| Trump coup | 63 | **5 / 63 — 7.9%** | 9 / 63 — 14.3% |
| Dummy reversal | 52 | **9 / 52 — 17.3%** | 10 / 52 — 19.2% |
| Crossruff | 62 | **25 / 62 — 40.3%** | 26 / 62 — 41.9% |

The diagnostic uses the source's contract/declarer, then the app's usual choice among optimal plays. It does **not** reproduce the author's solution. Contract level and doubling do not change double-dummy card choices for a fixed strain and declarer.

The squeeze pool has two evidence strengths, which should not be conflated:

| Squeeze source labels | Deals | Normal hits | Source-contract hits |
| --- | ---: | ---: | ---: |
| Individual annotated lessons/problems | 41 | 4 — 9.8% | 3 — 7.3% |
| Named squeeze books/chapters | 131 | 3 — 2.3% | 2 — 1.5% |

The second group includes advanced squeeze variants and has weaker labels: inclusion in a squeeze book/chapter does not prove that every deal has a squeeze in optimal play. The other four families use individual source descriptions. I also kept **11 non-material, partial, or explicitly qualified dummy reversals** separately; neither normal analysis nor the source-contract diagnostic labelled any of these as a dummy reversal. They do not pad the 52-example main count.

## What was collected

The downloaded PBN/LIN inventory contains **194 native PBN files and 2,558 LIN files**, yielding 33,077 complete records before deduplication and source-label review. Most tournament records were irrelevant to this test. Public teaching diagrams supplied additional examples.

The final set uses **159 native-PBN deals, 196 converted LIN deals, and 57 converted HTML diagrams**. Thus the request for 50 per technique is met in the supplied normalized PBN packs, **not by finding 50 originally published PBN records for every technique**.

| Technique | Native PBN | Converted LIN | Converted HTML |
| --- | ---: | ---: | ---: |
| Squeeze | 151 | 21 | 0 |
| Elimination / endplay | 0 | 65 | 0 |
| Trump coup | 2 | 35 | 26 |
| Dummy reversal | 1 | 20 | 31 |
| Crossruff | 5 | 57 | 0 |

Principal sources:

- [Jean-Marc Mollimard's PBN library](https://www.jmmollimard.fr/facemort/wbridge2.php): named squeeze collections, including Romanet.
- [Sackab's bridge-program resources](https://www.sackab.fi/data/htmlfiles/KGBprograms.html): the Ottlik/Kelsey *Adventures in Card Play* PBN chapters.
- [aaBridge](https://github.com/RogerPf/aaBridge/tree/33d53be8d17429787d43b6ad8a9e9a0edb5ecc65): Angel Blue, Hondo717, Watson and other annotated teaching collections. This supplied most individual endplay and crossruff examples. The commit is pinned.
- [Bridge Classroom's PBN collection](https://github.com/bridge-craftwork/Bridge-Classroom/blob/0d0fd025141a41a5c23ac63ebf6c1104d90f3715/public/data/Squeeze.pbn): 20 annotated Baker squeeze lessons.
- [Aces on Bridge](https://aces.bridgeblogging.com/), [Richard Pavlicek](https://www.rpbridge.net/), and [CSB teaching articles](https://csbnews.org/en/dummy-reversal-2/): published complete diagrams and explanations.
- [MIT's contributed bridge articles](https://web.mit.edu/mitdlbc/www/contrib.html), tournament PBN archives, [Michael Lawrence](https://michaelslawrence.com/play/bidding-more-to-show-less/), and [CompassMate](https://www.compassmate.bridge-centre.org/node/737): further individually described examples.

Every selected record has a source URL, record/diagram number, input-format indicator, download SHA256 and metadata assumptions in [corpus.json](corpus.json). [sources.json](sources.json) records all 167 selected/duplicate-source downloads and retrieval times. Original downloads remain under the ignored `.build/technique-benchmark/raw/` directory; the supplied packs contain factual deals and provenance, without republishing the articles' explanations.

## Selection and limitations

Keyword matches were only a discovery mechanism. I reviewed source descriptions, excluding generic mentions, unsuccessful attempts, examples requiring a card swap, and disputed uses of a name. [review-decisions.json](review-decisions.json) records the accepted labels and 38 explicit label exclusions. Unselected search matches are not a negative test set.

I removed 45 repeated source records and two records matching the app's pre-existing examples. Deduplication treats table rotations and all 24 suit renamings as the same deal. It does not count incomplete endings, generated deals, or artificial rotations toward the quota. Rank/distribution variants actually published by a source remain separate deals. Duplicate-source URLs are retained as aliases. This also means sources are not statistically independent.

Only complete 52-card deals were admitted. Three complete hands in LIN may supply the fourth hand by exact complement. No deal was completed from two hands. One Timm HTML example omitted the spade four and was excluded rather than repaired.

**86 deals have inferred/defaulted dealer or vulnerability**, predominantly LIN lessons with no vulnerability specified. These assumptions are explicit in the corpus and PBN tags. They can change the par contract. On the subset with explicit metadata, normal hits were: squeeze 7/171, endplay 0/13, trump coup 4/47, dummy reversal 9/41, crossruff 22/56. Those subsets are also differently composed; they are not controlled experiments.

Source authors may assume a particular lead, imperfect defense, single-dummy reasoning, or a broader definition than our detector. A missing label therefore is not automatically a detector bug. Likewise, this positive-source collection cannot measure precision, false-positive rates, or prevalence on ordinary tournament deals. The sources and labels were not selected from a random sample, and not every claimed teaching line was independently reconstructed.

## Why examples are missed

**The par contract often changes the exercise.** The normal choice matched the source's strain and exact declarer on only 31/172 squeeze, 24/65 endplay, 31/63 coup, 24/52 reversal and 29/62 crossruff examples. For example, benchmark board 164 teaches a trump coup in 6S by South; the app chooses 6NT by North. A sacrifice can similarly move play to the other side. This follows the app's requested par-contract behavior, but loses teaching opportunities.

**Choosing just one optimal continuation demonstrably loses examples.** Where recorded cards were available, I forced the source's initial sequence, then used normal DDS-optimal continuation. Every forced choice was checked against the current position's best DDS value. Of 217 legal extracted prefixes, 146 preserved double-dummy value at every move; the other 71 included a concession by at least one player. Another 27 prefixes could not be legally replayed and were excluded from this diagnostic. A prefix can be just the opening lead, and a LIN branch can be a trial line; these are not all complete author-approved solutions.

| Technique | DD-optimal prefixes available | Expected tag found after prefix | Normal misses recovered this way |
| --- | ---: | ---: | ---: |
| Squeeze | 13 | 1 | 1 |
| Elimination / endplay | 44 | 5 | 2 |
| Trump coup | 47 | 12 | 10 |
| Dummy reversal | 25 | 12 | 8 |
| Crossruff | 18 | 14 | 7 |

Those recoveries cover **28 distinct deals**. On **15**, strain and exact declarer were already the same as normal analysis: changing the optimal continuation alone recovered the expected tag. This establishes a selection problem on those cases; it does not prove the remaining misses have the same cause.

Five concrete witnesses are saved in [case-studies.pbn](case-studies.pbn), each with both complete legal optimal lines, and [case-studies.json](case-studies.json), including the detector's evidence and source URL:

| Benchmark board | Contract, unchanged between lines | Technique found only in the alternative line |
| --- | --- | --- |
| 334 | 4S South | East is squeezed in diamonds and clubs; the promoted DJ wins later. |
| 129 | 4S South | Spades/diamonds are cleared and West is thrown in for a ruff and discard. |
| 161 | 4H South | East must ruff in front of South in the two-card trump-coup ending. |
| 407 | 7H South | A different optimal opening lead permits a detected dummy reversal. |
| 143 | 2D South | The alternative line wins three ruffs in South and two in North. |

The paired PBN contains standard Play tables for a PBN viewer. Our app currently ignores supplied Play tables and recomputes its own line on import; use the saved JSON/PBN plays to inspect these alternatives.

**The detector definitions are also narrow.** As documented in [detection.md](../../docs/detection.md), the squeeze rule demands an immediate guard release on every discard and later cashing of a promoted card; the endplay rule covers particular exit/tenace shapes; reversal requires dummy subsequently drawing an outstanding defensive trump. Broad book categories, entry endplays, and some perfectly recognizable reversals exceed those rules. The benchmark does not yet isolate a detector-only recall number because most full reference solutions remain unencoded.

## Validation and import behavior

All **412 normal analyses completed**, with no crashes or replay-legality, double-dummy trick-count, or par-score inconsistencies. Across normal, source-contract and successful prefix runs, **1,041 complete replays** passed validation. All six main PBN packs re-import through the actual app parser without errors, preserving all hands, dealer and vulnerability. All 167 stored download hashes were checked. These are consistency checks, not an independent proof of DDS correctness. See [validation.json](validation.json).

A fresh run of all 412 frozen inputs reproduced every contract, card sequence and finding from the initial runs. The ten paired PBN Play tables were also independently read back and matched their saved sequences.

Raw files are less reliable than normalized packs. Of the 15 original PBN files represented in the selected corpus, 13 imported without warnings. `squeeze_wb.PBN` was rejected wholesale for an unclosed comment/tag; the converter recovered complete earlier records into the normalized pack. `Squeeze.pbn` imported all 20 deals but reported an extra missing-deal record because its Board/Event tag order exposes a parser boundary issue. These are reported separately rather than counted as technique misses.

## Recommended next changes

1. **Try a small number of alternative optimal plays and keep a useful witness.** The 15 same-contract recoveries directly support this. We can still present one line per board and avoid exhaustive analysis.
2. **Offer the source contract as a teaching option alongside par.** It helps some coups/reversals and avoids replacing a teaching contract with a sacrifice or notrump contract. Contract choice alone does not solve the low retrieval rates.
3. **Build detector-specific reference lines from this corpus.** Start with the paired witnesses and encode more author solutions. Then distinguish a detector's failure to recognize a shown technique from the play selector's failure to reach it; extend the narrow squeeze/endplay/reversal rules based on those examples.
4. **Improve raw-PBN error recovery and record boundaries.** A malformed comment should not hide recoverable complete boards, and valid tag ordering should not create spurious records.

The benchmark is useful now as a collection for your dad and a repeatable measure for development. The current app's absence of a tag is a weak reason to discard a hand from a teaching search.

## Files and reproduction

- [All 412 deals](all.pbn)
- [172 squeezes](squeeze.pbn), [65 eliminations/endplays](elimination-endplay.pbn), [63 trump coups](trump-coup.pbn), [52 dummy reversals](dummy-reversal.pbn), [62 crossruffs](crossruff.pbn)
- [Board-by-board spreadsheet data](board-results.csv): expected label, hits in each mode, contracts, source links and assumptions.
- [Full analysis results](results.ndjson): contracts, par scores, double-dummy tables, all selected cards and technique evidence.
- [Corpus/provenance](corpus.json), [summary data](summary.json), [run metadata and code hashes](run.json), [broader variants](broader-variants.json).

Run from the repository root with the vendored WASM already present. No server, GitHub token or external analysis service is required:

```powershell
node scripts/benchmark-run.mjs reports/technique-benchmark-2026-09-25/corpus.json .build/technique-benchmark/rerun.ndjson
node scripts/benchmark-verify.mjs
```

The runner uses three workers and a 180-second per-deal limit. It resumes only when the saved input/code fingerprint matches; choose a fresh output filename after changing inputs or code. The verification command checks the published snapshot in this report directory, not an arbitrary rerun file. For a future comparison, join the rerun's `id` to `corpus.json` and compare each expected label with `normal.findings[*].technique`; retain misses in the denominator.

The `benchmark-fetch.py`, `benchmark-ingest.py`, `benchmark-aces.py`, `benchmark-rp.py`, `benchmark-supplement.py` and `benchmark-select.py` scripts preserve the acquisition/conversion/selection process. `source-urls.json` can be passed to the fetcher to reacquire the selected sources. The frozen corpus is the authoritative input for repeating these scores; live pages may change. `benchmark-export.py` generates the packs/data from the working cache, and `benchmark-cases.mjs` exports the paired examples. Source descriptions are reviewed labels, not instructions executed by any script.
