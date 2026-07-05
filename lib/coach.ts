const COACH_PREFIXES = [
  "That move is",
  "This is",
  "You played",
  "Honestly, that looks like",
  "We are looking at",
  "That choice is",
];

const CLASSIFICATION_VARIATIONS: Record<string, string[]> = {
  book: [
    "straight out of the textbook",
    "established opening theory",
    "a classic standard line",
    "well-trodden theoretical ground",
    "deeply studied opening preparation",
  ],
  best: [
    "the absolute sharpest continuation",
    "the objective best find here",
    "precisely what the position demands",
    "the top engine choice",
    "an incredibly strong find",
  ],
  excellent: [
    "a highly commendable idea",
    "a strong alternative",
    "excellent chess right there",
    "a very high-quality continuation",
    "completely sound logic",
  ],
  good: [
    "playable, but leaves money on the table",
    "fine, though you missed a sharper line",
    "decent, but lacking real ambition",
    "okay, but you had stronger alternatives",
    "acceptable, but far from optimal",
  ],
  inaccuracy: [
    "a slight slip in accuracy",
    "a minor positional misstep",
    "imprecise, giving away a bit of control",
    "suboptimal, letting the tension slip",
    "a tactical inaccuracy",
  ],
  mistake: [
    "a genuine tactical mistake",
    "a clear misjudgment of the position",
    "a serious positional error",
    "a wrong turn that compromises your edge",
    "a mistake that hands over the initiative",
  ],
  blunder: [
    "a catastrophic blunder",
    "a total tactical blindspot",
    "a fatal error that spoils the game",
    "an absolute disaster of a move",
    "a massive oversight",
  ],
};

export function getCoachFeedback(classification: string): string {
  const variations = CLASSIFICATION_VARIATIONS[classification];
  if (!variations) return "";

  const randomPrefix =
    COACH_PREFIXES[Math.floor(Math.random() * COACH_PREFIXES.length)];
  const randomVariation =
    variations[Math.floor(Math.random() * variations.length)];

  return `${randomPrefix} ${randomVariation}.`;
}