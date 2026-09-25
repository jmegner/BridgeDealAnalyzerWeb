import createDDS from "../vendor/dds/dds.js";
import { masks, rank, suit, scoreContract } from "./bridge.js";

export async function createSolver(options = {}) {
  const module = await createDDS(options);
  const input = module._malloc(80),
    trick = module._malloc(12),
    output = module._malloc(256),
    error = module._malloc(80);
  function check(code) {
    if (code !== 1) {
      module._bridge_error(code, error);
      throw new Error(`DDS: ${module.UTF8ToString(error)} (${code})`);
    }
  }
  const writeHands = (hands) => module.HEAP32.set(masks(hands), input >> 2);
  return {
    reset() {
      module._bridge_reset();
    },
    table(hands) {
      writeHands(hands);
      check(module._bridge_table(input, output));
      return Array.from(
        module.HEAP32.subarray(output >> 2, (output >> 2) + 20),
      );
    },
    par(table, dealer, vulnerable) {
      module.HEAP32.set(table, input >> 2);
      check(module._bridge_par(input, dealer, vulnerable, output));
      const data = module.HEAP32.slice(output >> 2, (output >> 2) + 52);
      const contracts = [];
      for (let i = 0; i < data[1]; i++) {
        const [level, denomination, seats, under, over] = data.slice(
          2 + 5 * i,
          7 + 5 * i,
        );
        if (level === 0) continue;
        const declarers = seats === 4 ? [0, 2] : seats === 5 ? [1, 3] : [seats];
        for (const declarer of declarers) {
          const c = {
            level,
            trump: [4, 0, 1, 2, 3][denomination],
            declarer,
            doubled: under > 0 ? 1 : 0,
            under,
            over,
          };
          const tricks = table[c.trump * 4 + declarer];
          const scoreNS =
            scoreContract(c, tricks, vulnerable) * (declarer % 2 ? -1 : 1);
          if (scoreNS !== data[0])
            throw new Error("DDS par score and contract score disagree.");
          contracts.push(c);
        }
      }
      return { score: data[0], contracts };
    },
    solve(state) {
      writeHands(state.hands);
      module.HEAP32.set(
        state.trick.map((p) => p.card),
        trick >> 2,
      );
      check(
        module._bridge_solve(
          state.trump,
          state.leader,
          input,
          trick,
          state.trick.length,
          output,
        ),
      );
      const data = module.HEAP32.slice(output >> 2, (output >> 2) + 53),
        moves = [];
      for (let i = 0; i < data[0]; i++) {
        const [s, r, equals, score] = data.slice(1 + 4 * i, 5 + 4 * i);
        moves.push({ card: s * 13 + r - 2, score, order: i });
        for (let eq = 2; eq < r; eq++)
          if (equals & (1 << eq))
            moves.push({ card: s * 13 + eq - 2, score, order: i });
      }
      // Preserve DDS's move ordering; prefer the lowest equivalent card.
      return moves.sort(
        (a, b) =>
          b.score - a.score ||
          a.order - b.order ||
          rank(a.card) - rank(b.card) ||
          suit(a.card) - suit(b.card),
      );
    },
    dispose() {
      [input, trick, output, error].forEach((p) => module._free(p));
    },
  };
}
