import type {
  Answers,
  AxisResult,
  Bin,
  ChoiceQuestion,
  DimensionsResult,
  OutcomesResult,
  Question,
  QuestionAggregate,
  QuizDefinition,
  RoundAggregate,
  ScaleQuestion,
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
    if (q.type === "scale") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > q.steps) {
        throw new Error(`answer for question ${q.id} must be an integer 1..${q.steps}`);
      }
    } else {
      if (typeof v !== "string" || !q.options.some((o) => o.id === v)) {
        throw new Error(`answer for question ${q.id} must be one of its option ids`);
      }
    }
  }
  const known = new Set(quiz.questions.map((q) => q.id));
  for (const id of Object.keys(answers)) {
    if (!known.has(id)) throw new Error(`unknown question id ${id}`);
  }
}

/** For a scale answer: signed offset from the middle (negative = left side). */
function scaleOffset(q: ScaleQuestion, answers: Answers): number {
  return (answers[q.id] as number) - (q.steps + 1) / 2;
}

function chosenOption(q: ChoiceQuestion, answers: Answers) {
  return q.options.find((o) => o.id === answers[q.id])!;
}

/** Uniform quintiles of [-1, 1]: bin 1 = score >= 0.6 (far poles[0] side). */
export function scoreToBin(score: number): Bin {
  if (score >= 0.6) return 1;
  if (score >= 0.2) return 2;
  if (score > -0.2) return 3;
  if (score > -0.6) return 4;
  return 5;
}

/**
 * Axis score for one dimension: -1..1, positive toward poles[0], normalized
 * by the maximum points the quiz's questions could contribute to this axis.
 */
function axisScore(quiz: QuizDefinition, dimensionId: string, answers: Answers): number {
  const dim = quiz.dimensions!.find((d) => d.id === dimensionId)!;
  const [a, b] = dim.poles;
  const net = (holder: { scores: Record<string, number> }) =>
    (holder.scores[a] ?? 0) - (holder.scores[b] ?? 0);
  let points = 0;
  let maxPoints = 0;
  for (const q of quiz.questions) {
    if (q.type === "scale") {
      const qMax = Math.max(Math.abs(net(q.left)), Math.abs(net(q.right)));
      if (qMax === 0) continue; // question doesn't touch this axis
      const offset = scaleOffset(q, answers);
      points += Math.abs(offset) * net(offset < 0 ? q.left : q.right);
      maxPoints += ((q.steps - 1) / 2) * qMax;
    } else {
      const qMax = Math.max(...q.options.map((o) => Math.abs(net(o))));
      if (qMax === 0) continue;
      points += net(chosenOption(q, answers));
      maxPoints += qMax;
    }
  }
  return maxPoints === 0 ? 0 : points / maxPoints;
}

function axisResult(quiz: QuizDefinition, dimensionId: string, score: number): AxisResult {
  const dim = quiz.dimensions!.find((d) => d.id === dimensionId)!;
  const bin = scoreToBin(score);
  // Ties break toward poles[1] — the MBTI convention (I, N, F, P).
  const letter = score > 0 ? dim.poles[0] : dim.poles[1];
  const strength = bin === 1 || bin === 5 ? "clear" : bin === 3 ? "slight" : "lean";
  return { dimension: dimensionId, score, letter, bin, strength };
}

function dimensionsResultFromScores(
  quiz: QuizDefinition,
  scores: Record<string, number>,
): DimensionsResult {
  const axes = quiz.dimensions!.map((d) => axisResult(quiz, d.id, scores[d.id] ?? 0));
  const type = axes.map((x) => x.letter.toUpperCase()).join("");
  const casedType = axes
    .map((x) => (x.strength === "clear" ? x.letter.toUpperCase() : x.letter.toLowerCase()))
    .join("");
  return { kind: "dimensions", axes, type, casedType };
}

function outcomesResultFromScores(
  quiz: QuizDefinition,
  scores: Record<string, number>,
): OutcomesResult {
  let winnerId = quiz.outcomes![0].id;
  for (const o of quiz.outcomes!) {
    if ((scores[o.id] ?? 0) > (scores[winnerId] ?? 0)) winnerId = o.id;
  }
  return { kind: "outcomes", scores, winnerId };
}

/** Score one respondent's complete answers into a result. */
export function scoreSubmission(quiz: QuizDefinition, answers: Answers): SubmissionResult {
  validateAnswers(quiz, answers);

  if (quiz.scoring === "dimensions") {
    const scores: Record<string, number> = {};
    for (const d of quiz.dimensions!) scores[d.id] = axisScore(quiz, d.id, answers);
    return dimensionsResultFromScores(quiz, scores);
  }

  const scores: Record<string, number> = {};
  for (const o of quiz.outcomes!) scores[o.id] = 0;
  for (const q of quiz.questions) {
    if (q.type === "scale") {
      const offset = scaleOffset(q, answers);
      if (offset === 0) continue;
      const side = offset < 0 ? q.left : q.right;
      for (const [target, weight] of Object.entries(side.scores)) {
        scores[target] = (scores[target] ?? 0) + Math.abs(offset) * weight;
      }
    } else {
      for (const [target, weight] of Object.entries(chosenOption(q, answers).scores)) {
        scores[target] = (scores[target] ?? 0) + weight;
      }
    }
  }
  return outcomesResultFromScores(quiz, scores);
}

function aggregateQuestions(
  quiz: QuizDefinition,
  submissions: { answers: Answers }[],
): QuestionAggregate[] {
  return quiz.questions.map((q) => {
    if (q.type === "scale") {
      const counts = Array.from({ length: q.steps }, () => 0);
      const values: number[] = [];
      for (const s of submissions) {
        const v = s.answers[q.id];
        if (typeof v === "number" && v >= 1 && v <= q.steps) {
          counts[v - 1]++;
          values.push(v);
        }
      }
      const total = values.length;
      const mean = total ? values.reduce((x, y) => x + y, 0) / total : 0;
      const sd = total ? Math.sqrt(values.reduce((x, v) => x + (v - mean) ** 2, 0) / total) : 0;
      // Max possible sd: half the room at 1, half at `steps`.
      const disagreement = sd / ((q.steps - 1) / 2);
      return { questionId: q.id, total, disagreement, scale: { counts, mean, sd } };
    }
    const counts: Record<string, number> = Object.fromEntries(q.options.map((o) => [o.id, 0]));
    let total = 0;
    for (const s of submissions) {
      const v = s.answers[q.id];
      if (typeof v === "string" && v in counts) {
        counts[v]++;
        total++;
      }
    }
    const top = Math.max(0, ...Object.values(counts));
    const disagreement = total > 1 ? 1 - top / total : 0;
    return { questionId: q.id, total, disagreement, choice: { counts } };
  });
}

/**
 * Aggregate a round: consensus result, tally of individual verdicts, and
 * per-question answer distributions.
 */
export function aggregateRound(
  quiz: QuizDefinition,
  submissions: { answers: Answers; result: SubmissionResult }[],
): RoundAggregate {
  const n = submissions.length;
  const questions = aggregateQuestions(quiz, submissions);

  if (quiz.scoring === "dimensions") {
    const axisScores: Record<string, number[]> = {};
    for (const d of quiz.dimensions!) {
      axisScores[d.id] = submissions.map((s) => {
        const r = s.result as DimensionsResult;
        return r.axes.find((x) => x.dimension === d.id)?.score ?? 0;
      });
    }

    let consensus: DimensionsResult | null = null;
    if (n > 0) {
      const means: Record<string, number> = {};
      for (const d of quiz.dimensions!) {
        means[d.id] = axisScores[d.id].reduce((a, b) => a + b, 0) / n;
      }
      consensus = dimensionsResultFromScores(quiz, means);
    }

    const tally = new Map<string, number>();
    for (const s of submissions) {
      const t = (s.result as DimensionsResult).type;
      tally.set(t, (tally.get(t) ?? 0) + 1);
    }

    return {
      submissionCount: n,
      kind: "dimensions",
      consensus,
      axisScores,
      outcomeTotals: [],
      verdictTally: sortTally(tally),
      questions,
    };
  }

  const totals: Record<string, number> = {};
  for (const o of quiz.outcomes!) totals[o.id] = 0;
  for (const s of submissions) {
    for (const [id, v] of Object.entries((s.result as OutcomesResult).scores)) {
      totals[id] = (totals[id] ?? 0) + v;
    }
  }
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const outcomeTotals = quiz
    .outcomes!.map((o) => ({
      id: o.id,
      total: totals[o.id],
      share: grand > 0 ? totals[o.id] / grand : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const label = (id: string) => quiz.outcomes!.find((o) => o.id === id)?.label ?? id;
  const tally = new Map<string, number>();
  for (const s of submissions) {
    const w = label((s.result as OutcomesResult).winnerId);
    tally.set(w, (tally.get(w) ?? 0) + 1);
  }

  return {
    submissionCount: n,
    kind: "outcomes",
    consensus: n > 0 ? outcomesResultFromScores(quiz, totals) : null,
    axisScores: {},
    outcomeTotals,
    verdictTally: sortTally(tally),
    questions,
  };
}

function sortTally(tally: Map<string, number>): { label: string; count: number }[] {
  return [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * How far one person's answer sits from a group's answers to the same
 * question, 0 (dead center of the pack) .. 1 (maximally unlike them).
 * The aggregate should be over the group WITHOUT this person's answer.
 * Scale: distance from the group mean, normalized by the scale width.
 * Choice: the share of the group that did NOT pick your option.
 */
export function answerDivergence(
  question: Question,
  answer: number | string,
  qa: QuestionAggregate,
): number {
  if (qa.total === 0) return 0;
  if (question.type === "scale" && qa.scale && typeof answer === "number") {
    return Math.abs(answer - qa.scale.mean) / (question.steps - 1);
  }
  if (question.type === "choice" && qa.choice && typeof answer === "string") {
    return 1 - (qa.choice.counts[answer] ?? 0) / qa.total;
  }
  return 0;
}
