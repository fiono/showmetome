// Canonical quiz format, shared between worker and app.

/** One end of a bipolar dimension, e.g. "E" or "I". */
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

/**
 * A bipolar scale item: two opposing statements with `steps` positions
 * between them. Answer value 1 = fully the left statement, `steps` = fully
 * the right statement.
 */
export interface ScaleQuestion {
  id: string;
  type: "scale";
  dimension: string; // Dimension.id
  left: { text: string; pole: Pole };
  right: { text: string; pole: Pole };
  steps: number; // odd, so there is a neutral middle (M1 always uses 5)
}

export type Question = ScaleQuestion;

export interface QuizDefinition {
  version: 1;
  title: string;
  description?: string;
  attribution?: string;
  scoring: "dimensions";
  dimensions: Dimension[];
  questions: Question[];
}

/** question id -> chosen scale value (1..steps) */
export type Answers = Record<string, number>;

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

export interface SubmissionResult {
  axes: AxisResult[];
  /** Traditional 4-letter type, uppercase, e.g. "ISFP" */
  type: string;
  /** Dynomight-style casing: uppercase = clear, lowercase = lean/slight, e.g. "ISfp" */
  casedType: string;
}

export interface QuestionAggregate {
  questionId: string;
  /** counts[i] = number of respondents who picked scale value i+1 */
  counts: number[];
  total: number;
  /** mean scale value (1..steps) */
  mean: number;
  /** population standard deviation of scale values; higher = more divided */
  sd: number;
}

export interface RoundAggregate {
  submissionCount: number;
  /** Result computed from mean axis scores across all submissions */
  consensus: SubmissionResult | null;
  /** Per-dimension list of every submission's axis score (same order as submissions) */
  axisScores: Record<string, number[]>;
  /** Tally of respondents' traditional types, descending */
  typeTally: { type: string; count: number }[];
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

export interface CreateRoundResponse {
  roundId: string;
  subjectName: string;
  ownerToken: string;
  shareToken: string;
}

export interface ShareView {
  subjectName: string;
  status: "open" | "closed";
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
