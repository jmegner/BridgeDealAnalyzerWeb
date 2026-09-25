import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("GitHub Pages subpath: actual WASM analysis, filters, replay, persistence and export", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /Find the lesson/ }),
  ).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await page.getByRole("button", { name: /Try a sample collection/ }).click();
  await expect(page.locator("#analyze-button")).toHaveText(
    /Analysis complete/,
    { timeout: 45000 },
  );
  await expect(page.locator(".board-item")).toHaveCount(5);
  await expect(page.locator("#hand-view")).toContainText("ONE OPTIMAL LINE");
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(page.locator("#replay-position")).toHaveText("Card 1 / 52");
  await page.getByRole("button", { name: "Go to end", exact: true }).click();
  await expect(page.locator("#replay-caption")).toContainText("Complete");
  await page
    .getByRole("button", { name: "Go to beginning", exact: true })
    .click();
  await page.getByLabel("Search hands").fill("338");
  await expect(page.locator(".board-item")).toHaveCount(1);
  await page.getByLabel("Search hands").fill("");
  await expect(page.locator(".board-item")).toHaveCount(5);
  await page.locator("#technique-filter").selectOption("Trump coup");
  await expect(page.locator("#finding-detail")).toContainText(
    "must play one in front",
  );
  await expect(page.locator("#replay-position")).toHaveText("Card 44 / 52");
  await page.locator("#suit-filter").selectOption("2");
  await expect(page.locator(".board-item")).toHaveCount(1);
  await page.locator("#suit-filter").selectOption("0");
  await expect(page.locator(".board-item")).toHaveCount(0);
  await page.locator("#suit-filter").selectOption("");
  await page.locator("#technique-filter").selectOption("Dummy reversal");
  await expect(page.locator(".board-item").first()).toBeVisible();
  await page
    .locator("[data-finding]")
    .filter({ hasText: "Dummy reversal" })
    .first()
    .click();
  await expect(page.locator("#finding-detail")).toContainText("shortens");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export results/ }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(exported.boards).toHaveLength(5);
  expect(exported.boards[0].analysis.cards).toHaveLength(52);
  await page.reload();
  await expect(page.locator(".board-item")).toHaveCount(5);
  await expect(page.locator("#analyze-button")).toHaveText(/Analysis complete/);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Multiple uploaded PBNs, bad records, deduplication and mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator("#file-input").setInputFiles([
    {
      name: "club.pbn",
      mimeType: "text/plain",
      buffer: readFileSync("samples/teaching-hands.pbn"),
    },
    {
      name: "broken.pbn",
      mimeType: "text/plain",
      buffer: Buffer.from('[Board "9"]\n[Deal "N:AKQ... - - -"]'),
    },
  ]);
  await expect(page.locator(".board-item")).toHaveCount(4);
  await expect(page.locator("#error-summary")).toContainText("1 import issue");
  await page.getByRole("button", { name: /Analyze 4 hands/ }).click();
  await expect(page.locator("#analyze-button")).toHaveText(
    /Analysis complete/,
    { timeout: 45000 },
  );
  await page.locator("#file-input").setInputFiles("samples/teaching-hands.pbn");
  await expect(page.locator("#notice")).toContainText(
    "4 duplicate deals skipped",
  );
  await expect(page.locator(".board-item")).toHaveCount(4);
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    window: innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.window);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("Stop terminates a busy worker and allows remaining boards to resume", async ({
  page,
}) => {
  await page.goto("./");
  await page.route(
    "**/vendor/dds/dds.wasm",
    (route) =>
      new Promise((resolve) =>
        setTimeout(() => resolve(route.continue()), 500),
      ),
  );
  await page.locator("#file-input").setInputFiles("samples/teaching-hands.pbn");
  await expect(page.locator(".board-item")).toHaveCount(4);
  await page.getByRole("button", { name: /Analyze 4 hands/ }).click();
  await page
    .getByRole("button", { name: "Stop analysis", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText("Analysis stopped");
  await expect(page.locator("#analyze-button")).toBeEnabled();
  await page.locator("#analyze-button").click();
  await expect(page.locator("#analyze-button")).toHaveText(
    /Analysis complete/,
    { timeout: 45000 },
  );
});
