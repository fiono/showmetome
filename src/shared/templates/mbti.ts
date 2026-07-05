import type { QuizDefinition, ScaleQuestion } from "../types";

// The "Fastest Personality Test" from https://dynomight.net/mbti/,
// transcribed verbatim. Items are bipolar statement pairs on a 5-point
// scale; 8 items per axis, cycling J/P -> T/F -> E/I -> S/N. The original
// stores nothing; this app's whole point is storing your friends' answers.

type Row = [dimension: string, leftPole: string, left: string, rightPole: string, right: string];

const ROWS: Row[] = [
  ["JP", "J", "makes lists", "P", "relies on memory"],
  ["TF", "T", "sceptical", "F", "wants to believe"],
  ["EI", "E", "bored by time alone", "I", "needs time alone"],
  ["SN", "S", "accepts things as they are", "N", "unsatisfied with the ways things are"],
  ["JP", "J", "keeps a clean room", "P", "just puts stuff where ever"],
  ["TF", "F", "thinks “robotic” is an insult", "T", "strives to have a mechanical mind"],
  ["EI", "E", "energetic", "I", "mellow"],
  ["SN", "S", "prefer multiple choice test", "N", "prefer essay answers"],
  ["JP", "P", "chaotic", "J", "organized"],
  ["TF", "F", "easily hurt", "T", "thick-skinned"],
  ["EI", "E", "works best in groups", "I", "works best alone"],
  ["SN", "S", "focused on the present", "N", "focused on the future"],
  ["JP", "J", "plans far ahead", "P", "plans at the last minute"],
  ["TF", "T", "wants people's respect", "F", "wants their love"],
  ["EI", "I", "gets worn out by parties", "E", "gets fired up by parties"],
  ["SN", "S", "fits in", "N", "stands out"],
  ["JP", "P", "keeps options open", "J", "commits"],
  ["TF", "T", "wants to be good at fixing things", "F", "wants to be good at fixing people"],
  ["EI", "E", "talks more", "I", "listens more"],
  ["SN", "S", "when describing an event, will tell people what happened", "N", "when describing an event, will tell people what it meant"],
  ["JP", "J", "gets work done right away", "P", "procrastinates"],
  ["TF", "F", "follows the heart", "T", "follows the head"],
  ["EI", "I", "stays at home", "E", "goes out on the town"],
  ["SN", "N", "wants the big picture", "S", "wants the details"],
  ["JP", "P", "improvises", "J", "prepares"],
  ["TF", "T", "bases morality on justice", "F", "bases morality on compassion"],
  ["EI", "I", "finds it difficult to yell very loudly", "E", "yelling to others when they are far away comes naturally"],
  ["SN", "N", "theoretical", "S", "empirical"],
  ["JP", "J", "works hard", "P", "plays hard"],
  ["TF", "T", "uncomfortable with emotions", "F", "values emotions"],
  ["EI", "E", "likes to perform in front of other people", "I", "avoids public speaking"],
  ["SN", "S", "likes to know: who? what?", "N", "likes to know: why"],
];

const questions: ScaleQuestion[] = ROWS.map(([dimension, leftPole, left, rightPole, right], i) => ({
  id: `q${i + 1}`,
  type: "scale",
  dimension,
  left: { text: left, target: leftPole },
  right: { text: right, target: rightPole },
  steps: 5,
}));

export const MBTI_QUIZ: QuizDefinition = {
  version: 1,
  title: "Fastest Personality Test",
  description:
    "A no-nonsense Myers-Briggs-style test. Each axis lands in one of five bins, " +
    "so there are 625 possible results instead of the usual 16.",
  attribution: "Items from the Fastest Personality Test at dynomight.net/mbti",
  scoring: "dimensions",
  dimensions: [
    {
      id: "EI",
      poles: ["E", "I"],
      labels: { E: "Extrovert", I: "Introvert" },
      description:
        "Introverts (I) direct their energy inwards, to ideas and thoughts. Extroverts (E) " +
        "direct their energy outwards, towards people, things, and situations.",
    },
    {
      id: "SN",
      poles: ["S", "N"],
      labels: { S: "Sensing", N: "Intuitive" },
      description:
        "Sensing people (S) prefer tangible facts. Intuitive people (N) prefer abstractions " +
        "and theories.",
    },
    {
      id: "TF",
      poles: ["T", "F"],
      labels: { T: "Thinker", F: "Feeler" },
      description:
        "Feelers (F) look at situations through empathy for the people involved. Thinkers (T) " +
        "look at situations from a more detached, logical viewpoint.",
    },
    {
      id: "JP",
      poles: ["J", "P"],
      labels: { J: "Judging", P: "Perceiving" },
      description:
        "Judging people (J) prefer a planned and structured approach to life. Perceiving " +
        "people (P) prefer to be more spontaneous.",
    },
  ],
  questions,
};

export const TEMPLATES: { id: string; quiz: QuizDefinition }[] = [
  { id: "tmpl_mbti_v1", quiz: MBTI_QUIZ },
];
