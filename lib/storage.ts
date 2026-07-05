export interface SavedGame {
  id: string;
  pgn: string;
  createdAt: number;
}

export const GameStorage = {
  save: (pgn: string): string => {
    const id = Math.random().toString(36).substring(2, 9);
    const games = GameStorage.getAll();

    games.push({ id, pgn, createdAt: Date.now() });
    localStorage.setItem("chess_games", JSON.stringify(games));

    return id;
  },

  get: (id: string): SavedGame | undefined => {
    const games = GameStorage.getAll();
    return games.find((g) => g.id === id);
  },

  getAll: (): SavedGame[] => {
    if (typeof window === "undefined") return [];
    const data = localStorage.getItem("chess_games");
    return data ? JSON.parse(data) : [];
  },
};
