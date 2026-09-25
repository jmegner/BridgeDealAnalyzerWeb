// Thin, single-threaded DDS3 adapter. No DDS source changes are required.
#include <api/dll.h>
#include <api/solve_board.hpp>
#include <api/calc_dd_table.hpp>
#include <solver_context/solver_context.hpp>
#include <cstring>
#include <emscripten.h>

namespace {
SolverContext& context() {
    static SolverContext ctx(SolverConfig{
        .tt_kind_ = TTKind::Small,
        .tt_mem_default_mb_ = 16,
        .tt_mem_maximum_mb_ = 64});
    return ctx;
}
}

extern "C" {
EMSCRIPTEN_KEEPALIVE
int bridge_table(const unsigned* masks, int* output) {
    DdTableDeal deal{};
    std::memcpy(deal.cards, masks, sizeof(deal.cards));
    DdTableResults table{};
    context().reset_for_solve();
    const int rc = calc_dd_table(context(), deal, &table);
    if (rc == RETURN_NO_FAULT) std::memcpy(output, table.res_table, sizeof(table.res_table));
    return rc;
}

EMSCRIPTEN_KEEPALIVE
int bridge_solve(int trump, int leader, const unsigned* masks,
                 const int* trick, int count, int* output) {
    if (count < 0 || count > 3) return -1;
    Deal deal{};
    deal.trump = trump;
    deal.first = leader;
    std::memcpy(deal.remainCards, masks, sizeof(deal.remainCards));
    for (int i = 0; i < count; ++i) {
        deal.currentTrickSuit[i] = trick[i] / 13;
        deal.currentTrickRank[i] = trick[i] % 13 + 2;
    }
    FutureTricks result{};
    const int rc = solve_board(context(), deal, -1, 3, 1, &result);
    if (rc != RETURN_NO_FAULT) return rc;
    output[0] = result.cards;
    for (int i = 0; i < result.cards; ++i) {
        output[1 + 4*i] = result.suit[i];
        output[2 + 4*i] = result.rank[i];
        output[3 + 4*i] = result.equals[i];
        output[4 + 4*i] = result.score[i];
    }
    return rc;
}

EMSCRIPTEN_KEEPALIVE
int bridge_par(const int* values, int dealer, int vulnerable, int* output) {
    DdTableResults table{};
    std::memcpy(table.res_table, values, sizeof(table.res_table));
    ParResultsMaster result{};
    const int rc = DealerParBin(&table, &result, dealer, vulnerable);
    if (rc != RETURN_NO_FAULT) return rc;
    output[0] = result.score;
    output[1] = result.number;
    for (int i = 0; i < result.number; ++i) {
        const auto& c = result.contracts[i];
        output[2 + 5*i] = c.level;
        output[3 + 5*i] = c.denom;
        output[4 + 5*i] = c.seats;
        output[5 + 5*i] = c.under_tricks;
        output[6 + 5*i] = c.over_tricks;
    }
    return rc;
}

EMSCRIPTEN_KEEPALIVE
void bridge_reset() { context().reset_for_solve(); }

EMSCRIPTEN_KEEPALIVE
void bridge_error(int code, char* output) { ErrorMessage(code, output); }
}
