let engine;
let currentFen;

if (typeof window !== "undefined") {
  engine = new Worker("/stockfish.js");

  engine.onmessage = (event) => {
    const line = event.data;

    if (line.startsWith("bestmove")) {
      const move = line.split(" ")[1];
      postMessage({ type: "BEST_MOVE", move, fen: currentFen });
    } else if (line.startsWith("info depth 17")) {
      const parts = line.split(" ");
      const scoreIndex = parts.indexOf("score");

      if (scoreIndex !== -1) {
        const type = parts[scoreIndex + 1];
        let value = parseInt(parts[scoreIndex + 2], 10);

        const isBlack = currentFen.split(" ")[1] === "b";
        if (isBlack) {
          value = -value;
        }

        postMessage({
          type: "EVAL",
          score: value,
          scoreType: type,
          fen: currentFen,
        });
      }
    }
  };
}

onmessage = (event) => {
  if (event.data.type === "START_ANALYSIS") {
    currentFen = event.data.fen;
    engine.postMessage("uci");
    engine.postMessage("ucinewgame");
    engine.postMessage(`position fen ${currentFen}`);
    engine.postMessage(`go depth ${event.data.depth || 12}`);
  }
};
