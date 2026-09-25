import { parsePbn } from "./pbn.js";
import {
  SEATS,
  SHORT_SEATS,
  SUITS,
  SYMBOLS,
  RANKS,
  suit,
  rank,
  cardText,
  contractText,
  resultText,
  replay,
  nextSeat,
  isVulnerable,
} from "./bridge.js";
import { loadCollection, saveHands, clearCollection } from "./storage.js";
import { ANALYSIS_VERSION } from "./analyze.js";

const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const coloredCard = (card) =>
  `<span class="${[1, 2].includes(suit(card)) ? "red" : ""}">${cardText(card)}</span>`;
const vulnerability = ["None", "Both", "N–S", "E–W"];
const signature = (b) =>
  `${b.hands.flat().join(",")}/${b.dealer}/${b.vulnerable}`;
let rows = [],
  selectedId = null,
  states = [],
  ply = 0,
  findingIndex = 0,
  showPlayed = false;
let worker = null,
  busy = false,
  currentId = null,
  timeout,
  batchTotal = 0,
  batchDone = 0,
  playback = null;
let importErrors = [];
const currentRow = () => rows.find((r) => r.id === selectedId);
function preferredFinding(row) {
  const technique = $("technique-filter").value,
    strain = $("suit-filter").value;
  return Math.max(
    0,
    row?.analysis?.findings.findIndex(
      (f) =>
        (!technique || f.technique === technique) &&
        (strain === "" || f.suits.includes(Number(strain))),
    ) ?? 0,
  );
}

function notice(message, warning = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("warning", warning);
  $("notice").hidden = !message;
}
async function persist(changed) {
  try {
    await saveHands(changed);
    $("save-status").textContent = "Saved in this browser";
  } catch {
    $("save-status").textContent = "Could not save — export to keep results";
  }
}
function showErrors() {
  $("import-errors").hidden = !importErrors.length;
  $("error-summary").textContent =
    `${importErrors.length} import ${importErrors.length === 1 ? "issue" : "issues"} · show details`;
  $("error-list").innerHTML = importErrors
    .map((e) => `<li>${escape(e)}</li>`)
    .join("");
}
function filteredRows() {
  const query = $("search").value.trim().toLowerCase(),
    technique = $("technique-filter").value,
    strain = $("suit-filter").value;
  return rows.filter((r) => {
    const findings = r.analysis?.findings || [];
    const searchable =
      `${r.board} ${r.source} ${r.event} ${findings.map((f) => `${f.technique} ${f.title} ${f.suits.map((s) => SUITS[s]).join(" ")}`).join(" ")}`.toLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (technique === "none" && (r.status !== "done" || findings.length))
      return false;
    if (
      technique &&
      technique !== "none" &&
      !findings.some(
        (f) =>
          f.technique === technique &&
          (strain === "" || f.suits.includes(Number(strain))),
      )
    )
      return false;
    if (
      strain !== "" &&
      !findings.some((f) => f.suits.includes(Number(strain)))
    )
      return false;
    return true;
  });
}
function renderLibrary() {
  const visible = filteredRows(),
    previous = selectedId;
  if (!visible.some((r) => r.id === selectedId))
    selectedId = visible[0]?.id ?? null;
  $("board-count").textContent = rows.length;
  $("clear-button").hidden = !rows.length;
  $("clear-button").disabled = busy;
  const completed = rows.filter((r) => r.status === "done").length;
  const pending = rows.filter(
    (r) => r.status === "queued" || r.status === "error",
  ).length;
  $("list-summary").textContent = rows.length
    ? `${visible.length} hands · ${completed} analyzed`
    : "Ready for your first hand";
  $("analyze-button").disabled = busy || !pending;
  $("analyze-button").innerHTML = busy
    ? "Analyzing…"
    : pending
      ? `Analyze ${pending} ${pending === 1 ? "hand" : "hands"} <span aria-hidden="true">→</span>`
      : rows.length
        ? "Analysis complete ✓"
        : 'Analyze hands <span aria-hidden="true">→</span>';
  $("export-button").disabled = !completed;
  $("board-list").innerHTML = visible.length
    ? visible
        .map((r) => {
          const a = r.analysis,
            techniques = [
              ...new Set(a?.findings.map((f) => f.technique) || []),
            ];
          return `<button class="board-item ${r.id === selectedId ? "active" : ""}" data-id="${r.id}" aria-pressed="${r.id === selectedId}">
      <div class="board-item-top"><span class="board-number">Board ${escape(r.board)}</span><span class="board-contract">${a ? escape(contractText(a.contract)) : r.status === "running" ? "◌" : "—"}</span></div>
      <div class="board-source" title="${escape(r.source)}">${escape(r.source)}</div>
      ${
        techniques.length
          ? techniques
              .map(
                (t) =>
                  `<span class="badge ${t === "Squeeze" ? "squeeze" : ""}">${escape(t)}</span>`,
              )
              .join("")
          : `<span class="board-status ${r.status === "error" ? "error" : ""}">${r.status === "done" ? (a.contract ? "No technique identified in this line" : "Passed out at par") : r.status === "running" ? "Analyzing this hand…" : r.status === "error" ? "Analysis interrupted · retry available" : "Ready to analyze"}</span>`
      }
    </button>`;
        })
        .join("")
    : `<div class="list-empty"><span class="list-empty-symbol" aria-hidden="true">♧</span><strong>${rows.length ? "No matching hands" : "A fresh deck of possibilities"}</strong>${rows.length ? "Try a different technique, suit, or search." : "Your imported hands will appear here."}</div>`;
  if (previous !== selectedId) {
    stopPlayback();
    ply = 0;
    findingIndex = preferredFinding(currentRow());
    renderHand();
  }
}
function selectHand(id) {
  stopPlayback();
  selectedId = id;
  ply = 0;
  findingIndex = preferredFinding(currentRow());
  renderLibrary();
  renderHand();
}
function tableMarkup(a) {
  return `<table class="data-table"><caption class="detail-note">Maximum declarer tricks against best defense</caption><thead><tr><th scope="col">Strain</th>${SHORT_SEATS.map((s) => `<th scope="col">${s}</th>`).join("")}</tr></thead><tbody>${[4, 0, 1, 2, 3].map((s) => `<tr><th scope="row" class="${s === 1 || s === 2 ? "red" : ""}">${SYMBOLS[s]}</th>${[0, 1, 2, 3].map((d) => `<td>${a.table[s * 4 + d]}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function renderHand() {
  const row = currentRow();
  $("study-empty").hidden = !!row;
  $("hand-view").hidden = !row;
  if (!row) {
    states = [];
    return;
  }
  if (!row.analysis) {
    states = [];
    $("hand-view").innerHTML =
      `<div class="pending-view"><p class="eyebrow">BOARD ${escape(row.board)}</p><h2>${row.status === "running" ? "Finding the story in this hand…" : row.status === "error" ? "This hand needs another look." : "Your hand is ready."}</h2><p>${row.status === "error" ? escape(row.error) : row.status === "running" ? "Calculating par, playing all 52 cards, and looking for techniques. You can browse completed hands while this runs." : "Choose Analyze hands to find the par contract and explore a line of optimal play."}</p>${row.status === "error" && !busy ? '<button class="button primary" id="retry-hand">Retry this hand →</button>' : ""}</div>`;
    $("retry-hand")?.addEventListener("click", () => startAnalysis(row.id));
    return;
  }
  const a = row.analysis;
  if (!a.contract) {
    states = [];
    $("hand-view").innerHTML =
      `<div class="pending-view"><p class="eyebrow">BOARD ${escape(row.board)}</p><h2>Passed out at par.</h2><p>Neither side can profitably bid. Par is 0, so there is no contract to replay for this board.</p></div><div class="analysis-details"><details open><summary>Double-dummy table</summary>${tableMarkup(a)}</details></div>`;
    return;
  }
  states = replay(row.hands, a.contract, a.cards);
  const techniques = a.findings;
  findingIndex = Math.min(findingIndex, Math.max(0, techniques.length - 1));
  $("hand-view").innerHTML = `
    <div class="hand-heading"><div><p class="eyebrow">ONE OPTIMAL LINE · ALL CARDS KNOWN</p><h2>Board ${escape(row.board)}</h2><small>${escape(row.event || row.source)}</small></div><div class="par-summary"><div class="contract-large">${escape(contractText(a.contract))} <span class="result">${resultText(a.contract, a.tricks)}</span></div><small>Par · N–S ${a.par.score > 0 ? "+" : ""}${a.par.score}</small></div></div>
    <div class="hand-meta"><span>Dealer <strong>${SEATS[row.dealer]}</strong></span><span>Vulnerable <strong>${vulnerability[row.vulnerable]}</strong></span><span>Declarer <strong>${SEATS[a.contract.declarer]}</strong></span><span><strong>${a.tricks}</strong> tricks with best play</span></div>
    ${row.warnings.length ? `<div class="warnings">${row.warnings.map(escape).join(" ")}</div>` : ""}
    <div class="deal-area"><div class="deal-toolbar"><span id="deal-caption">The full deal</span><label><input type="checkbox" id="show-played" ${showPlayed ? "checked" : ""}> Show played cards</label></div><div class="deal-table" id="deal-table"></div><p class="replay-caption" id="replay-caption" aria-live="polite"></p></div>
    <div class="replay-controls"><input type="range" id="play-slider" min="0" max="52" value="${ply}" aria-label="Card position in replay"><div class="replay-buttons"><div class="transport"><button id="first-card" aria-label="Go to beginning" title="Beginning">⇤</button><button id="previous-card" aria-label="Previous card" title="Previous card (←)">←</button><button class="play" id="toggle-play" aria-label="Play replay" title="Play or pause (space)">▶</button><button id="next-card" aria-label="Next card" title="Next card (→)">→</button><button id="last-card" aria-label="Go to end" title="End">⇥</button></div><span class="replay-position" id="replay-position"></span><span class="keyboard-hint">← → to step · space to play</span></div></div>
    <div class="findings"><div class="section-label"><h3>What to look for</h3><small>FOUND IN THIS LINE</small></div>${techniques.length ? `<div class="finding-tabs">${techniques.map((f, i) => `<button class="finding-tab ${i === findingIndex ? "selected" : ""}" data-finding="${i}">${escape(f.technique)}</button>`).join("")}</div><div id="finding-detail" class="finding-detail"></div>` : '<p class="empty-finding">No supported technique identified in this line. Other optimal lines may contain one. You can still step through the play and inspect the double-dummy table.</p>'}</div>
    <div class="analysis-details"><details><summary>Trick-by-trick play</summary><div id="trick-ledger"></div></details><details><summary>Double-dummy table &amp; par</summary>${tableMarkup(a)}<p class="detail-note">Par alternatives: ${a.par.contracts.map((c) => escape(contractText(c))).join(", ")}.<br>One representative contract is replayed. Analysis took ${(a.milliseconds / 1000).toFixed(1)}s.</p></details></div>`;
  $("show-played").addEventListener("change", (e) => {
    showPlayed = e.target.checked;
    renderReplay();
  });
  $("play-slider").addEventListener("input", (e) =>
    seek(Number(e.target.value)),
  );
  $("first-card").addEventListener("click", () => seek(0));
  $("last-card").addEventListener("click", () => seek(52));
  $("previous-card").addEventListener("click", () => seek(ply - 1));
  $("next-card").addEventListener("click", () => seek(ply + 1));
  $("toggle-play").addEventListener("click", togglePlayback);
  renderFinding();
  renderReplay();
}
function renderFinding() {
  const finding = currentRow()?.analysis?.findings[findingIndex];
  if (!finding || !$("finding-detail")) return;
  $("finding-detail").innerHTML =
    `<h4>${escape(finding.title)}</h4><p>${escape(finding.explanation)}</p><div class="evidence-list">${finding.evidence.map((e) => `<button class="evidence-step" data-ply="${e.ply}"><span>TRICK ${Math.floor(e.ply / 4) + 1} ↗</span>${escape(e.text)}</button>`).join("")}</div>`;
  document
    .querySelectorAll("[data-finding]")
    .forEach((b) =>
      b.classList.toggle(
        "selected",
        Number(b.dataset.finding) === findingIndex,
      ),
    );
}
function renderReplay() {
  if (!states.length) return;
  const row = currentRow(),
    a = row.analysis,
    s = states[ply];
  const lastTrick = s.completed.at(-1),
    displayed = s.trick.length ? s.trick : ply > 0 ? lastTrick.plays : [];
  const classes = ["north", "east", "south", "west"];
  const finding = a.findings[findingIndex];
  const next = ply < 52 ? nextSeat(s) : -1;
  $("deal-table").innerHTML =
    [0, 1, 2, 3]
      .map(
        (seat) =>
          `<div class="hand ${classes[seat]} ${next === seat ? "to-play" : ""}"><div class="hand-label">${SEATS[seat]}${isVulnerable(row.vulnerable, seat) ? '<span class="hand-vul" title="Vulnerable"></span>' : ""}${seat === a.contract.declarer ? '<span class="role">DECLARER</span>' : seat === (a.contract.declarer + 2) % 4 ? '<span class="role">DUMMY</span>' : ""}</div>${[
            0, 1, 2, 3,
          ]
            .map((strain) => {
              const cards = (showPlayed ? row.hands : s.hands)[seat]
                .filter((c) => suit(c) === strain)
                .sort((x, y) => rank(y) - rank(x));
              return `<div class="suit-row"><span class="suit-icon ${[1, 2].includes(strain) ? "red" : ""}">${SYMBOLS[strain]}</span><span class="ranks">${cards.length ? cards.map((c) => `<span class="rank ${!s.hands[seat].includes(c) ? "played" : ""} ${ply < 52 && a.cards[ply] === c && finding && ply >= finding.start && ply < finding.end ? "key-card" : ""}" title="${escape(cardText(c))}">${RANKS[c % 13]}</span>`).join("") : '<span class="void">—</span>'}</span></div>`;
            })
            .join("")}</div>`,
      )
      .join("") +
    `<div class="table-center"><span class="compass" aria-hidden="true">N<br>＋<br>S</span>${displayed.map((p) => `<span class="table-card ${classes[p.seat]} ${[1, 2].includes(suit(p.card)) ? "red" : ""}" title="${SEATS[p.seat]}: ${cardText(p.card)}">${cardText(p.card)}</span>`).join("")}</div>`;
  $("deal-caption").textContent =
    ply === 0
      ? "The full deal · red dots mark vulnerability"
      : `Declarer ${s.won[a.contract.declarer % 2]} · Defense ${s.won[1 - (a.contract.declarer % 2)]}`;
  $("replay-caption").textContent =
    ply === 52
      ? `Complete · ${a.tricks} tricks for ${SEATS[a.contract.declarer]}`
      : s.trick.length
        ? `Trick ${s.completed.length + 1} · ${SEATS[next]} to play`
        : ply === 0
          ? `${SEATS[next]} to make the opening lead`
          : `Trick ${s.completed.length} won by ${SEATS[lastTrick.winner]} · ${SEATS[next]} leads next`;
  $("play-slider").value = ply;
  $("replay-position").textContent = `Card ${ply} / 52`;
  $("first-card").disabled = $("previous-card").disabled = ply === 0;
  $("last-card").disabled = $("next-card").disabled = ply === 52;
  $("toggle-play").textContent = playback ? "Ⅱ" : "▶";
  $("toggle-play").setAttribute(
    "aria-label",
    playback ? "Pause replay" : "Play replay",
  );
  const completed = states.at(-1).completed;
  $("trick-ledger").innerHTML =
    `<table class="data-table"><thead><tr><th scope="col">Trick</th>${SHORT_SEATS.map((x) => `<th scope="col">${x}</th>`).join("")}<th scope="col">Won</th></tr></thead><tbody>${completed.map((t, i) => `<tr class="${Math.floor(Math.min(ply, 51) / 4) === i ? "highlight" : ""}"><td><button class="trick-jump" data-ply="${t.start}" aria-label="Jump to trick ${i + 1}">${i + 1}</button></td>${[0, 1, 2, 3].map((seat) => `<td>${coloredCard(t.plays.find((p) => p.seat === seat).card)}</td>`).join("")}<td>${SHORT_SEATS[t.winner]}</td></tr>`).join("")}</tbody></table>`;
}
function stopPlayback() {
  if (playback) clearInterval(playback);
  playback = null;
}
function seek(position) {
  stopPlayback();
  ply = Math.max(0, Math.min(52, position));
  renderReplay();
}
function togglePlayback() {
  if (playback) {
    stopPlayback();
    renderReplay();
    return;
  }
  if (ply === 52) ply = 0;
  playback = setInterval(() => {
    ply++;
    if (ply >= 52) stopPlayback();
    renderReplay();
  }, 850);
  renderReplay();
}
function discardWorker() {
  clearTimeout(timeout);
  worker?.terminate();
  worker = null;
}
function createWorker() {
  const w = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  w.onmessage = ({ data }) => {
    if (worker !== w || data.id !== currentId || !busy) return;
    const row = rows.find((r) => r.id === currentId);
    if (data.type === "progress") {
      $("progress-label").textContent =
        `Hand ${batchDone + 1} of ${batchTotal} · Board ${row.board} · ${data.phase}`;
      $("progress").value =
        (batchDone + 0.15 + 0.8 * data.fraction) / batchTotal;
      return;
    }
    clearTimeout(timeout);
    if (data.type === "result") {
      row.analysis = data.analysis;
      row.status = "done";
      row.error = null;
    } else {
      row.status = "error";
      row.error = data.error;
      discardWorker();
    }
    persist([row]);
    batchDone++;
    currentId = null;
    renderLibrary();
    if (selectedId === row.id) renderHand();
    nextBoard();
  };
  w.onerror = (event) => {
    event.preventDefault();
    if (worker !== w || !busy) return;
    failCurrent(
      event.message ||
        "The analysis worker could not start. Try reloading the page.",
    );
  };
  return w;
}
let queue = [];
function nextBoard() {
  if (!busy) return;
  const id = queue.shift();
  if (!id) {
    busy = false;
    currentId = null;
    $("progress-panel").hidden = true;
    const withTechniques = rows.filter(
      (r) => r.analysis?.findings.length,
    ).length;
    const failed = rows.filter((r) => r.status === "error").length;
    notice(
      `Analysis finished. ${withTechniques} ${withTechniques === 1 ? "hand has" : "hands have"} techniques to explore.${failed ? ` ${failed} ${failed === 1 ? "hand needs" : "hands need"} a retry; select one to see the issue.` : ""}`,
      failed > 0,
    );
    renderLibrary();
    return;
  }
  const row = rows.find((r) => r.id === id);
  currentId = id;
  row.status = "running";
  $("progress-label").textContent =
    `Hand ${batchDone + 1} of ${batchTotal} · Board ${row.board} · Starting solver`;
  $("progress").value = batchDone / batchTotal;
  renderLibrary();
  if (selectedId === id) renderHand();
  try {
    worker ??= createWorker();
    worker.postMessage({ type: "analyze", id, board: row });
  } catch (error) {
    failCurrent(error.message);
    return;
  }
  timeout = setTimeout(
    () =>
      failCurrent(
        "This hand exceeded the 3-minute analysis limit. You can retry it separately.",
      ),
    180000,
  );
}
function failCurrent(message) {
  discardWorker();
  const row = rows.find((r) => r.id === currentId);
  if (row) {
    row.status = "error";
    row.error = message;
    persist([row]);
  }
  currentId = null;
  batchDone++;
  renderLibrary();
  if (row?.id === selectedId) renderHand();
  nextBoard();
}
function startAnalysis(onlyId = null) {
  if (busy) return;
  queue = rows
    .filter((r) => r.status !== "done" && (!onlyId || r.id === onlyId))
    .map((r) => r.id);
  if (!queue.length) return;
  busy = true;
  batchTotal = queue.length;
  batchDone = 0;
  notice("");
  $("progress-panel").hidden = false;
  nextBoard();
}
function stopAnalysis() {
  busy = false;
  queue = [];
  discardWorker();
  const row = rows.find((r) => r.id === currentId);
  if (row) {
    row.status = "queued";
    persist([row]);
  }
  currentId = null;
  $("progress-panel").hidden = true;
  notice(
    "Analysis stopped. Completed hands are saved; Analyze resumes unfinished hands.",
  );
  renderLibrary();
  renderHand();
}

async function addFiles(files, autoAnalyze = false) {
  await ready;
  const known = new Set(rows.map(signature));
  let added = [],
    duplicates = 0;
  importErrors = [];
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) {
      importErrors.push(
        `${file.name}: File is over 25 MB. Split it into smaller batches.`,
      );
      continue;
    }
    try {
      const result = parsePbn(await file.text(), file.name);
      importErrors.push(...result.errors);
      for (const board of result.boards) {
        const key = signature(board);
        if (known.has(key)) {
          duplicates++;
          continue;
        }
        known.add(key);
        added.push({
          ...board,
          id: crypto.randomUUID(),
          added: Date.now() + (rows.length + added.length) / 1000,
          status: "queued",
        });
      }
    } catch (error) {
      importErrors.push(`${file.name}: ${error.message}`);
    }
  }
  rows.push(...added);
  await persist(added);
  showErrors();
  $("technique-filter").value = "";
  $("suit-filter").value = "";
  $("search").value = "";
  notice(
    `${added.length} ${added.length === 1 ? "hand" : "hands"} added.${duplicates ? ` ${duplicates} duplicate ${duplicates === 1 ? "deal" : "deals"} skipped.` : ""}${added.length ? " Ready to analyze." : ""}`,
  );
  if (added.length) selectedId = added[0].id;
  renderLibrary();
  renderHand();
  if (added.length)
    $("workspace").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  if (autoAnalyze) startAnalysis();
}

$("import-button").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", async (e) => {
  await addFiles([...e.target.files]);
  e.target.value = "";
});
$("sample-button").addEventListener("click", async () => {
  $("sample-button").disabled = true;
  try {
    const response = await fetch(
      new URL("../samples/example-collection.pbn", import.meta.url),
    );
    if (!response.ok) throw new Error("Could not load the sample collection.");
    await addFiles(
      [new File([await response.text()], "Example collection.pbn")],
      true,
    );
  } catch (error) {
    notice(error.message, true);
  } finally {
    $("sample-button").disabled = false;
  }
});
for (const name of ["dragenter", "dragover"])
  $("drop-zone").addEventListener(name, (event) => {
    event.preventDefault();
    $("drop-zone").classList.add("dragging");
  });
$("drop-zone").addEventListener("dragleave", (event) => {
  if (!$("drop-zone").contains(event.relatedTarget))
    $("drop-zone").classList.remove("dragging");
});
$("drop-zone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("drop-zone").classList.remove("dragging");
  addFiles([...event.dataTransfer.files]);
});
$("analyze-button").addEventListener("click", () => startAnalysis());
$("stop-button").addEventListener("click", stopAnalysis);
$("skip-button").addEventListener("click", () =>
  failCurrent("Skipped during analysis. Choose Retry this hand to try again."),
);
$("board-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) selectHand(button.dataset.id);
});
$("hand-view").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-finding]"),
    jump = event.target.closest("[data-ply]");
  if (tab) {
    findingIndex = Number(tab.dataset.finding);
    renderFinding();
    seek(currentRow().analysis.findings[findingIndex].start);
  } else if (jump) seek(Number(jump.dataset.ply));
});
$("search").addEventListener("input", renderLibrary);
for (const id of ["technique-filter", "suit-filter"])
  $(id).addEventListener("change", () => {
    renderLibrary();
    findingIndex = preferredFinding(currentRow());
    renderHand();
    const finding = currentRow()?.analysis?.findings[findingIndex];
    if (finding) seek(finding.start);
  });
$("clear-button").addEventListener("click", async () => {
  if (
    busy ||
    !confirm(
      "Clear this browser’s hand collection? Your original PBN files are unchanged.",
    )
  )
    return;
  stopPlayback();
  try {
    await clearCollection();
    rows = [];
    selectedId = null;
    importErrors = [];
    showErrors();
    notice("Collection cleared.");
    renderLibrary();
    renderHand();
  } catch {
    notice(
      "The saved collection could not be cleared. Please try again.",
      true,
    );
  }
});
$("export-button").addEventListener("click", () => {
  const result = {
    application: "Bridge Study",
    version: ANALYSIS_VERSION,
    exported: new Date().toISOString(),
    scope:
      "One optimal line per board; findings are examples, not necessity proofs.",
    boards: rows.filter((r) => r.analysis),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `bridge-study-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("about-button").addEventListener("click", () =>
  $("about-dialog").showModal(),
);
$("close-about").addEventListener("click", () => $("about-dialog").close());
$("about-dialog").addEventListener("click", (event) => {
  if (event.target === $("about-dialog") && event.offsetX < 0)
    $("about-dialog").close();
});
document.addEventListener("keydown", (event) => {
  if (
    !states.length ||
    /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) ||
    $("about-dialog").open
  )
    return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    seek(ply - 1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    seek(ply + 1);
  }
  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  }
});
const ready = (async () => {
  try {
    rows = await loadCollection();
    rows.forEach((r) => {
      if (r.status === "running") r.status = "queued";
      if (r.analysis && r.analysis.version !== ANALYSIS_VERSION) {
        r.status = "queued";
        delete r.analysis;
      }
    });
  } catch {
    $("save-status").textContent =
      "Browser storage unavailable · export results to save";
  }
  renderLibrary();
  renderHand();
})();
