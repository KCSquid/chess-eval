"use client";

import { GameStorage } from "@/lib/storage";
import { IconScript } from "@tabler/icons-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [localPgn, setLocalPgn] = useState("");
  const [username, setUsername] = useState("");

  const handleAnalyze = () => {
    if (!localPgn.trim()) return;
    const gameId = GameStorage.save(localPgn);
    router.push(`/analyze/${gameId}${username && `?player=${username}`}`);
  };

  return (
    <div className="font-sans text-[#383532] w-screen min-h-screen flex flex-col items-center justify-center p-16 gap-4 bg-stone-200/50">
      <div className="bg-stone-200/50 shadow-sm w-full max-w-2xl rounded-md flex flex-col gap-4 p-8">
        <div className="flex justify-between gap-2">
          <div className="flex flex-col items-center justify-center bg-stone-200 transition-colors cursor-pointer py-8 w-full flex-1 rounded-sm gap-2 opacity-50">
            <Image
              src="https://play-lh.googleusercontent.com/a7R5nyeaX8lIEWdBOxjlvbyq9LcFwh3XMvNtBPEKR3LPGgdvgGrec4sJwn8tUaaSkw"
              alt="chess.com"
              className="rounded-sm size-12"
              width={512}
              height={512}
            />
            <h1 className="font-semibold text-xl">Chess.com</h1>
          </div>
          <div className="flex flex-col items-center justify-center bg-stone-200 transition-colors cursor-pointer py-8 w-full flex-1 rounded-sm gap-2 opacity-50">
            <Image
              src="https://play-lh.googleusercontent.com/Mb4lciJeEQrd-xcVKz8F0vcyCkIduCld9r6-c5EiHYEo4nu76_RCTxD7_AV7HEXsgq0SmoJbBPb5qt1IAvMm"
              alt="lichess.org"
              className="rounded-sm size-12"
              width={512}
              height={512}
            />
            <h1 className="font-semibold text-xl">Lichess.org</h1>
          </div>
          <div className="flex flex-col items-center justify-center bg-stone-200 hover:bg-stone-300 transition-colors cursor-pointer py-8 w-full flex-1 rounded-sm gap-1">
            <IconScript stroke={2} className="size-12" />
            <h1 className="font-semibold text-xl">PGN</h1>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Username</h2>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full outline-none border border-stone-300 bg-stone-200 rounded-sm p-2 px-2.5 focus:border-[#7691a3]/50 focus:bg-[#7691a3]/10 transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">PGN</h2>
          <textarea
            value={localPgn}
            onChange={(e) => setLocalPgn(e.target.value)}
            className="w-full h-48 outline-none border border-stone-300 bg-stone-200 rounded-sm p-2 px-2.5 focus:border-[#7691a3]/50 focus:bg-[#7691a3]/10 transition-colors resize-none"
          />
        </div>
        <button
          className="w-full py-2 text-center bg-[#7691a3] text-stone-50 font-bold rounded-sm cursor-pointer"
          onClick={handleAnalyze}
        >
          Upload
        </button>
      </div>
    </div>
  );
}
