import {
  SEATS,
  SUITS,
  cardText,
  suit,
  rank,
  holding,
  sameSide,
  partner,
  legalCards,
} from "./bridge.js";

const isRuff = (trick, trump) => {
  const winning = trick.plays.find((p) => p.seat === trick.winner);
  return suit(trick.plays[0].card) !== trump && suit(winning.card) === trump;
};
const winningPlay = (trick) => trick.plays.find((p) => p.seat === trick.winner);

/** Conservative, auditable detectors for the ONE recorded line, not necessity proofs.
 * See docs/detection.md for exact coverage and deliberate false negatives.
 */
export function detectTechniques(states) {
  const first = states[0],
    last = states.at(-1),
    { declarer, trump } = first;
  const dummy = partner(declarer),
    defenders = [0, 1, 2, 3].filter((s) => !sameSide(s, declarer));
  const tricks = last.completed,
    findings = [];
  const add = (technique, start, end, suits, title, explanation, evidence) => {
    if (findings.some((f) => f.technique === technique && f.start === start))
      return;
    findings.push({
      technique,
      start,
      end,
      suits: [...new Set(suits)],
      title,
      explanation,
      evidence,
    });
  };
  const wonRuffs = tricks.filter(
    (t) => sameSide(t.winner, declarer) && isRuff(t, trump),
  );

  if (trump < 4) {
    const initialLong = Math.max(
      holding(first.hands, declarer, trump).length,
      holding(first.hands, dummy, trump).length,
    );
    const trumpWins = tricks.filter(
      (t) =>
        sameSide(t.winner, declarer) && suit(winningPlay(t).card) === trump,
    ).length;
    const ownRuffs = wonRuffs.filter((t) => t.winner === declarer);
    const dummyRuffs = wonRuffs.filter((t) => t.winner === dummy);
    // Require repeated alternating ruffs; isolated ruffs in each hand are not enough.
    let switches = 0;
    wonRuffs.forEach((t, i) => {
      if (i && t.winner !== wonRuffs[i - 1].winner) switches++;
    });
    if (
      ownRuffs.length >= 2 &&
      dummyRuffs.length >= 2 &&
      switches >= 3 &&
      trumpWins > initialLong
    ) {
      add(
        "Crossruff",
        wonRuffs[0].start,
        wonRuffs.at(-1).start + 4,
        [trump, ...wonRuffs.map((t) => suit(t.plays[0].card))],
        "Ruffs in both hands",
        `${SEATS[declarer]} wins ${ownRuffs.length} ruffs and ${SEATS[dummy]} wins ${dummyRuffs.length}. ` +
          `The ruffs alternate between the hands, contributing to ${trumpWins} trump tricks from an initial longest trump holding of ${initialLong}.`,
        wonRuffs.map((t) => ({
          ply: t.start,
          text: `${SEATS[t.winner]} ruffs ${SUITS[suit(t.plays[0].card)].toLowerCase()} with ${cardText(winningPlay(t).card)}.`,
        })),
      );
    }
    const ownLength = holding(first.hands, declarer, trump).length,
      dummyLength = holding(first.hands, dummy, trump).length;
    const neededRuffs = ownLength - dummyLength + 1;
    if (
      ownLength >= dummyLength &&
      ownRuffs.length >= neededRuffs &&
      trumpWins > ownLength
    ) {
      const draw = tricks.find((t) => {
        const s = states[t.start];
        return (
          t.winner === dummy &&
          suit(t.plays[0].card) === trump &&
          t.plays.some(
            (p) => defenders.includes(p.seat) && suit(p.card) === trump,
          ) &&
          holding(s.hands, dummy, trump).length >
            holding(s.hands, declarer, trump).length &&
          ownRuffs.filter((r) => r.start < t.start).length >= neededRuffs
        );
      });
      if (draw)
        add(
          "Dummy reversal",
          ownRuffs[0].start,
          draw.start + 4,
          [trump, ...ownRuffs.map((t) => suit(t.plays[0].card))],
          "Dummy becomes the master trump hand",
          `${SEATS[declarer]} started with ${ownLength} trumps against dummy’s ${dummyLength}. ` +
            `Ruffing in declarer’s hand shortens it below dummy, which then wins a trump round drawing an outstanding defensive trump. ` +
            `The partnership wins ${trumpWins} trump tricks.`,
          [
            ...ownRuffs
              .filter((t) => t.start < draw.start)
              .map((t) => ({
                ply: t.start,
                text: `Declarer ruffs with ${cardText(winningPlay(t).card)}.`,
              })),
            {
              ply: draw.start,
              text: "Dummy draws a remaining defensive trump after the reversal.",
            },
          ],
        );
    }

    for (const t of tricks) {
      const s = states[t.start],
        lead = t.plays[0];
      if (
        !sameSide(lead.seat, declarer) ||
        suit(lead.card) === trump ||
        holding(s.hands, lead.seat, trump).length
      )
        continue;
      const defender = (lead.seat + 1) % 4,
        finisher = (lead.seat + 2) % 4;
      const defTrumps = holding(s.hands, defender, trump),
        ownTrumps = holding(s.hands, finisher, trump);
      if (
        defTrumps.length < 2 ||
        defTrumps.length !== s.hands[defender].length ||
        defTrumps.length !== ownTrumps.length
      )
        continue;
      const interleaved = defTrumps.some(
        (c) =>
          ownTrumps.some((x) => rank(x) > rank(c)) &&
          ownTrumps.some((x) => rank(x) < rank(c)),
      );
      if (!interleaved || t.winner !== finisher || !isRuff(t, trump)) continue;
      const reductions = wonRuffs.filter(
        (r) => r.winner === finisher && r.start < t.start,
      );
      add(
        "Trump coup",
        t.start,
        Math.min(52, t.start + 8),
        [trump],
        `${SEATS[defender]} must ruff in front`,
        `${SEATS[lead.seat]} has no trumps and leads ${cardText(lead.card)}. ${SEATS[defender]} has only trumps and must play one ` +
          `in front of ${SEATS[finisher]}, whose equally long trump holding surrounds a defensive trump. ` +
          `${SEATS[finisher]} wins the ruff with ${cardText(winningPlay(t).card)}.` +
          (reductions.length
            ? ` Earlier ruffs in that hand reduced its trump length.`
            : ""),
        [
          {
            ply: t.start,
            text: "Side-suit lead from the hand without trumps.",
          },
          { ply: t.start + 1, text: `${SEATS[defender]} is forced to ruff.` },
          {
            ply: t.start + 2,
            text: "The trump finesse operates without leading a trump.",
          },
        ],
      );
    }
  }

  // Simple cashing squeezes: every available discard abandons a different useful guard.
  // A released card must actually win a later, unruffed trick in this replay.
  for (let ply = 1; ply < states.length - 1; ply++) {
    const s = states[ply];
    if (!s.trick.length || s.trick.length === 4) continue;
    const defender = (s.leader + s.trick.length) % 4;
    if (!defenders.includes(defender)) continue;
    const ledSuit = suit(s.trick[0].card),
      fullTrick = tricks[Math.floor(ply / 4)];
    if (
      !fullTrick ||
      !sameSide(fullTrick.winner, declarer) ||
      !sameSide(s.leader, declarer) ||
      fullTrick.winner !== s.leader ||
      holding(s.hands, defender, ledSuit).length
    )
      continue;
    if (trump < 4 && defenders.some((d) => holding(s.hands, d, trump).length))
      continue;
    const discards = legalCards(s);
    if (discards.length < 2) continue;
    function promotedBy(discard) {
      const strain = suit(discard);
      if (strain === ledSuit || strain === trump) return [];
      // Count top-down cashing winners, including length guards (Kx guarding AQ).
      // Each defender follows with its lowest card to retain its highest guard.
      // This is a suit-pattern check, not a separate full-deal search.
      const cashable = (owner, removed) => {
        const opponents = defenders.map((d) =>
          holding(s.hands, d, strain)
            .filter((c) => c !== removed)
            .sort((a, b) => rank(a) - rank(b)),
        );
        const winners = [];
        for (const c of holding(s.hands, owner, strain).sort(
          (a, b) => rank(b) - rank(a),
        )) {
          if (opponents.some((h) => h.some((x) => rank(x) > rank(c)))) break;
          winners.push(c);
          opponents.forEach((h) => h.shift());
        }
        return winners;
      };
      return [declarer, dummy].flatMap((owner) => {
        const before = cashable(owner, -1),
          after = cashable(owner, discard);
        // A threat in the other hand needs an entry: a retained card on lead can
        // reach a top card there. Final exploitation is checked in the actual replay.
        const reachable =
          owner === s.leader ||
          s.hands[s.leader].some((entry) => {
            const entrySuit = suit(entry);
            const opponents = defenders
              .flatMap((d) => holding(s.hands, d, entrySuit))
              .filter((c) => c !== discard);
            return holding(s.hands, owner, entrySuit).some(
              (top) =>
                rank(top) > Math.max(-1, ...opponents.map(rank), rank(entry)),
            );
          });
        return reachable ? after.filter((c) => !before.includes(c)) : [];
      });
    }
    const promotions = discards.map((c) => ({
      discard: c,
      threats: promotedBy(c),
    }));
    if (
      promotions.some((p) => !p.threats.length) ||
      new Set(discards.map(suit)).size < 2
    )
      continue;
    const played =
      states[ply + 1].trick.at(-1)?.card ?? fullTrick.plays.at(-1).card;
    const actual = promotions.find((p) => p.discard === played);
    if (!actual) continue;
    const cash = tricks.find(
      (t) =>
        t.start > ply &&
        sameSide(t.winner, declarer) &&
        actual.threats.includes(winningPlay(t).card) &&
        suit(t.plays[0].card) === suit(played) &&
        !isRuff(t, trump),
    );
    if (!cash) continue;
    const suits = [...new Set(discards.map(suit))];
    add(
      "Squeeze",
      ply - s.trick.length,
      cash.start + 4,
      suits,
      `${SEATS[defender]} squeezed in ${suits.map((x) => SUITS[x].toLowerCase()).join(" and ")}`,
      `On ${cardText(s.trick[0].card)}, every available discard by ${SEATS[defender]} abandons a guard in a threatened suit. ` +
        `The chosen ${cardText(played)} discard promotes ${cardText(winningPlay(cash).card)}, which wins later in this line.`,
      [
        {
          ply: ply - s.trick.length,
          text: `Cash the squeeze card, ${cardText(s.trick[0].card)}.`,
        },
        {
          ply,
          text: `${SEATS[defender]} cannot retain ${suits.length === 2 ? "both" : "all"} guards and discards ${cardText(played)}.`,
        },
        {
          ply: cash.start,
          text: `Cash the promoted ${cardText(winningPlay(cash).card)}.`,
        },
      ],
    );
  }

  for (let i = 0; i < tricks.length - 1; i++) {
    const throwIn = tricks[i],
      defender = throwIn.winner,
      start = throwIn.start + 4,
      s = states[start];
    if (
      !defenders.includes(defender) ||
      !sameSide(throwIn.plays[0].seat, declarer) ||
      s.hands[defender].length < 2
    )
      continue;
    const otherDefender = partner(defender),
      tenaceSeat = (defender + 3) % 4;
    const exitKind = (card) => {
      const strain = suit(card);
      if (strain === trump) return null;
      if (
        trump < 4 &&
        [declarer, dummy].every((d) => !holding(s.hands, d, strain).length) &&
        [declarer, dummy].some((d) => holding(s.hands, d, trump).length) &&
        [declarer, dummy].some((d) => s.hands[d].some((c) => suit(c) !== trump))
      )
        return "ruff and discard";
      const tenace = holding(s.hands, tenaceSeat, strain).map(rank);
      const guards = holding(s.hands, otherDefender, strain).map(rank);
      const allOpp = defenders
        .flatMap((d) => holding(s.hands, d, strain))
        .map(rank);
      if (
        guards.some(
          (g) =>
            tenace.some((high) => high > Math.max(...allOpp)) &&
            tenace.some((low) => low < g && low > rank(card)),
        )
      )
        return "lead into a tenace";
      return null;
    };
    const kinds = s.hands[defender].map(exitKind);
    if (kinds.some((k) => !k)) continue;
    const cleared = [],
      clearanceNotes = [],
      preparation = [];
    const beforeThrow = states[throwIn.start];
    for (let strain = 0; strain < 4; strain++) {
      const bothVoid = [declarer, dummy].every(
        (d) => !holding(beforeThrow.hands, d, strain).length,
      );
      const wasCleared =
        strain === trump
          ? defenders.some((d) => holding(first.hands, d, strain).length) &&
            defenders.every(
              (d) => !holding(beforeThrow.hands, d, strain).length,
            )
          : ([declarer, dummy].some(
              (d) => holding(first.hands, d, strain).length,
            ) &&
              bothVoid) ||
            (holding(first.hands, defender, strain).length > 0 &&
              !holding(beforeThrow.hands, defender, strain).length);
      const earlier = tricks
        .slice(0, i)
        .filter(
          (t) =>
            sameSide(t.plays[0].seat, declarer) &&
            suit(t.plays[0].card) === strain,
        );
      if (wasCleared && earlier.length) {
        cleared.push(strain);
        clearanceNotes.push(
          strain === trump
            ? "The defensive trumps have been drawn."
            : bothVoid
              ? `${SUITS[strain]} have been stripped from both declaring hands.`
              : `${SEATS[defender]} has no ${SUITS[strain].toLowerCase()} left.`,
        );
        preparation.push({
          ply: earlier[0].start,
          text: `Earlier play helps clear ${SUITS[strain].toLowerCase()} before the throw-in.`,
        });
      }
    }
    if (!cleared.length) continue;
    const exit = tricks[i + 1];
    if (!sameSide(exit.winner, declarer)) continue;
    // For a ruff/sluff, require both components to occur in the recorded trick.
    if (
      exitKind(exit.plays[0].card) === "ruff and discard" &&
      (!isRuff(exit, trump) ||
        !exit.plays.some(
          (p) =>
            sameSide(p.seat, declarer) &&
            suit(p.card) !== trump &&
            suit(p.card) !== suit(exit.plays[0].card) &&
            defenders.some((d) =>
              holding(s.hands, d, suit(p.card)).some(
                (c) => rank(c) > rank(p.card),
              ),
            ),
        ))
    )
      continue;
    add(
      "Elimination / endplay",
      throwIn.start,
      exit.start + 4,
      cleared,
      `Clear ${cleared.map((x) => SUITS[x].toLowerCase()).join(" and ")}, then throw in ${SEATS[defender]}`,
      `${clearanceNotes.join(" ")} After winning the throw-in, ` +
        `${SEATS[defender]} has only ${[...new Set(kinds)].join(" or ")} exits. The next trick demonstrates the concession.`,
      [
        ...preparation.sort((a, b) => a.ply - b.ply),
        {
          ply: throwIn.start,
          text: `Give ${SEATS[defender]} the lead after the elimination.`,
        },
        {
          ply: start,
          text: `Every remaining exit is a ${[...new Set(kinds)].join(" or ")}.`,
        },
      ],
    );
  }
  return findings.sort(
    (a, b) => a.start - b.start || a.technique.localeCompare(b.technique),
  );
}
