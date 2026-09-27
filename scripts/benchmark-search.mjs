// Compare the bounded search and both contract modes against the frozen v1 corpus.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  globSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { createSolver } from "../src/solver.js";
import { analyzeBoard } from "../src/analyze.js";
const base = "reports/technique-benchmark-2026-09-25";
if (!isMainThread) {
  const solver = await createSolver();
  parentPort.on("message", (board) => {
    const result = { id: board.id, key: board.key };
    try {
      result.par = analyzeBoard(board, solver);
      result.source = analyzeBoard(
        { ...board, sourceContract: board.contract },
        solver,
        () => {},
        { contractMode: "source" },
      );
    } catch (error) {
      result.error = error.message;
    }
    parentPort.postMessage(result);
  });
} else {
  const output = process.argv[2] || ".build/optimal-search-v2/results.ndjson";
  const boards = JSON.parse(readFileSync(`${base}/corpus.json`, "utf8"));
  const hash = createHash("sha256").update(readFileSync(`${base}/corpus.json`));
  const codeHashes = {};
  for (const path of [
    ...globSync("src/*.js"),
    ...globSync("vendor/**/*.{js,wasm}"),
    "scripts/benchmark-search.mjs",
  ].sort()) {
    const data = readFileSync(path);
    hash.update(path).update(data);
    codeHashes[path] = createHash("sha256").update(data).digest("hex");
  }
  const fingerprint = hash.digest("hex"),
    manifest = output + ".manifest.json";
  if (
    existsSync(output) &&
    (!existsSync(manifest) ||
      JSON.parse(readFileSync(manifest, "utf8")).fingerprint !== fingerprint)
  )
    throw new Error("Inputs/code changed: choose a fresh output file.");
  mkdirSync(dirname(output), { recursive: true });
  if (!existsSync(manifest))
    writeFileSync(
      manifest,
      JSON.stringify(
        {
          fingerprint,
          codeHashes,
          started: new Date().toISOString(),
          node: process.version,
        },
        null,
        2,
      ),
    );
  const cached = existsSync(output)
    ? readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse)
    : [];
  const done = new Set(cached.map((r) => r.id)),
    queue = boards.filter((b) => !done.has(b.id));
  let completed = done.size;
  console.log(
    JSON.stringify({
      boards: boards.length,
      cached: done.size,
      pending: queue.length,
    }),
  );
  await Promise.all(
    Array.from(
      { length: Math.min(3, queue.length) },
      () =>
        new Promise((resolve) => {
          let worker, current, timer;
          const save = (result) => {
            appendFileSync(output, JSON.stringify(result) + "\n");
            completed++;
            console.log(
              JSON.stringify({ completed, id: result.id, error: result.error }),
            );
          };
          const next = () => {
            current = queue.shift();
            if (!current) {
              worker.terminate();
              resolve();
              return;
            }
            worker.postMessage(current);
            timer = setTimeout(async () => {
              const failed = current;
              await worker.terminate();
              save({ id: failed.id, error: "180 second timeout" });
              start();
            }, 180000);
          };
          const start = () => {
            worker = new Worker(new URL(import.meta.url));
            worker.on("message", (result) => {
              clearTimeout(timer);
              save(result);
              next();
            });
            worker.on("error", (error) => {
              clearTimeout(timer);
              save({ id: current.id, error: error.message });
              start();
            });
            next();
          };
          start();
        }),
    ),
  );
  const old = new Map(
    readFileSync(`${base}/results.ndjson`, "utf8")
      .trim()
      .split("\n")
      .map((s) => {
        const r = JSON.parse(s);
        return [r.id, r];
      }),
  );
  const results = new Map(
    readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((s) => {
        const r = JSON.parse(s);
        return [r.id, r];
      }),
  );
  const hit = (r, t) => r?.findings.some((f) => f.technique === t) || false;
  const summary = [
    ...new Set(boards.flatMap((b) => Object.keys(b.labels))),
  ].map((technique) => {
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
  const errors = [...results.values()].filter((r) => r.error);
  writeFileSync(
    output + ".summary.json",
    JSON.stringify({ summary, errors }, null, 2),
  );
  console.log(JSON.stringify({ summary, errors }, null, 2));
}
