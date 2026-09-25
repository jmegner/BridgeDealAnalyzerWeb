import test from "node:test";
import assert from "node:assert/strict";
import { initialState, playCard, RANKS } from "../src/bridge.js";
import { detectTechniques } from "../src/techniques.js";
const card = (text) => "SHDC".indexOf(text[0]) * 13 + RANKS.indexOf(text[1]);
function line(hands, plays, leader = 0, trump = 0, declarer = 2) {
  let s = initialState(
    hands.map((h) => h.split(" ").map(card)),
    trump,
    declarer,
  );
  s.leader = leader;
  const states = [s];
  for (const c of plays.split(" ")) {
    s = playCard(s, card(c));
    states.push(s);
  }
  return detectTechniques(states);
}

test("Crossruff requires repeated winning ruffs in both hands, adding trump tricks", () => {
  const found = line(
    ["SA SK H2 H3", "S2 S3 H4 H5", "SQ SJ C2 C3", "S4 S5 C4 C5"],
    "H2 H4 SJ C4 C2 C5 SK H5 H3 S2 SQ S4 C3 S5 SA S3",
  );
  assert.ok(found.some((f) => f.technique === "Crossruff"));
  const ordinary = line(
    ["SA H2", "S2 H3", "SQ C2", "S4 C4"],
    "H2 H3 SQ C4 C2 S4 SA S2",
  );
  assert.ok(!ordinary.some((f) => f.technique === "Crossruff"));
});
test("Dummy reversal distinguishes shortening declarer from an ordinary long-hand ruff", () => {
  const hands = [
    "SJ ST H2 H3 CA CK",
    "S3 S4 H4 H5 C4 C5",
    "SA SK S2 C2 C3 D2",
    "S5 S6 H6 H7 C6 C7",
  ];
  const found = line(
    hands,
    "H2 H4 SA H6 C2 C6 CA C4 H3 H5 SK H7 C3 C7 CK C5 SJ S3 S2 S5 ST S4 D2 S6",
  );
  assert.ok(found.some((f) => f.technique === "Dummy reversal"));
  const ordinary = line(hands, "H2 H4 SA H6 C2 C6 CA C4");
  assert.ok(!ordinary.some((f) => f.technique === "Dummy reversal"));
});
test("Trump coup requires a forced ruff from an interleaved trump holding", () => {
  const found = line(
    ["HA CA", "SK S2", "SA SQ", "H2 C2"],
    "HA S2 SQ H2 SA C2 CA SK",
  );
  assert.ok(found.some((f) => f.technique === "Trump coup"));
  const ordinary = line(
    ["HA CA", "SJ S2", "SA SQ", "H2 C2"],
    "HA S2 SQ H2 SA C2 CA SJ",
  );
  assert.ok(!ordinary.some((f) => f.technique === "Trump coup"));
});
test("Simple squeeze detects a length guard and the promoted winner actually cashed", () => {
  const found = line(
    ["SA HA HQ", "S2 C2 D2", "SQ CA H2", "SK HK HJ"],
    "CA HJ SA C2 H2 HK HA D2 HQ S2 SQ SK",
    2,
    4,
  );
  assert.ok(
    found.some(
      (f) =>
        f.technique === "Squeeze" && f.suits.includes(0) && f.suits.includes(1),
    ),
  );
  // The discarded heart is idle: West never guarded the heart queen here.
  const idle = line(
    ["SA HA HQ", "S2 C2 D2", "SQ CA H2", "SK HJ HT"],
    "CA HT SA C2 H2 HJ HA D2 HQ S2 SQ SK",
    2,
    4,
  );
  assert.ok(!idle.some((f) => f.technique === "Squeeze"));
});
test("Elimination identifies the suits cleared before a ruff-and-discard throw-in", () => {
  const found = line(
    ["D2 H3 SK H4", "D3 H5 H7 C2", "DA H2 SA H6", "D4 HK C4 C5"],
    "DA D4 D2 D3 H2 HK H3 H5 C4 SK C2 H6 H4 H7 SA C5",
    2,
    0,
  );
  assert.ok(
    found.some(
      (f) => f.technique === "Elimination / endplay" && f.suits.includes(2),
    ),
  );
  // West retains a trump exit. An optional ruff/sluff is not a forced endplay.
  const safe = line(
    ["D2 H3 SK H4", "D3 H5 H7 C2", "DA H2 SA H6", "D4 HK S5 C5"],
    "DA D4 D2 D3 H2 HK H3 H5 C5 SK C2 H6 H4 H7 SA S5",
    2,
    0,
  );
  assert.ok(!safe.some((f) => f.technique === "Elimination / endplay"));
});
