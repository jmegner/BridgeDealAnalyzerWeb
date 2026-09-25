// Deterministic development corpus. Writes examples to .build/, never the shipped samples.
import { writeFileSync, mkdirSync } from "node:fs";
import { createSolver } from "../src/solver.js";
import { analyzeBoard } from "../src/analyze.js";
import { RANKS, SHORT_SEATS, TECHNIQUES } from "../src/bridge.js";
const solver = await createSolver(),
  found = new Set(),
  examples = [];
let seed = 0xb71d9e;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const limit = Number(process.argv[2] || 1000);
mkdirSync(".build", { recursive: true });
const toPbn = (b) =>
  `[Event "Generated study deal ${b.board}"]\n[Board "${b.board}"]\n[Dealer "${SHORT_SEATS[b.dealer]}"]\n[Vulnerable "${["None", "All", "NS", "EW"][b.vulnerable]}"]\n[Deal "N:${b.hands
    .map((h) =>
      [0, 1, 2, 3]
        .map((s) =>
          h
            .filter((c) => Math.floor(c / 13) === s)
            .sort((a, b) => b - a)
            .map((c) => RANKS[c % 13])
            .join(""),
        )
        .join("."),
    )
    .join(" ")}"]\n`;
for (let i = 0; i < limit && found.size < TECHNIQUES.length; i++) {
  const deck = Array.from({ length: 52 }, (_, n) => n);
  for (let j = 51; j > 0; j--) {
    const k = Math.floor(random() * (j + 1));
    [deck[j], deck[k]] = [deck[k], deck[j]];
  }
  const b = {
    board: String(i + 1),
    dealer: i % 4,
    vulnerable: i % 4,
    hands: [0, 1, 2, 3].map((s) =>
      deck.slice(s * 13, s * 13 + 13).sort((a, b) => a - b),
    ),
  };
  const a = analyzeBoard(b, solver);
  const fresh = a.findings.filter((f) => !found.has(f.technique));
  if (fresh.length) {
    fresh.forEach((f) => found.add(f.technique));
    examples.push({ board: b, analysis: a });
    writeFileSync(
      ".build/discovered.pbn",
      examples.map((e) => toPbn(e.board)).join("\n"),
    );
    writeFileSync(".build/discovered.json", JSON.stringify(examples, null, 2));
    console.log(
      `Deal ${i + 1}: ${fresh.map((f) => f.technique).join(", ")} (${found.size}/5)`,
    );
  }
  if ((i + 1) % 100 === 0) console.log(`Checked ${i + 1} deals.`);
}
solver.dispose();
console.log(`Found ${[...found].join(", ")}. Saved .build/discovered.pbn.`);
