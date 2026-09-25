export const SEATS = ["North", "East", "South", "West"];
export const SHORT_SEATS = ["N", "E", "S", "W"];
export const SUITS = ["Spades", "Hearts", "Diamonds", "Clubs", "Notrump"];
export const SYMBOLS = ["♠", "♥", "♦", "♣", "NT"];
export const RANKS = "23456789TJQKA";
export const TECHNIQUES = [
  "Squeeze",
  "Elimination / endplay",
  "Trump coup",
  "Dummy reversal",
  "Crossruff",
];
export const suit = (card) => Math.floor(card / 13);
export const rank = (card) => (card % 13) + 2;
export const cardText = (card) => SYMBOLS[suit(card)] + RANKS[card % 13];
export const partner = (seat) => (seat + 2) % 4;
export const sameSide = (a, b) => a % 2 === b % 2;
export const holding = (hands, seat, strain) =>
  hands[seat].filter((c) => suit(c) === strain);
export const isVulnerable = (vul, seat) =>
  vul === 1 || vul === (seat % 2 === 0 ? 2 : 3);

export function masks(hands) {
  const out = new Int32Array(16);
  hands.forEach((hand, seat) =>
    hand.forEach((card) => {
      out[seat * 4 + suit(card)] |= 1 << rank(card);
    }),
  );
  return out;
}

export function initialState(hands, trump, declarer) {
  return {
    hands: hands.map((h) => [...h]),
    trump,
    declarer,
    leader: (declarer + 1) % 4,
    trick: [],
    completed: [],
    won: [0, 0],
    ply: 0,
  };
}
export const nextSeat = (state) => (state.leader + state.trick.length) % 4;
export function legalCards(state) {
  const hand = state.hands[nextSeat(state)];
  const follow = state.trick.length
    ? hand.filter((c) => suit(c) === suit(state.trick[0].card))
    : [];
  return follow.length ? follow : [...hand];
}
export function trickWinner(trick, trump) {
  let winner = trick[0];
  for (const play of trick.slice(1)) {
    if (
      (suit(play.card) === suit(winner.card) &&
        rank(play.card) > rank(winner.card)) ||
      (suit(play.card) === trump && suit(winner.card) !== trump)
    )
      winner = play;
  }
  return winner.seat;
}
export function playCard(state, card) {
  if (!legalCards(state).includes(card))
    throw new Error(`Illegal play: ${cardText(card)}`);
  const seat = nextSeat(state);
  const hands = state.hands.map((h) => [...h]);
  hands[seat].splice(hands[seat].indexOf(card), 1);
  const trick = [...state.trick, { seat, card }];
  const next = {
    ...state,
    hands,
    trick,
    won: [...state.won],
    completed: [...state.completed],
    ply: state.ply + 1,
  };
  if (trick.length === 4) {
    const winner = trickWinner(trick, state.trump);
    next.completed.push({ plays: trick, winner, start: state.ply - 3 });
    next.won[winner % 2]++;
    next.leader = winner;
    next.trick = [];
  }
  return next;
}
export function replay(hands, contract, cards) {
  const states = [initialState(hands, contract.trump, contract.declarer)];
  for (const card of cards) states.push(playCard(states.at(-1), card));
  return states;
}
export function contractText(c) {
  return c
    ? `${c.level}${SYMBOLS[c.trump]}${c.doubled ? "×" : ""} ${SHORT_SEATS[c.declarer]}`
    : "Passed out";
}
export function resultText(c, tricks) {
  const delta = tricks - c.level - 6;
  return delta === 0 ? "=" : delta > 0 ? `+${delta}` : `−${-delta}`;
}
export function scoreContract(c, tricks, vul) {
  const vulnerable = isVulnerable(vul, c.declarer);
  const delta = tricks - c.level - 6;
  if (delta < 0) {
    const down = -delta;
    if (!c.doubled) return -down * (vulnerable ? 100 : 50);
    const penalty = vulnerable
      ? 200 + 300 * (down - 1)
      : 100 + 200 * Math.min(2, down - 1) + 300 * Math.max(0, down - 3);
    return -penalty * (c.doubled === 2 ? 2 : 1);
  }
  const multiplier = c.doubled === 2 ? 4 : c.doubled ? 2 : 1;
  const unit = c.trump === 2 || c.trump === 3 ? 20 : 30;
  const trickPoints = (c.level * unit + (c.trump === 4 ? 10 : 0)) * multiplier;
  const bonus = trickPoints >= 100 ? (vulnerable ? 500 : 300) : 50;
  const slam =
    c.level === 6
      ? vulnerable
        ? 750
        : 500
      : c.level === 7
        ? vulnerable
          ? 1500
          : 1000
        : 0;
  const over = c.doubled
    ? delta * (vulnerable ? 200 : 100) * (c.doubled === 2 ? 2 : 1)
    : delta * unit;
  return (
    trickPoints +
    bonus +
    slam +
    over +
    (c.doubled ? 50 * (c.doubled === 2 ? 2 : 1) : 0)
  );
}
