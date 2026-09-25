import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePbn, parseDeal } from "../src/pbn.js";
import {
  initialState,
  playCard,
  legalCards,
  scoreContract,
  trickWinner,
} from "../src/bridge.js";
const sample = readFileSync(
  new URL("../samples/teaching-hands.pbn", import.meta.url),
  "utf8",
);

test("PBN batch preserves all boards, rotations, voids and metadata", () => {
  const { boards, errors } = parsePbn(sample, "lessons.pbn");
  assert.deepEqual(errors, []);
  assert.equal(boards.length, 4);
  assert.equal(boards[3].vulnerable, 3);
  assert.equal(boards[0].dealer, 2);
  for (const b of boards) assert.equal(new Set(b.hands.flat()).size, 52);
  assert.equal(boards[3].hands[2].filter((c) => c < 13).length, 0);
});
test("PBN handles comments, tag inheritance and standard board metadata", () => {
  const deal = parsePbn(sample).boards[0].tags.deal;
  const pbn = `{ [Deal "ignore this"] }\n[Event "A {real} event"]\n[Board "1"]\n[Deal "${deal}"]\n; [Board "999"]\n[Event "#"]\n[Board "2"]\n[Deal "#"]`;
  const result = parsePbn(pbn);
  assert.deepEqual(result.errors, []);
  assert.equal(result.boards.length, 2);
  assert.equal(result.boards[1].event, "A {real} event");
  assert.equal(result.boards[1].dealer, 1);
  assert.equal(result.boards[1].vulnerable, 2);
  assert.equal(result.boards[0].warnings.length, 2);
});
test("Malformed boards are reported while later valid boards remain available", () => {
  const result = parsePbn(
    '[Event "Bad"]\n[Board "9"]\n[Deal "N:AKQ... - - -"]\n' + sample,
  );
  assert.equal(result.errors.length, 1);
  assert.equal(result.boards.length, 4);
  assert.throws(() => parseDeal("N:AKQJ... AKQJ... AKQJ... AKQJ..."));
  assert.equal(parsePbn('[Event "unclosed').boards.length, 0);
});
test("A missing deal is reported and invalid metadata cannot reach DDS", () => {
  const missing = parsePbn('[Event "Missing deal"]\n[Board "9"]\n' + sample);
  assert.equal(missing.errors.length, 1);
  assert.match(missing.errors[0], /Missing Deal/);
  assert.equal(missing.boards.length, 4);
  const invalid = parsePbn(
    sample.replace('[Vulnerable "None"]', '[Vulnerable "constructor"]'),
  );
  assert.equal(invalid.errors.length, 1);
  assert.equal(invalid.boards.length, 3);
});
test("Follow suit, trump winner and legal state transitions", () => {
  const hands = [
    [12, 13],
    [11, 26],
    [10, 27],
    [9, 39],
  ];
  let s = initialState(hands, 2, 3);
  s = playCard(s, 12);
  assert.deepEqual(legalCards(s), [11]);
  assert.throws(() => playCard(s, 26));
  for (const c of [11, 10, 9]) s = playCard(s, c);
  assert.equal(s.leader, 0);
  assert.equal(s.won[0], 1);
  assert.equal(
    trickWinner(
      [
        { seat: 0, card: 12 },
        { seat: 1, card: 26 },
        { seat: 2, card: 27 },
        { seat: 3, card: 9 },
      ],
      2,
    ),
    2,
  );
});
test("Duplicate scoring covers vulnerability, sacrifices, slams and redoubles", () => {
  const spades = { level: 4, trump: 0, declarer: 0, doubled: 0 };
  assert.equal(scoreContract(spades, 10, 0), 420);
  assert.equal(scoreContract(spades, 10, 2), 620);
  const clubs = { level: 5, trump: 3, declarer: 1, doubled: 1 };
  assert.equal(scoreContract(clubs, 10, 0), -100);
  assert.equal(scoreContract(clubs, 10, 3), -200);
  assert.equal(scoreContract(clubs, 8, 0), -500);
  assert.equal(scoreContract(clubs, 8, 3), -800);
  assert.equal(scoreContract({ level: 6, trump: 4, declarer: 2 }, 12, 1), 1440);
  assert.equal(scoreContract({ ...spades, doubled: 2 }, 9, 0), -200);
});
