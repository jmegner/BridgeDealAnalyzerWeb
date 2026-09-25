import { RANKS, SHORT_SEATS } from "./bridge.js";

// Strip comments without mistaking braces/semicolons inside quoted tags for comments.
function stripComments(text) {
  let out = "",
    quoted = false,
    comment = 0,
    lineComment = false,
    escaped = false;
  for (const ch of text.replace(/^\uFEFF/, "")) {
    if (lineComment) {
      if (ch === "\n") {
        lineComment = false;
        out += "\n";
      }
      continue;
    }
    if (comment) {
      if (ch === "{") comment++;
      if (ch === "}") comment--;
      if (ch === "\n") out += ch;
      continue;
    }
    if (!quoted && ch === "{") {
      comment = 1;
      out += " ";
      continue;
    }
    if (!quoted && (ch === ";" || ch === "%")) {
      lineComment = true;
      continue;
    }
    out += ch;
    if (ch === '"' && !escaped) quoted = !quoted;
    escaped = ch === "\\" && !escaped;
  }
  if (comment || quoted) throw new Error("Unclosed comment or quoted tag.");
  return out;
}
export function parseDeal(value) {
  const match = /^([NESW]):\s*(.*)$/i.exec(value.trim());
  if (!match) throw new Error("Deal must start with N:, E:, S:, or W:.");
  const parts = match[2].trim().split(/\s+/);
  if (parts.length !== 4)
    throw new Error("A deal must contain all four hands.");
  const hands = [[], [], [], []],
    seen = new Set();
  const first = SHORT_SEATS.indexOf(match[1].toUpperCase());
  parts.forEach((part, offset) => {
    const seat = (first + offset) % 4;
    const suits = part.toUpperCase().split(".");
    if (suits.length !== 4)
      throw new Error("Each hand needs four suits in S.H.D.C order.");
    suits.forEach((cards, strain) => {
      for (const symbol of cards === "-" ? "" : cards) {
        const r = RANKS.indexOf(symbol);
        if (r < 0)
          throw new Error(
            `Unknown rank “${symbol}”; use T for ten. Incomplete deals are not supported.`,
          );
        const card = strain * 13 + r;
        if (seen.has(card))
          throw new Error(`Duplicate card: ${"SHDC"[strain]}${symbol}.`);
        seen.add(card);
        hands[seat].push(card);
      }
    });
    if (hands[seat].length !== 13)
      throw new Error(
        `${SHORT_SEATS[seat]} has ${hands[seat].length} cards; expected 13.`,
      );
    hands[seat].sort((a, b) => a - b);
  });
  return hands;
}
const VULS = {
  none: 0,
  love: 0,
  "-": 0,
  neither: 0,
  all: 1,
  both: 1,
  ns: 2,
  ew: 3,
};
const BOARD_VUL = [0, 2, 3, 1, 2, 3, 1, 0, 3, 1, 0, 2, 1, 0, 2, 3];
export function parsePbn(text, source = "Imported PBN") {
  const boards = [],
    errors = [],
    records = [];
  let clean;
  try {
    clean = stripComments(text);
  } catch (e) {
    return { boards, errors: [`${source}: ${e.message}`] };
  }
  let current = {},
    previous = {};
  for (const match of clean.matchAll(
    /\[\s*([A-Za-z][\w]*)\s+"((?:\\.|[^"\\])*)"\s*\]/g,
  )) {
    const name = match[1].toLowerCase();
    if (
      (name === "event" && Object.keys(current).length > 0) ||
      (name === "board" && current.board !== undefined) ||
      (name === "deal" && current.deal !== undefined)
    ) {
      records.push(current);
      previous = { ...previous, ...current };
      current = {};
    }
    const value = match[2].replace(/\\(["\\])/g, "$1");
    current[name] = value === "#" ? (previous[name] ?? "") : value;
  }
  if (Object.keys(current).length) records.push(current);
  records.forEach((tags, index) => {
    const label = tags.board || `${index + 1}`,
      warnings = [];
    try {
      if (!tags.deal) throw new Error("Missing Deal tag.");
      const parsedNumber = /^\d+$/.test(tags.board || "")
        ? Number(tags.board)
        : 0;
      const number = Number.isSafeInteger(parsedNumber) ? parsedNumber : 0;
      let dealer = SHORT_SEATS.indexOf((tags.dealer || "").toUpperCase());
      const vulKey = (tags.vulnerable || "").toLowerCase();
      let vulnerable = Object.hasOwn(VULS, vulKey) ? VULS[vulKey] : undefined;
      if (dealer < 0 && (!tags.dealer || tags.dealer === "?") && number > 0) {
        dealer = (number - 1) % 4;
        warnings.push("Dealer inferred from standard board numbering.");
      }
      if (
        vulnerable === undefined &&
        (!tags.vulnerable || tags.vulnerable === "?") &&
        number > 0
      ) {
        vulnerable = BOARD_VUL[(number - 1) % 16];
        warnings.push("Vulnerability inferred from standard board numbering.");
      }
      if (dealer < 0)
        throw new Error("Missing or invalid Dealer; supply N, E, S, or W.");
      if (vulnerable === undefined)
        throw new Error(
          "Missing or invalid Vulnerable; supply None, NS, EW, or All.",
        );
      boards.push({
        board: label,
        source,
        event: tags.event || "",
        dealer,
        vulnerable,
        hands: parseDeal(tags.deal),
        warnings,
        tags,
      });
    } catch (e) {
      errors.push(`${source}, board ${label}: ${e.message}`);
    }
  });
  if (!records.length) errors.push(`${source}: No PBN records found.`);
  return { boards, errors };
}
