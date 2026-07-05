"use client";

import { Chessboard, defaultPieces } from "react-chessboard";
import { Chess } from "chess.js";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { openingBook, findOpening } from "@chess-openings/eco.json";

const CLASSIFICATION_LIMITS = {
  best: 0,
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
};

const COLORING: Record<string, string> = {
  book: "#A88865",
  best: "#72AE50",
  excellent: "#6BAC48",
  good: "#89AD70",
  inaccuracy: "#F8C144",
  mistake: "#FF9B58",
  blunder: "#FF392C",
};

const DEPTH = 13;

interface MoveMetaData {
  san: string;
  to: string;
  classification: string;
  evalPawnUnits: number | null;
  bestMove: string;
  accuracy: number;
  openingName?: string;
}

export default function Home() {
  const [game] = useState(() => new Chess());
  const [currentFen, setCurrentFen] = useState(game.fen());
  const [moveHistory, setMoveHistory] = useState<MoveMetaData[]>([]);
  const moveIndex = useRef(0);
  const [lastMoved, setLastMoved] = useState<string | null>(null);
  const [bestMove, setBestMove] = useState("...");

  const [pieces, setPieces] = useState({});
  const workerRef = useRef<Worker | null>(null);
  const [moveClassification, setMoveClassification] = useState<string | null>(
    null,
  );
  const [winProbability, setWinProbability] = useState(0.5);

  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState({
    current: 0,
    total: 0,
  });

  const getWinProbability = (v: number): number => {
    return 1 / (1 + Math.exp(-0.6436 * v));
  };

  const calculateMoveAccuracy = (
    prevWinProb: number,
    currentWinProb: number,
  ): number => {
    const probLoss = Math.max(0, prevWinProb - currentWinProb);
    return 100 * Math.exp(-6 * probLoss);
  };

  function convertUciToSan(fen: string, uciMove: string): string {
    if (!uciMove || uciMove === "...") return "...";

    try {
      const tempGame = new Chess(fen);

      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promotion = uciMove.length === 5 ? uciMove.charAt(4) : undefined;

      const moveResult = tempGame.move({ from, to, promotion });
      return moveResult ? moveResult.san : uciMove;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      return uciMove;
    }
  }

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("./workers/stockfish.worker.js", import.meta.url),
    );

    async function loadGame() {
      const openings = await openingBook();

      const res = await fetch("/game.pgn");
      const pgn = await res.text();

      const tempGame = new Chess();
      tempGame.loadPgn(pgn);
      const historySan = tempGame.history();
      const totalMoves = historySan.length;

      setAnalysisProgress({ current: 0, total: totalMoves });

      const structuredHistory: MoveMetaData[] = historySan.map((san) => ({
        san,
        to: "",
        classification: "best",
        evalPawnUnits: null,
        accuracy: 100,
        bestMove: "...",
      }));

      tempGame.reset();
      let isBookPhase = true;

      for (let i = 0; i < totalMoves; i++) {
        const move = tempGame.move(structuredHistory[i].san);
        if (move) {
          structuredHistory[i].to = move.to;
        }

        const currentFenPosition = tempGame.fen();

        let currentOpening = null;
        if (isBookPhase) {
          currentOpening = findOpening(openings, currentFenPosition);
          if (currentOpening) {
            structuredHistory[i].classification = "book";
            structuredHistory[i].accuracy = 100;
            structuredHistory[i].openingName = currentOpening.name;
          } else {
            isBookPhase = false;
          }
        }

        const evaluation: {
          score: number | null;
          scoreType: string;
          bestMove: string;
        } = await new Promise((resolve) => {
          if (!workerRef.current)
            return resolve({ score: 0, scoreType: "cp", bestMove: "..." });

          let evaluationScore: number | null = null;
          let scoreType = "cp";
          let bestMove = "";
          let completed = 0;

          const handleMessage = (event: MessageEvent) => {
            if (event.data.type === "EVAL") {
              evaluationScore = event.data.score;
              scoreType = event.data.scoreType;
              completed++;
            }
            if (event.data.type === "BEST_MOVE") {
              bestMove = event.data.move;
              completed++;
            }

            if (completed === 2) {
              workerRef.current?.removeEventListener("message", handleMessage);
              resolve({
                score: evaluationScore ?? 0,
                scoreType,
                bestMove,
              });
            }
          };

          workerRef.current.addEventListener("message", handleMessage);
          workerRef.current.postMessage({
            type: "START_ANALYSIS",
            fen: currentFenPosition,
            depth: DEPTH,
          });
        });

        if (evaluation.scoreType === "cp" && evaluation.score) {
          const currentEvalPawnUnits = evaluation.score / 100;
          structuredHistory[i].evalPawnUnits = currentEvalPawnUnits;

          const activeColor = currentFenPosition.split(" ")[1];
          const isWhiteJustMoved = activeColor === "b";
          const playerEval = isWhiteJustMoved
            ? currentEvalPawnUnits
            : -currentEvalPawnUnits;
          const currentWinProb = getWinProbability(playerEval);

          let prevEvalPawnUnits: number | null = null;
          if (i > 0) {
            for (let j = i - 1; j >= 0; j--) {
              if (structuredHistory[j]?.evalPawnUnits !== null) {
                prevEvalPawnUnits = structuredHistory[j].evalPawnUnits;
                break;
              }
            }
          }

          if (!currentOpening) {
            let classification = "best";

            if (prevEvalPawnUnits !== null) {
              const prevPlayerEval = isWhiteJustMoved
                ? prevEvalPawnUnits
                : -prevEvalPawnUnits;
              const prevWinProb = getWinProbability(prevPlayerEval);
              const probLoss = prevWinProb - currentWinProb;

              const moveAccuracy = calculateMoveAccuracy(
                prevWinProb,
                currentWinProb,
              );
              structuredHistory[i].accuracy = moveAccuracy;

              classification = "blunder";
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
            } else {
              structuredHistory[i].accuracy = 100;
            }

            structuredHistory[i].classification = classification;
          }

          structuredHistory[i].bestMove = convertUciToSan(
            currentFenPosition,
            evaluation.bestMove,
          );
        }

        setAnalysisProgress((prev) => ({ ...prev, current: i + 1 }));
      }

      const whiteMoves = structuredHistory.filter((_, idx) => idx % 2 === 0);
      const blackMoves = structuredHistory.filter((_, idx) => idx % 2 !== 0);

      const calculateGameAccuracy = (moves: MoveMetaData[]) => {
        if (moves.length === 0) return 100;
        const sumOfSquares = moves.reduce(
          (sum, m) => sum + Math.pow(m.accuracy, 2),
          0,
        );
        return Math.sqrt(sumOfSquares / moves.length);
      };

      const whiteAccuracy = calculateGameAccuracy(whiteMoves);
      const blackAccuracy = calculateGameAccuracy(blackMoves);

      console.log(whiteAccuracy, blackAccuracy);

      setMoveHistory(structuredHistory);
      game.reset();
      setIsAnalyzing(false);
    }

    loadGame();

    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (isAnalyzing) return;

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
          [piece]: (props: { square: string }) => {
            const currentColor =
              COLORING[moveClassification || "best"] || "#72AE50";
            const isLastMoved = props?.square === lastMoved;

            return (
              <div
                style={
                  isLastMoved ? { backgroundColor: `${currentColor}BF` } : {}
                }
              >
                {isLastMoved && moveClassification && (
                  <div
                    style={{ backgroundColor: currentColor }}
                    className="absolute -top-5 -right-5 size-10 z-100 rounded-full flex items-center justify-center"
                  >
                    <Image
                      src={`/move-icons/${moveClassification}.svg`}
                      alt={moveClassification}
                      width={150}
                      height={150}
                    />
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
  }, [moveClassification, lastMoved, isAnalyzing]);

  useEffect(() => {
    if (isAnalyzing) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
      }

      switch (event.key) {
        case "ArrowLeft":
          if (moveIndex.current <= 0) return;

          game.undo();
          moveIndex.current--;

          if (moveIndex.current === 0) {
            setLastMoved(null);
            setMoveClassification(null);
            setWinProbability(0.5);
            setBestMove("...");
          } else {
            const prevMove = moveHistory[moveIndex.current - 1];
            setLastMoved(prevMove.to);
            setMoveClassification(prevMove.classification);
            setBestMove(prevMove.bestMove);

            if (prevMove.evalPawnUnits !== null) {
              const activeColor = game.fen().split(" ")[1];
              const isWhiteJustMoved = activeColor === "b";
              const playerEval = isWhiteJustMoved
                ? prevMove.evalPawnUnits
                : -prevMove.evalPawnUnits;
              const currentWinProb = getWinProbability(playerEval);
              setWinProbability(
                isWhiteJustMoved ? 1 - currentWinProb : currentWinProb,
              );
            }
          }

          setCurrentFen(game.fen());
          break;

        case "ArrowRight":
          if (moveIndex.current >= moveHistory.length) return;

          const nextMoveData = moveHistory[moveIndex.current];
          const moveResult = game.move(nextMoveData.san);

          if (moveResult) {
            moveIndex.current++;
            setLastMoved(moveResult.to);
            setCurrentFen(game.fen());
            setMoveClassification(nextMoveData.classification);
            setBestMove(nextMoveData.bestMove);

            if (nextMoveData.evalPawnUnits !== null) {
              const activeColor = game.fen().split(" ")[1];
              const isWhiteJustMoved = activeColor === "b";
              const playerEval = isWhiteJustMoved
                ? nextMoveData.evalPawnUnits
                : -nextMoveData.evalPawnUnits;
              const currentWinProb = getWinProbability(playerEval);
              setWinProbability(
                isWhiteJustMoved ? 1 - currentWinProb : currentWinProb,
              );
            }
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveHistory, game, isAnalyzing]);

  const chessboardOptions = {
    pieces: {
      ...defaultPieces,
      ...pieces,
    },
    position: currentFen,
    lightSquareStyle: { backgroundColor: "#eeebe1" },
    darkSquareStyle: { backgroundColor: "#7691a3" },
    boardOrientation: "black" as const,
    animationDurationInMs: 225,
  };

  if (isAnalyzing) {
    const percentage = analysisProgress.total
      ? Math.round((analysisProgress.current / analysisProgress.total) * 100)
      : 0;

    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-stone-200/50 text-black font-sans gap-4">
        <p className="text-stone-700 text-sm">Stockfish is analysing...</p>
        <div className="w-64 bg-stone-300 h-2 rounded-full overflow-hidden">
          <div
            className="bg-[#7691a3] h-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-stone-700 text-sm">
          {analysisProgress.current} / {analysisProgress.total} ({percentage}
          %) — Depth {DEPTH}
        </p>
      </div>
    );
  }

  return (
    <div className="font-sans w-screen h-screen flex p-16 gap-4 bg-stone-200/50">
      <div className="h-full w-10 bg-white shadow-sm rounded-md flex items-end overflow-clip">
        <div
          className="w-full bg-[#383532] transition-[height] duration-500 ease-out"
          style={{ height: `${winProbability * 100}%` }}
        ></div>
      </div>
      <div className="h-full aspect-square shadow-sm rounded-md overflow-clip">
        <Chessboard options={chessboardOptions} />
      </div>
      <div className="h-full flex-1 flex flex-col items-center justify-center bg-neutral-200 rounded-md shadow-sm">
        <div className="flex gap-4 items-center">
          <div className="size-11">
            <Image
              src={`/move-icons/best.svg`}
              alt="best move symbol"
              width={150}
              height={150}
            />
          </div>
          <div>
            <h1 className="font-semibold text-2xl">{bestMove}</h1>
            <h2 className="text-sm">was the best move</h2>
          </div>
        </div>
      </div>
    </div>
  );
}
