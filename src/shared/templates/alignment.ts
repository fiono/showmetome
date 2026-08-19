import type { QuizDefinition } from "../types";

// The classic D&D-style alignment chart. No questions — the taker drops
// {name} straight onto the grid, and the quadrant label IS the verdict
// ("Chaotic Good", "Neutral Evil", "True Neutral", ...).

export const ALIGNMENT_TEMPLATE: QuizDefinition = {
  version: 1,
  title: "The Alignment Chart",
  description:
    "Where does {name} really sit? One tap, nine possible verdicts — " +
    "from Lawful Good to Chaotic Evil.",
  attribution: "The classic Dungeons & Dragons alignment grid",
  scoring: "alignment",
  alignment: {
    x: { low: "Chaotic", high: "Lawful" },
    y: { low: "Evil", high: "Good" },
  },
  questions: [],
};
