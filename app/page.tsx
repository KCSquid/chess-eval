"use client";

import { Chessboard, defaultPieces } from "react-chessboard";
import { Chess } from "chess.js";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const CLASSIFICATION_LIMITS = {
  best: 0,
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
};

export default function Home() {
  const [game] = useState(() => new Chess());
  const [currentFen, setCurrentFen] = useState(game.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const moveIndex = useRef(0);

  const [pieces, setPieces] = useState({});
  const workerRef = useRef<Worker | null>(null);
  const prevEvalRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadGame() {
      const res = await fetch("/game.pgn");
      const pgn = await res.text();
      game.loadPgn(pgn);

      const history = game.history();
      setMoveHistory(history);

      game.reset();
    }

    loadGame();
  }, []);

  // const triggerEngine = (currentFen: string) => {
  //   workerRef.current?.postMessage({
  //     type: "START_ANALYSIS",
  //     fen: currentFen,
  //     depth: 12,
  //   });
  // };

  // const makeComputerMove = (moveShortString: string, currentFen: string) => {
  //   const newGame = new Chess(currentFen);
  //   try {
  //     newGame.move({
  //       from: moveShortString.slice(0, 2),
  //       to: moveShortString.slice(2, 4),
  //       promotion: moveShortString.slice(4, 5) || undefined,
  //     });
  //     setGame(newGame);
  //   } catch (e) {
  //     console.error("Invalid engine move attempted", e);
  //   }
  // };

  // useEffect(() => {
  //   workerRef.current = new Worker(
  //     new URL("./workers/stockfish.worker.js", import.meta.url),
  //   );

  //   workerRef.current.onmessage = (event) => {
  //     switch (event.data.type) {
  //       case "BEST_MOVE":
  //         makeComputerMove(event.data.move, event.data.fen);
  //         break;
  //       case "EVAL":
  //         if (event.data.scoreType === "cp") {
  //           const currentEvalPawnUnits = event.data.score / 100;
  //           const activeColor = event.data.fen.split(" ")[1];

  //           if (prevEvalRef.current !== null) {
  //             const evalLoss =
  //               activeColor === "w"
  //                 ? currentEvalPawnUnits - prevEvalRef.current
  //                 : prevEvalRef.current - currentEvalPawnUnits;

  //             console.log(activeColor, currentEvalPawnUnits, prevEvalRef.current);

  //             let classification = "blunder";
  //             if (evalLoss <= CLASSIFICATION_LIMITS.best)
  //               classification = "best";
  //             else if (evalLoss <= CLASSIFICATION_LIMITS.excellent)
  //               classification = "excellent";
  //             else if (evalLoss <= CLASSIFICATION_LIMITS.good)
  //               classification = "good";
  //             else if (evalLoss <= CLASSIFICATION_LIMITS.inaccuracy)
  //               classification = "inaccuracy";
  //             else if (evalLoss <= CLASSIFICATION_LIMITS.mistake)
  //               classification = "mistake";

  //             console.log(
  //               `Move Classification: ${classification} (Eval loss: ${evalLoss.toFixed(2)})`,
  //             );
  //           }
  //           prevEvalRef.current = currentEvalPawnUnits;
  //         }
  //         break;
  //       default:
  //         console.log(event.data.type);
  //     }
  //   };

  //   return () => workerRef.current?.terminate();
  // }, []);

  // load custom pieces
  useEffect(() => {
    function run() {
      const pieceTypes = [
        "wK",
        "wQ",
        "wR",
        "wB",
        "wN",
        "wP",
        "bK",
        "bQ",
        "bR",
        "bB",
        "bN",
        "bP",
      ];

      const finished = pieceTypes.reduce(
        (acc, piece) => ({
          ...acc,
          [piece]: () => (
            <Image
              src={`/pieces/${piece.toLowerCase()}.png`}
              alt={`${piece.startsWith("w") ? "white" : "black"}-${piece.substring(1)}`}
              width={150}
              height={150}
              unoptimized
            />
          ),
        }),
        {},
      );

      setPieces(finished);
    }

    run();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
      }

      switch (event.key) {
        case "ArrowLeft":
          if (moveIndex.current <= 0) return;
          game.undo();
          moveIndex.current--;
          setCurrentFen(game.fen());
          break;
        case "ArrowRight":
          if (moveIndex.current >= moveHistory.length) return;
          game.move(moveHistory[moveIndex.current]);
          moveIndex.current++;
          setCurrentFen(game.fen());
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveHistory]);

  const chessboardOptions = {
    pieces: {
      ...defaultPieces,
      ...pieces,
    },
    position: game.fen(),
    lightSquareStyle: {
      backgroundColor: "#eeebe1",
    },
    darkSquareStyle: {
      backgroundColor: "#7691a3",
    },
    boardOrientation: "black",
  };

  return (
    <div className="w-screen h-screen flex p-16">
      <div className="h-full aspect-square">
        <Chessboard options={chessboardOptions} />
      </div>
    </div>
  );
}
