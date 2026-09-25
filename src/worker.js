import { createSolver } from "./solver.js";
import { analyzeBoard } from "./analyze.js";
let solverPromise;
self.onmessage = async ({ data }) => {
  if (data.type !== "analyze") return;
  try {
    solverPromise ??= createSolver();
    const solver = await solverPromise;
    const analysis = analyzeBoard(data.board, solver, (progress) =>
      self.postMessage({ type: "progress", id: data.id, ...progress }),
    );
    self.postMessage({ type: "result", id: data.id, analysis });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: data.id,
      error: error.message || String(error),
    });
  }
};
