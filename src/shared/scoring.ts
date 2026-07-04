import type {
  Answers,
  AxisResult,
  Bin,
  QuestionAggregate,
  QuizDefinition,
  RoundAggregate,
  SubmissionResult,
} from "./types";

/**
 * Throws with a human-readable message if `answers` is not a complete,
 * valid response to the quiz.
 */
export function validateAnswers(quiz: QuizDefinition, answers: Answers): void {
  for (const q of quiz.questions) {
    const v = answers[q.id];
    if (v === undefined) throw new Error(`missing answer for question ${q.id}`);
    if (!Number.isInteger(v) || v < 1 || v > q.steps) {
      throw new Error(`answer for question ${q.id} must be an integer 1..${q.steps}`);
    }
  }
  const known = new Set(quiz.questions.map((q) => q.id));
  for (const id of Object.keys(answers)) {
    if (!known.has(id)) throw new Error(`unknown question id ${id}`);
  }
}

/**
 * Axis score for one dimension: -1..1, positive toward poles[0].
 * A scale answer contributes (value - middle) points toward the pole on
 * that side of the item, normalized by the maximum possible points.
 */
function axisScore(quiz: QuizDefinition, dimensionId: string, answers: Answers): number {
  const dim = quiz.dimensions.find((d) => d.id === dimensionId)!;
  let points = 0; // positive toward poles[0]
  let maxPoints = 0;
  for (const q of quiz.questions) {
    if (q.dimension !== dimensionId) continue;
    const middle = (q.steps + 1) / 2;
    const offset = answers[q.id] - middle; // negative = left statement, positive = right
    const towardPole = offset < 0 ? q.left.pole : q.right.pole;
    const magnitude = Math.abs(offset);
    points += towardPole === dim.poles[0] ? magnitude : -magnitude;
    maxPoints += middle - 1;
  }
  return maxPoints === 0 ? 0 : points / maxPoints;
}

/** Uniform quintiles of [-1, 1]: bin 1 = score >= 0.6 (far poles[0] side). */
export function scoreToBin(score: number): Bin {
  if (score >= 0.6) return 1;
  if (score >= 0.2) return 2;
  if (score > -0.2) return 3;
  if (score > -0.6) return 4;
  return 5;
}

function axisResult(quiz: QuizDefinition, dimensionId: string, score: number): AxisResult {
  const dim = quiz.dimensions.find((d) => d.id === dimensionId)!;
  const bin = scoreToBin(score);
  // Ties break toward poles[1] — the MBTI convention (I, N, F, P).
  const letter = score > 0 ? dim.poles[0] : dim.poles[1];
  const strength = bin === 1 || bin === 5 ? "clear" : bin === 3 ? "slight" : "lean";
  return { dimension: dimensionId, score, letter, bin, strength };
}

function resultFromAxisScores(
  quiz: QuizDefinition,
  scores: Record<string, number>,
): SubmissionResult {
  const axes = quiz.dimensions.map((d) => axisResult(quiz, d.id, scores[d.id] ?? 0));
  const type = axes.map((a) => a.letter.toUpperCase()).join("");
  const casedType = axes
    .map((a) => (a.strength === "clear" ? a.letter.toUpperCase() : a.letter.toLowerCase()))
    .join("");
  return { axes, type, casedType };
}

/** Score one respondent's complete answers into a result. */
export function scoreSubmission(quiz: QuizDefinition, answers: Answers): SubmissionResult {
  validateAnswers(quiz, answers);
  const scores: Record<string, number> = {};
  for (const d of quiz.dimensions) scores[d.id] = axisScore(quiz, d.id, answers);
  return resultFromAxisScores(quiz, scores);
}

/**
 * Aggregate a round: consensus result from mean axis scores, tally of
 * individual verdicts, and per-question answer distributions.
 */
export function aggregateRound(
  quiz: QuizDefinition,
  submissions: { answers: Answers; result: SubmissionResult }[],
): RoundAggregate {
  const n = submissions.length;

  const axisScores: Record<string, number[]> = {};
  for (const d of quiz.dimensions) {
    axisScores[d.id] = submissions.map(
      (s) => s.result.axes.find((a) => a.dimension === d.id)?.score ?? 0,
    );
  }

  let consensus: SubmissionResult | null = null;
  if (n > 0) {
    const means: Record<string, number> = {};
    for (const d of quiz.dimensions) {
      means[d.id] = axisScores[d.id].reduce((a, b) => a + b, 0) / n;
    }
    consensus = resultFromAxisScores(quiz, means);
  }

  const tally = new Map<string, number>();
  for (const s of submissions) tally.set(s.result.type, (tally.get(s.result.type) ?? 0) + 1);
  const typeTally = [...tally.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  const questions: QuestionAggregate[] = quiz.questions.map((q) => {
    const counts = Array.from({ length: q.steps }, () => 0);
    const values: number[] = [];
    for (const s of submissions) {
      const v = s.answers[q.id];
      if (v >= 1 && v <= q.steps) {
        counts[v - 1]++;
        values.push(v);
      }
    }
    const total = values.length;
    const mean = total ? values.reduce((a, b) => a + b, 0) / total : 0;
    const sd = total
      ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / total)
      : 0;
    return { questionId: q.id, counts, total, mean, sd };
  });

  return { submissionCount: n, consensus, axisScores, typeTally, questions };
}
