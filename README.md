# Bridge Study

A static bridge hand browser for finding examples of play techniques in batches of PBN files. Inspired by [Dan Egner's proposal](https://bridgewinners.com/article/view/what-software-tells-of-play-techniques/).

Import complete deals, calculate dealer par (including sacrifices and vulnerability), then study one deterministic line of optimal play per board. Filter by technique or suit and jump to the relevant play. Files and analysis stay on the user's device.

## Run locally

Requires Node.js 22 or later:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4173/BridgeDealAnalyzerWeb/**. The checked-in DDS3 WASM binary is ready to use; a C++ compiler is **not** needed to run or deploy the app. Opening `index.html` directly with `file://` will not work with module workers; use the local server.

## Host on GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. Run the **Test and deploy to GitHub Pages** workflow, or push a commit to `main`.

The workflow tests and packages the app, then deploys `dist/`. For this repository the expected address is `https://jmegner.github.io/BridgeDealAnalyzerWeb/`.

All asset paths are relative, so other repository names and custom domains work too. The solver is single-threaded WASM inside a Web Worker: **no backend, SharedArrayBuffer, COOP/COEP headers, service worker, API key, runtime CDN, or framework is required**. Boards are processed sequentially to cap memory usage. The browser remains responsive and Stop terminates the worker immediately.

Alternatively, publish `main` / root using GitHub Pages' branch source; `.nojekyll` and the prebuilt solver are included. Or run `npm run build` and upload the contents of `dist/` to any static HTTPS host.

## Using the collection

- Choose or drop multiple `.pbn` files, then choose **Analyze hands**. The sample button imports and analyzes a small collection.
- Every board must contain four complete hands (52 unique cards). Malformed records are reported without dropping valid records from the same file. Unknown hands and partial deals are not supported.
- `[Dealer]` and `[Vulnerable]` determine par. When omitted, a positive numeric `[Board]` permits standard board-cycle inference, shown as a warning. Unknown metadata without a usable board number is rejected.
- Standard tag comments, rotated `Deal` hands, empty/`-` void suits, `T` for ten, and `#` tag inheritance are supported. Existing auction, result and play tags do not constrain the new analysis.
- Duplicate card distributions with the same dealer and vulnerability are skipped, even across files.
- Filter by technique/suit or text search. Click a technique or evidence step to jump to the critical position. The slider, arrow buttons and autoplay replay all 52 cards; arrow keys and space work when a form control does not have focus.
- Results are saved in IndexedDB in the same browser and origin. Clearing site data removes them. **Export results** downloads a JSON archive containing deals, par, play, and findings. This version does not import JSON archives; original PBNs can always be reanalyzed.
- **Stop** preserves completed hands; **Analyze** resumes unfinished/error hands. **Skip this hand** moves past a slow board. A 3-minute per-board limit prevents one difficult deal from blocking the batch indefinitely.

## Meaning of the results

DDS3 calculates the 20 trick counts and `DealerParBin` supplies the par score and contract alternatives. One contract is selected deterministically: strain order S/H/D/C/NT, then the longer trump hand as declarer, compass order, and level. All par alternatives remain visible.

For each play, DDS evaluates legal moves and the app selects one with the optimal trick count. Among equally good defensive moves it prefers lower cards, often preserving guards until the technique becomes visible. Declarer follows DDS's ordering, taking the lowest equivalent card. **No defender is allowed to give away a trick to produce a technique.** The resulting replay is checked against the table and par score.

The recognition layer contains conservative pattern detectors for:

- Simple cashing squeezes, including simple length guards, with threatened suits and the promoted winner.
- Elimination and throw-in endings, with cleared suits and a forced ruff-and-discard or lead into a tenace.
- Direct trump-coup endings, noting earlier shortening when present.
- Dummy reversals where declarer ruffs, dummy becomes longer, and dummy draws a remaining defensive trump.
- Repeated crossruffs adding trump tricks beyond the original longer holding.

These are **examples in the recorded line, not claims of necessity or exhaustive detection**. Pattern recognition is separate from DDS's exact trick calculations. Complex variants, other contracts and other optimal lines can be missed. Use the evidence and replay to review a finding. A sacrifice can contain an interesting technique even though the contract goes down. Passed-out par deals have no replay.

See [the detector specification](docs/detection.md) for coverage and limitations.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

Node tests exercise parsing, scoring, legal play, real WASM solving, par sacrifices, card-by-card optimality, and positive/negative detector fixtures. Browser tests use the actual solver at a project subpath without cross-origin isolation and cover upload, malformed files, deduplication, filters, replay, persistence, export, mobile layout and stop/resume. CI tests the packaged `dist/` site.

`node scripts/inspect-samples.mjs [file.pbn]` prints computed contracts, findings and play for development. `node scripts/find-examples.mjs 1000` explores a repeatable generated corpus and writes newly discovered examples to ignored `.build/`.

## Rebuilding the solver

DDS source is pinned to `84b061ead1bfc636517e371b18d63034966df1b3` (DDS3). Emscripten is pinned to **5.0.7**. See `vendor/dds/version.json`.

```sh
git clone --depth 1 https://github.com/emscripten-core/emsdk.git .build/emsdk
python .build/emsdk/emsdk.py install 5.0.7
python .build/emsdk/emsdk.py activate 5.0.7
python scripts/build_wasm.py
```

The Python script fetches the pinned DDS revision, compiles unmodified DDS sources plus `wasm/bridge.cpp`, and writes `vendor/dds/dds.js` and `dds.wasm`. Select an existing Emscripten installation with `EMXX`. Windows uses `em++.bat`. Build dependencies live in ignored `.build/`. The **Rebuild DDS3 WebAssembly** workflow provides the same build on Linux and uploads artifacts for review; it does not commit or publish them.

Check in rebuilt solver artifacts together after tests pass. Bump `ANALYSIS_VERSION` in `src/analyze.js` when changes should invalidate saved results.

## Project layout

```text
index.html, styles.css       Static interface
src/app.js, storage.js       Collection, replay, IndexedDB
src/pbn.js, bridge.js        PBN parsing, cards, legal play, scoring
src/worker.js, solver.js     Worker and WASM boundary
src/analyze.js               Par selection and optimal line generation
src/techniques.js            Evidence-producing pattern detectors
wasm/bridge.cpp              Small C ABI for DDS3
vendor/dds/                  Prebuilt solver, version and license
samples/                    Complete example PBN deals
tests/                      Domain, WASM integration and browser tests
```

DDS is by Bo Haglund, Søren Hein and the [DDS contributors](https://github.com/dds-bridge/dds), distributed under [Apache 2.0](vendor/dds/LICENSE). The default `samples/example-collection.pbn` contains generated deals covering all five technique filters. Additional ACBL teaching-deal data in `samples/teaching-hands.pbn` credits Brian Gunnell and links each original lesson; generated play and explanations are produced by this app.
