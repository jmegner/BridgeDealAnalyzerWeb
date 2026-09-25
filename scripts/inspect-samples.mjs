// Development aid: display the actual generated contracts, findings and play.
import { readFileSync } from "node:fs";
import { createSolver } from "../src/solver.js";
import { analyzeBoard } from "../src/analyze.js";
import { parsePbn } from "../src/pbn.js";
import { contractText, cardText, replay, SHORT_SEATS } from "../src/bridge.js";
const solver = await createSolver();
const { boards, errors } = parsePbn(
  readFileSync(process.argv[2] || "samples/teaching-hands.pbn", "utf8"),
);
if (errors.length) console.error(errors);
for (const b of boards) {
  const a = analyzeBoard(b, solver);
  const report = {
    board: b.board,
    par: a.par,
    selected: contractText(a.contract),
    findings: a.findings,
  };
  if (a.contract)
    report.tricks = replay(b.hands, a.contract, a.cards)
      .at(-1)
      .completed.map((t) => ({
        cards: t.plays
          .map((p) => `${SHORT_SEATS[p.seat]}:${cardText(p.card)}`)
          .join(" "),
        winner: SHORT_SEATS[t.winner],
      }));
  console.log(JSON.stringify(report, null, 2));
}
