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

const DEPTH = 17;

interface MoveMetaData {
  san: string;
  to: string;
  classification: string;
  evalPawnUnits: number | null;
  bestMove: string;
  accuracy: number;
  openingName?: string;
  beforeEval?: number;
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

  const [playerAccuracy, setPlayerAccuracy] = useState({ white: 0, black: 0 });

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
        const prevFen = tempGame.fen();

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
            fen: prevFen,
            depth: DEPTH,
          });
        });

        if (evaluation.scoreType === "cp" && evaluation.score !== null) {
          const positionEval = evaluation.score / 100;

          structuredHistory[i].bestMove = convertUciToSan(
            prevFen,
            evaluation.bestMove,
          );

          structuredHistory[i].beforeEval = positionEval;
        }

        setAnalysisProgress((prev) => ({ ...prev, current: i + 1 }));
      }

      for (let i = 0; i < totalMoves; i++) {
        const currentMove = structuredHistory[i];
        const nextMove = structuredHistory[i + 1];

        const evalBefore = currentMove.beforeEval ?? 0;
        const evalAfter = nextMove
          ? (nextMove.beforeEval ?? evalBefore)
          : evalBefore;

        currentMove.evalPawnUnits = evalAfter;

        if (currentMove.classification === "book") continue;

        const isWhiteMove = i % 2 === 0;
        const playerEvalBefore = isWhiteMove ? evalBefore : -evalBefore;
        const playerEvalAfter = isWhiteMove ? evalAfter : -evalAfter;

        const prevWinProb = getWinProbability(playerEvalBefore);
        const currentWinProb = getWinProbability(playerEvalAfter);
        const probLoss = prevWinProb - currentWinProb;

        currentMove.accuracy = calculateMoveAccuracy(
          prevWinProb,
          currentWinProb,
        );

        let classification = "blunder";
        if (
          probLoss <= CLASSIFICATION_LIMITS.best ||
          structuredHistory[i].bestMove === structuredHistory[i].san
        )
          classification = "best";
        else if (probLoss <= CLASSIFICATION_LIMITS.excellent)
          classification = "excellent";
        else if (probLoss <= CLASSIFICATION_LIMITS.good)
          classification = "good";
        else if (probLoss <= CLASSIFICATION_LIMITS.inaccuracy)
          classification = "inaccuracy";
        else if (probLoss <= CLASSIFICATION_LIMITS.mistake)
          classification = "mistake";

        currentMove.classification = classification;
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

      setPlayerAccuracy({ white: whiteAccuracy, black: blackAccuracy });

      setMoveHistory(structuredHistory);
      game.reset();
      setIsAnalyzing(false);
    }

    loadGame();

    return () => workerRef.current?.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-stone-200/50 text-[#383532] font-sans gap-6">
        <div className="relative w-24 h-32">
          <svg
            viewBox="0 0 22 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-sm"
          >
            <defs>
              <clipPath id="water-clip">
                <rect
                  x="0"
                  y={32 - (percentage / 100) * 32}
                  width="22"
                  height={(percentage / 100) * 32}
                  className="transition-all duration-300 ease-out"
                />
              </clipPath>
            </defs>

            <path
              d="M18.7635 23.0905C13.3587 18.9895 13.9594 15.4295 13.8917 13.9663H17.1875C17.5725 13.2547 17.7692 12.5937 17.7692 11.7726L14.0335 9.3242C15.3323 8.38735 16.1785 6.86946 16.1785 5.15157C16.1785 2.98946 14.8394 1.13893 12.9419 0.374723C12.3433 0.132618 8.1104 13.9663 8.1104 13.9663C8.09559 14.2842 8.09136 14.6989 8.09136 15.1979C8.09136 16.5726 11.4844 16.3642 11.3046 17.5768C11.0339 19.3916 10.9767 20.7705 9.40713 25.1326C8.34732 28.0758 1.27982 25.1326 0.774246 26.5768C0.423092 27.5831 0.236938 28.7095 0.236938 29.9221C0.236938 30.0526 0.5204 32 11.0021 32C21.4839 32 21.7673 30.0526 21.7673 29.9221C21.7673 26.9642 20.6567 24.5242 18.7656 23.0905H18.7635Z M10.8097 24.9305C11.3935 22.2926 11.9097 19.48 12.2227 17.7937C12.6141 15.6905 9.40928 15.3158 8.09139 15.1221C8.03216 16.9179 7.5287 19.8316 3.23447 23.0884C2.07736 23.9663 1.21428 25.221 0.717163 26.741C1.87639 27.3032 3.42274 27.6379 5.80678 27.6379C7.3362 27.6379 10.1687 27.821 10.8075 24.9284L10.8097 24.9305Z M13.0604 13.9663C13.5681 12.6547 13.5025 11.7726 13.5025 11.7726L11.3871 9.32421C13.6379 8.36842 14.9918 6.57053 14.9918 4.48C14.9918 2.80842 14.1921 1.32421 12.9525 0.383158C12.3496 0.138948 11.6896 0.00210571 11 0.00210571C8.14214 0.00210571 5.82368 2.30737 5.82368 5.15368C5.82368 6.87158 6.66983 8.38947 7.96868 9.32632L4.23291 11.7747C4.23291 12.5958 4.42753 13.2568 4.81464 13.9684H13.0625L13.0604 13.9663Z M10.7038 1.05052C13.6886 1.51157 9.32879 4.95789 7.95591 4.79578C6.64648 4.63999 7.90725 0.61894 10.7038 1.05052Z"
              fill="#d6d3d1"
            />

            <path
              d="M18.7635 23.0905C13.3587 18.9895 13.9594 15.4295 13.8917 13.9663H17.1875C17.5725 13.2547 17.7692 12.5937 17.7692 11.7726L14.0335 9.3242C15.3323 8.38735 16.1785 6.86946 16.1785 5.15157C16.1785 2.98946 14.8394 1.13893 12.9419 0.374723C12.3433 0.132618 8.1104 13.9663 8.1104 13.9663C8.09559 14.2842 8.09136 14.6989 8.09136 15.1979C8.09136 16.5726 11.4844 16.3642 11.3046 17.5768C11.0339 19.3916 10.9767 20.7705 9.40713 25.1326C8.34732 28.0758 1.27982 25.1326 0.774246 26.5768C0.423092 27.5831 0.236938 28.7095 0.236938 29.9221C0.236938 30.0526 0.5204 32 11.0021 32C21.4839 32 21.7673 30.0526 21.7673 29.9221C21.7673 26.9642 20.6567 24.5242 18.7656 23.0905H18.7635Z M10.8097 24.9305C11.3935 22.2926 11.9097 19.48 12.2227 17.7937C12.6141 15.6905 9.40928 15.3158 8.09139 15.1221C8.03216 16.9179 7.5287 19.8316 3.23447 23.0884C2.07736 23.9663 1.21428 25.221 0.717163 26.741C1.87639 27.3032 3.42274 27.6379 5.80678 27.6379C7.3362 27.6379 10.1687 27.821 10.8075 24.9284L10.8097 24.9305Z M13.0604 13.9663C13.5681 12.6547 13.5025 11.7726 13.5025 11.7726L11.3871 9.32421C13.6379 8.36842 14.9918 6.57053 14.9918 4.48C14.9918 2.80842 14.1921 1.32421 12.9525 0.383158C12.3496 0.138948 11.6896 0.00210571 11 0.00210571C8.14214 0.00210571 5.82368 2.30737 5.82368 5.15368C5.82368 6.87158 6.66983 8.38947 7.96868 9.32632L4.23291 11.7747C4.23291 12.5958 4.42753 13.2568 4.81464 13.9684H13.0625L13.0604 13.9663Z M10.7038 1.05052C13.6886 1.51157 9.32879 4.95789 7.95591 4.79578C6.64648 4.63999 7.90725 0.61894 10.7038 1.05052Z"
              fill="#7691a3"
              clipPath="url(#water-clip)"
            />
          </svg>
        </div>

        <div className="text-center flex flex-col gap-1">
          <p className="text-sm font-medium text-stone-500">
            Stockfish is analyzing...
          </p>
          <p className="text-xs text-stone-400">
            {analysisProgress.current} / {analysisProgress.total} ({percentage}
            %) — Depth {DEPTH}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans text-[#383532] w-screen h-screen flex p-16 gap-4 bg-stone-200/50">
      <div className="h-full w-10 bg-white shadow-sm rounded-md flex items-end overflow-clip">
        <div
          className="w-full bg-[#383532] transition-[height] duration-500 ease-out"
          style={{ height: `${winProbability * 100}%` }}
        ></div>
      </div>
      <div className="h-full aspect-square shadow-sm rounded-md overflow-clip">
        <Chessboard options={chessboardOptions} />
      </div>
      <div className="h-full flex-1 flex flex-col gap-8 items-center justify-center bg-neutral-200 rounded-md shadow-sm">
        <h2 className="text-sm">Player Accuracy</h2>
        <div className="flex gap-8">
          <div className="rounded-md shadow-sm bg-white py-2 w-20 text-center">
            <h1 className="font-semibold text-2xl">
              {playerAccuracy.white.toFixed(1)}
            </h1>
          </div>
          <div className="rounded-md shadow-sm bg-[#383532] py-2 w-20 text-center">
            <h1 className="font-semibold text-2xl text-white">
              {playerAccuracy.black.toFixed(1)}
            </h1>
          </div>
        </div>

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
