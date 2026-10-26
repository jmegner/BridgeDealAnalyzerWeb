import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parsePbn } from "../../src/pbn.js";

const record = readFileSync(
  "reports/technique-benchmark-2026-09-25/all.pbn",
  "utf8",
)
  .split(/\r?\n\s*\r?\n/)
  .find((s) => s.includes('[BenchmarkID "656ab2904da2"]'));
const upload = (name, text) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(text),
});
async function exported(page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export results/ }).click();
  return JSON.parse(readFileSync(await (await pending).path(), "utf8"));
}

test("Older saved results are queued for reanalysis and retain the PBN contract", async ({
  page,
}) => {
  const legacy = {
    ...parsePbn(record, "legacy.pbn").boards[0],
    id: "legacy",
    added: 1,
    status: "done",
    analysis: JSON.parse(
      readFileSync(
        "reports/technique-benchmark-2026-09-25/results.ndjson",
        "utf8",
      )
        .split("\n")
        .find(
          (line) =>
            line.includes('"id": "656ab2904da2"') ||
            line.includes('"id":"656ab2904da2"'),
        ),
    ).normal,
  };
  delete legacy.sourceContract;
  delete legacy.sourceContractWarning;
  await page.goto("./");
  await page.evaluate(
    (row) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("bridge-study", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("hands", "readwrite");
          tx.objectStore("hands").put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    legacy,
  );
  await page.reload();
  await expect(page.locator("#analyze-button")).toHaveText(/Analyze 1 hand/);
  await expect(page.locator("#export-button")).toBeDisabled();
  await page.getByLabel("Contract to study").selectOption("source");
  await expect(page.locator("#hand-view")).toContainText("PBN contract: 6♠ S");
});

test("Both contract modes retain separate scores, replays and cached results across reload", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#file-input").setInputFiles(upload("coup.pbn", record));
  await page.locator("#analyze-button").click();
  await expect(page.locator("#contract-mode")).toBeDisabled();
  await expect(page.locator("#analyze-button")).toHaveText(
    /Analysis complete/,
    { timeout: 45000 },
  );
  await expect(page.locator(".par-summary")).toContainText("Par contract");
  await page.getByLabel("Contract to study").selectOption("source");
  await expect(page.locator("#hand-view")).toContainText("PBN contract: 6♠ S");
  await expect(page.locator("#export-button")).toBeEnabled(); // cached par is still exportable
  await page.locator("#analyze-button").click();
  await expect(page.locator("#analyze-button")).toHaveText(
    /Analysis complete/,
    { timeout: 45000 },
  );
  await expect(page.locator(".par-summary")).toContainText("PBN contract");
  await expect(page.locator(".par-summary")).toContainText("Par benchmark");
  const result = await exported(page),
    row = result.boards[0];
  expect(result.contractMode).toBe("source");
  expect(row.analyses.par.contract.trump).toBe(4);
  expect(row.analyses.source.contract).toEqual({
    level: 6,
    trump: 0,
    declarer: 2,
    doubled: 0,
  });
  expect(row.analyses.source.search.linesExamined).toBe(12);
  expect(row.analyses.source.cards).toHaveLength(52);
  await page.reload();
  await expect(page.locator("#contract-mode")).toHaveValue("source");
  await expect(page.locator(".par-summary")).toContainText("PBN contract");
  await page.getByLabel("Contract to study").selectOption("par");
  await expect(page.locator("#analyze-button")).toHaveText(/Analysis complete/);
  await expect(page.locator(".par-summary")).toContainText("Par contract");
  await page.getByLabel("Contract to study").selectOption("source");
  await expect(page.locator("#analyze-button")).toHaveText(/Analysis complete/);
});

test("Different PBN contracts survive deduplication and invalid contracts fall back visibly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByLabel("Contract to study").selectOption("source");
  await page
    .locator("#file-input")
    .setInputFiles([
      upload("six-spades.pbn", record),
      upload(
        "four-spades.pbn",
        record.replace('[Contract "6S"]', '[Contract "4S"]'),
      ),
      upload(
        "invalid.pbn",
        record.replace('[Contract "6S"]', '[Contract "9S"]'),
      ),
    ]);
  await expect(page.locator(".board-item")).toHaveCount(3);
  await page
    .locator("#file-input")
    .setInputFiles(upload("duplicate.pbn", record));
  await expect(page.locator("#notice")).toContainText(
    "1 duplicate deal skipped",
  );
  await page.locator("#analyze-button").click();
  await expect(page.locator("#analyze-button")).toHaveText(
    /Analysis complete/,
    { timeout: 45000 },
  );
  await page.locator(".board-item").filter({ hasText: "invalid.pbn" }).click();
  await expect(page.locator("#hand-view .warnings")).toContainText(
    "Invalid PBN Contract tag; using par.",
  );
  await expect(page.locator(".par-summary")).toContainText("Par contract");
  const result = await exported(page);
  const fallback = result.boards.find(
    (b) => b.source === "invalid.pbn",
  ).analysis;
  expect(fallback.requestedMode).toBe("source");
  expect(fallback.contractOrigin).toBe("par");
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    window: innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.window);
  await page.screenshot({
    path: "test-results/contract-mode-mobile.png",
    fullPage: true,
  });
});

test("Suit comparison switches results, replay and findings, and exports every lead", async ({ page }) => {
  const records = readFileSync("samples/example-collection.pbn", "utf8");
  const endplay = records.split(/\r?\n\s*\r?\n/).find((s) => s.includes('[Board "19"]'));
  await page.goto("./");
  await page.locator("#file-input").setInputFiles(upload("endplay.pbn", endplay));
  await page.locator("#analyze-button").click();
  await expect(page.locator("#analyze-button")).toHaveText(/Analysis complete/, { timeout: 45000 });
  await expect(page.locator(".lead-option")).toHaveCount(4);
  await expect(page.locator('[data-lead-suit="0"]')).toContainText("Best defense");
  await page.locator('[data-lead-suit="1"]').click();
  await expect(page.locator('[data-lead-suit="1"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".hand-meta")).toContainText("12 tricks after the hearts lead");
  await expect(page.locator(".par-summary")).toContainText("-480");
  await expect(page.locator(".par-summary")).toContainText("Par benchmark");
  await expect(page.locator('[data-lead-suit="1"]')).toContainText("+1 declarer trick");
  await page.getByRole("button", { name: "Go to end", exact: true }).click();
  await expect(page.locator("#replay-caption")).toContainText("12 tricks");
  await page.locator('[data-lead-suit="0"]').click();
  await expect(page.locator("#replay-position")).toHaveText("Card 0 / 52");
  await expect(page.locator(".hand-meta")).toContainText("11 tricks after the spades lead");
  await expect(page.locator("#finding-detail")).toContainText("throw");
  await page.locator('[data-lead-suit="1"]').click();
  await page.locator("#technique-filter").selectOption("Elimination / endplay");
  await expect(page.locator('[data-lead-suit="0"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#finding-detail")).toContainText("throw");
  const result = await exported(page);
  expect(result.boards[0].analysis.leadAnalyses).toHaveLength(4);
  for (const lead of result.boards[0].analysis.leadAnalyses) {
    expect(lead.cards).toHaveLength(52);
    expect(lead.cards[0] / 13 | 0).toBe(lead.suit);
  }
  await page.reload();
  await expect(page.locator(".lead-option")).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-lead-suit="3"]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/lead-comparison-mobile.png", fullPage: true });
});
