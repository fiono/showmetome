// Canonical quiz format, shared between worker and app.
//
// Two scoring modes:
//  - "dimensions": bipolar axes (MBTI-style). Every question pushes the
//    subject along one or more axes; the result is a position per axis.
//  - "weighted-outcomes": a set of outcomes ("which X are you"). Every
//    answer adds points to outcomes; the highest total wins.
//
// Two question types, both usable in either mode:
//  - "scale": two opposing statements with N positions between them; each
//    side targets a pole (dimensions) or an outcome.
//  - "choice": a prompt with options; each option scores points toward
//    poles or outcomes.

/** A score target: a pole letter in dimensions mode, an outcome id otherwise. */
export type TargetId = string;
export type Pole = string;

export interface Dimension {
  id: string; // e.g. "EI"
  /**
   * Ordered pair of poles. poles[0] is the "positive" direction of the
   * axis score; ties break toward poles[1] (the MBTI convention: I, N, F, P).
   */
  poles: [Pole, Pole];
  labels: Record<Pole, string>; // e.g. { E: "Extrovert", I: "Introvert" }
  description?: string;
}

export interface Outcome {
  id: string;
  label: string; // e.g. "Autumn"
  description?: string;
}

export interface ScaleSide {
  text: string;
  /** target id -> weight (>= 0), scored in proportion to how far the answer leans this way. */
  scores: Record<TargetId, number>;
}

export interface ScaleQuestion {
  id: string;
  type: "scale";
  /** Optional grouping hint (legacy); scoring derives axes from targets. */
  dimension?: string;
  left: ScaleSide;
  right: ScaleSide;
  steps: number; // odd, so there is a neutral middle (the builder uses 5)
}

export interface ChoiceOption {
  id: string;
  text: string;
  /** target id -> weight (>= 0). Direction comes from which target is scored. */
  scores: Record<TargetId, number>;
}

export interface ChoiceQuestion {
  id: string;
  type: "choice";
  text: string;
  options: ChoiceOption[];
}

export type Question = ScaleQuestion | ChoiceQuestion;

export interface QuizDefinition {
  version: 1;
  title: string;
  description?: string;
  attribution?: string;
  scoring: "dimensions" | "weighted-outcomes";
  /** Present when scoring === "dimensions" */
  dimensions?: Dimension[];
  /** Present when scoring === "weighted-outcomes" */
  outcomes?: Outcome[];
  questions: Question[];
}

/** question id -> scale value (1..steps) for scale, option id for choice */
export type Answers = Record<string, number | string>;

export type Bin = 1 | 2 | 3 | 4 | 5;

export interface AxisResult {
  dimension: string;
  /** -1..1; positive means toward poles[0] */
  score: number;
  /** The winning pole letter */
  letter: Pole;
  /** 1 = far poles[0] side ... 5 = far poles[1] side */
  bin: Bin;
  /** "clear" (outer bin), "lean" (bins 2/4), "slight" (middle bin) */
  strength: "clear" | "lean" | "slight";
}

export interface DimensionsResult {
  kind: "dimensions";
  axes: AxisResult[];
  /** Traditional 4-letter type, uppercase, e.g. "ISFP" */
  type: string;
  /** Dynomight-style casing: uppercase = clear, lowercase = lean/slight */
  casedType: string;
}

export interface OutcomesResult {
  kind: "outcomes";
  /** outcome id -> points (>= 0) */
  scores: Record<string, number>;
  /** Highest-scoring outcome; ties break by outcome order in the quiz */
  winnerId: string;
}

export type SubmissionResult = DimensionsResult | OutcomesResult;

export interface QuestionAggregate {
  questionId: string;
  total: number;
  /** 0..1; 0 = everyone answered alike, 1 = maximally divided */
  disagreement: number;
  /** scale questions: counts[i] = respondents who picked value i+1 */
  scale?: { counts: number[]; mean: number; sd: number };
  /** choice questions: option id -> count */
  choice?: { counts: Record<string, number> };
}

export interface OutcomeTotal {
  id: string;
  total: number;
  /** total / sum of all outcome totals (0 when nothing scored) */
  share: number;
}

export interface RoundAggregate {
  submissionCount: number;
  kind: "dimensions" | "outcomes";
  consensus: SubmissionResult | null;
  /** dimensions mode: dimension id -> per-submission axis scores (submission order) */
  axisScores: Record<string, number[]>;
  /** outcomes mode: summed points per outcome, descending */
  outcomeTotals: OutcomeTotal[];
  /** Tally of individual verdicts (4-letter type or winning outcome label), descending */
  verdictTally: { label: string; count: number }[];
  questions: QuestionAggregate[];
}

// --- API payload shapes ---

export interface TemplateInfo {
  id: string;
  title: string;
  description?: string;
  attribution?: string;
  questionCount: number;
}

export interface QuizInfo {
  id: string;
  title: string;
  description?: string;
  attribution?: string;
  source: "template" | "manual" | "ai_import";
  questionCount: number;
  /** Owner opted in to listing this quiz on the homepage. */
  isPublic: boolean;
  /** Rounds ever created from this quiz. */
  roundCount: number;
  /** Times anyone completed this quiz (submissions across all its rounds). */
  submissionCount: number;
  /** Full definition; present on single-quiz fetches (for cloning), not listings. */
  definition?: QuizDefinition;
}

export interface CreateRoundResponse {
  roundId: string;
  subjectName: string;
  ownerToken: string;
  shareToken: string;
}

export interface ShareView {
  subjectName: string;
  status: "open" | "closed";
  /** Id of the underlying quiz, so an answerer can start their own round of it. */
  quizId: string;
  quiz: { title: string; description?: string; attribution?: string; definition: QuizDefinition };
}

export interface SubmissionView {
  id: string;
  respondentName: string | null;
  isSelf: boolean;
  createdAt: number;
  result: SubmissionResult;
  answers: Answers;
}

export interface OwnerView {
  round: {
    id: string;
    subjectName: string;
    status: "open" | "closed";
    createdAt: number;
    shareToken: string;
  };
  quiz: { title: string; description?: string; attribution?: string; definition: QuizDefinition };
  submissions: SubmissionView[];
  aggregate: RoundAggregate;
}
