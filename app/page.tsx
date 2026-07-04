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

const COLORING = {
  // brilliant: "#00BA9A",
  // great: "#6690B4",
  best: "#72AE50",
  excellent: "#6BAC48",
  good: "#89AD70",
  inaccuracy: "#F8C144",
  mistake: "#FF9B58",
  blunder: "#FF392C",
};

export default function Home() {
  const [game] = useState(() => new Chess());
  const [currentFen, setCurrentFen] = useState(game.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const moveIndex = useRef(0);
  const [lastMoved, setLastMoved] = useState("e4");

  const [pieces, setPieces] = useState({});
  const workerRef = useRef<Worker | null>(null);
  const prevEvalRef = useRef<number | null>(null);

  const [moveClassification, setMoveClassification] = useState("best");

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

  const triggerEngine = (fen: string) => {
    workerRef.current?.postMessage({
      type: "START_ANALYSIS",
      fen,
      depth: 17,
    });
  };

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("./workers/stockfish.worker.js", import.meta.url),
    );

    const getWinProbability = (v: number): number => {
      return 1 / (1 + Math.exp(-0.6436 * v));
    };

    workerRef.current.onmessage = (event) => {
      switch (event.data.type) {
        case "BEST_MOVE":
          break;
        case "EVAL":
          if (event.data.scoreType === "cp") {
            const currentEvalPawnUnits = event.data.score / 100;
            const activeColor = event.data.fen.split(" ")[1];

            const isWhiteJustMoved = activeColor === "b";
            const playerEval = isWhiteJustMoved
              ? currentEvalPawnUnits
              : -currentEvalPawnUnits;

            const currentWinProb = getWinProbability(playerEval);

            if (prevEvalRef.current !== null) {
              const prevPlayerEval = isWhiteJustMoved
                ? prevEvalRef.current
                : -prevEvalRef.current;
              const prevWinProb = getWinProbability(prevPlayerEval);

              const probLoss = prevWinProb - currentWinProb;

              let classification = "blunder";
              if (probLoss <= CLASSIFICATION_LIMITS.best)
                classification = "best";
              else if (probLoss <= CLASSIFICATION_LIMITS.excellent)
                classification = "excellent";
              else if (probLoss <= CLASSIFICATION_LIMITS.good)
                classification = "good";
              else if (probLoss <= CLASSIFICATION_LIMITS.inaccuracy)
                classification = "inaccuracy";
              else if (probLoss <= CLASSIFICATION_LIMITS.mistake)
                classification = "mistake";

              console.log(
                `classification: ${classification} (probability loss: ${(probLoss * 100).toFixed(1)}%)`,
              );
              setMoveClassification(classification);
            }

            prevEvalRef.current = currentEvalPawnUnits;
          }
          break;
        default:
          console.log(event.data.type);
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  // custom pieces & move evaluation UI
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
          [piece]: (props) => {
            const currentColor = COLORING[moveClassification] || "#72AE50";
            const isLastMoved = props?.square === lastMoved;

            return (
              <div
                style={
                  isLastMoved ? { backgroundColor: `${currentColor}BF` } : {}
                }
              >
                {isLastMoved && (
                  <div
                    style={{ backgroundColor: currentColor }}
                    className="absolute -top-5 -right-5 size-10 z-100 rounded-full flex items-center justify-center"
                  >
                    <img src={`/move-icons/${moveClassification}.svg`} alt="" />
                  </div>
                )}
                <Image
                  src={`/pieces/${piece.toLowerCase()}.png`}
                  alt={`${piece.startsWith("w") ? "white" : "black"}-${piece.substring(1)}`}
                  width={150}
                  height={150}
                  unoptimized
                />
              </div>
            );
          },
        }),
        {},
      );

      setPieces(finished);
    }

    run();
  }, [moveClassification, lastMoved]);

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
          setLastMoved(moveHistory[moveIndex.current]);
          setCurrentFen(game.fen());
          break;
        case "ArrowRight":
          if (moveIndex.current >= moveHistory.length) return;

          const moveResult = game.move(moveHistory[moveIndex.current]);

          if (moveResult) {
            setLastMoved(moveResult.to);
            moveIndex.current++;
            setCurrentFen(game.fen());
            triggerEngine(game.fen());
          }
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
    <div className="font-sans w-screen h-screen flex p-16">
      <div className="h-full aspect-square">
        <Chessboard options={chessboardOptions} />
      </div>
    </div>
  );
}
