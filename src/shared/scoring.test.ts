import { describe, expect, it } from "vitest";
import { aggregateRound, scoreSubmission, scoreToBin, validateAnswers } from "./scoring";
import { parseQuizDefinition, normalizeResult } from "./validate";
import { MBTI_QUIZ } from "./templates/mbti";
import type { Answers, DimensionsResult, OutcomesResult, QuizDefinition } from "./types";

/** Answers pushed fully toward each pole named in `targets` (one per dimension). */
function answersToward(targets: Record<string, string>): Answers {
  const answers: Answers = {};
  for (const q of MBTI_QUIZ.questions) {
    if (q.type !== "scale") continue;
    const target = targets[q.dimension!];
    answers[q.id] = q.left.scores[target] ? 1 : q.steps;
  }
  return answers;
}

function neutralAnswers(): Answers {
  const answers: Answers = {};
  for (const q of MBTI_QUIZ.questions) {
    if (q.type === "scale") answers[q.id] = (q.steps + 1) / 2;
  }
  return answers;
}

const dims = (r: ReturnType<typeof scoreSubmission>) => r as DimensionsResult;

describe("MBTI template structure", () => {
  it("has 32 items, 8 per axis, with targets matching each item's dimension", () => {
    expect(MBTI_QUIZ.questions).toHaveLength(32);
    for (const d of MBTI_QUIZ.dimensions!) {
      const items = MBTI_QUIZ.questions.filter(
        (q) => q.type === "scale" && q.dimension === d.id,
      );
      expect(items, d.id).toHaveLength(8);
      for (const q of items) {
        if (q.type !== "scale") continue;
        const sideTargets = [...Object.keys(q.left.scores), ...Object.keys(q.right.scores)];
        expect(new Set(sideTargets)).toEqual(new Set(d.poles));
      }
    }
  });

  it("passes the definition validator", () => {
    expect(() => parseQuizDefinition(MBTI_QUIZ)).not.toThrow();
  });
});

describe("scoreSubmission (dimensions)", () => {
  it("scores fully-directed answers as clear outer-bin results", () => {
    const result = dims(
      scoreSubmission(MBTI_QUIZ, answersToward({ EI: "E", SN: "N", TF: "F", JP: "P" })),
    );
    expect(result.kind).toBe("dimensions");
    expect(result.type).toBe("ENFP");
    expect(result.casedType).toBe("ENFP");
    for (const axis of result.axes) {
      expect(Math.abs(axis.score)).toBe(1);
      expect(axis.strength).toBe("clear");
      expect([1, 5]).toContain(axis.bin);
    }
  });

  it("breaks perfect ties toward I, N, F, P with lowercase letters", () => {
    const result = dims(scoreSubmission(MBTI_QUIZ, neutralAnswers()));
    expect(result.type).toBe("INFP");
    expect(result.casedType).toBe("infp");
    for (const axis of result.axes) {
      expect(axis.score).toBe(0);
      expect(axis.bin).toBe(3);
    }
  });

  it("lowercases lean results and uppercases clear ones (dynomight casing)", () => {
    // Fully I and S; one step toward F on 2 of 8 TF items; toward P on 6 of 8 JP items.
    const answers = answersToward({ EI: "I", SN: "S", TF: "T", JP: "J" });
    const scale = MBTI_QUIZ.questions.filter((q) => q.type === "scale");
    for (const q of scale) {
      if (q.dimension === "TF" || q.dimension === "JP") answers[q.id] = 3;
    }
    const tf = scale.filter((q) => q.dimension === "TF");
    const jp = scale.filter((q) => q.dimension === "JP");
    for (const q of tf.slice(0, 2)) answers[q.id] = q.left.scores["F"] ? 2 : 4;
    for (const q of jp.slice(0, 6)) answers[q.id] = q.left.scores["P"] ? 2 : 4;

    const result = dims(scoreSubmission(MBTI_QUIZ, answers));
    // TF: 2 of 16 points toward F -> 0.125 -> slight; JP: 6/16 -> 0.375 -> lean
    expect(result.type).toBe("ISFP");
    expect(result.casedType).toBe("ISfp");
  });
});

describe("scoreToBin", () => {
  it("splits [-1,1] into uniform quintiles", () => {
    expect(scoreToBin(1)).toBe(1);
    expect(scoreToBin(0.6)).toBe(1);
    expect(scoreToBin(0.59)).toBe(2);
    expect(scoreToBin(0.2)).toBe(2);
    expect(scoreToBin(0.19)).toBe(3);
    expect(scoreToBin(0)).toBe(3);
    expect(scoreToBin(-0.19)).toBe(3);
    expect(scoreToBin(-0.2)).toBe(4);
    expect(scoreToBin(-0.59)).toBe(4);
    expect(scoreToBin(-0.6)).toBe(5);
    expect(scoreToBin(-1)).toBe(5);
  });
});

describe("validateAnswers", () => {
  it("rejects incomplete, out-of-range, and unknown answers", () => {
    const good = neutralAnswers();
    expect(() => validateAnswers(MBTI_QUIZ, good)).not.toThrow();

    const missing = { ...good };
    delete missing.q1;
    expect(() => validateAnswers(MBTI_QUIZ, missing)).toThrow(/missing/);

    expect(() => validateAnswers(MBTI_QUIZ, { ...good, q1: 6 })).toThrow(/1\.\.5/);
    expect(() => validateAnswers(MBTI_QUIZ, { ...good, q1: 0 })).toThrow(/1\.\.5/);
    expect(() => validateAnswers(MBTI_QUIZ, { ...good, q1: "a" })).toThrow(/1\.\.5/);
    expect(() => validateAnswers(MBTI_QUIZ, { ...good, nope: 3 })).toThrow(/unknown/);
  });
});

// --- weighted-outcomes mode, with both question types ---

const COLOR_QUIZ: QuizDefinition = parseQuizDefinition({
  version: 1,
  title: "What color is {name}?",
  scoring: "weighted-outcomes",
  outcomes: [
    { id: "red", label: "Red" },
    { id: "blue", label: "Blue" },
    { id: "green", label: "Green" },
  ],
  questions: [
    {
      id: "c1",
      type: "choice",
      text: "Pick a weekend for {name}",
      options: [
        { id: "a", text: "Mountain hike", scores: { green: 2 } },
        { id: "b", text: "Beach day", scores: { blue: 2 } },
        { id: "c", text: "Street festival", scores: { red: 2 } },
        { id: "d", text: "Bit of everything", scores: { red: 1, blue: 1, green: 1 } },
      ],
    },
    {
      id: "c2",
      type: "choice",
      text: "{name}'s energy is...",
      options: [
        { id: "a", text: "Loud", scores: { red: 1 } },
        { id: "b", text: "Calm", scores: { blue: 1 } },
      ],
    },
    {
      id: "s1",
      type: "scale",
      left: { text: "fiery", target: "red" },
      right: { text: "chill", target: "blue" },
      steps: 5,
    },
  ],
});

describe("scoreSubmission (weighted-outcomes)", () => {
  it("sums option weights and scale offsets into outcome scores", () => {
    const r = scoreSubmission(COLOR_QUIZ, { c1: "a", c2: "b", s1: 5 }) as OutcomesResult;
    expect(r.kind).toBe("outcomes");
    // green 2 (hike); blue 1 (calm) + 2 (fully chill) = 3
    expect(r.scores).toEqual({ red: 0, blue: 3, green: 2 });
    expect(r.winnerId).toBe("blue");
  });

  it("a neutral scale answer scores nothing; ties break by outcome order", () => {
    const r = scoreSubmission(COLOR_QUIZ, { c1: "d", c2: "a", s1: 4 }) as OutcomesResult;
    // red 1+1, blue 1+1, green 1 -> red and blue tied; red comes first in the quiz
    expect(r.scores).toEqual({ red: 2, blue: 2, green: 1 });
    expect(r.winnerId).toBe("red");
  });

  it("rejects an answer that is not one of the option ids", () => {
    expect(() => scoreSubmission(COLOR_QUIZ, { c1: "z", c2: "a", s1: 3 })).toThrow(/option/);
  });

  it("scale sides can score multiple outcomes with weights", () => {
    const quiz = parseQuizDefinition({
      version: 1,
      title: "Multi",
      scoring: "weighted-outcomes",
      outcomes: [
        { id: "red", label: "Red" },
        { id: "blue", label: "Blue" },
        { id: "green", label: "Green" },
      ],
      questions: [
        {
          id: "s1",
          type: "scale",
          left: { text: "fiery", scores: { red: 2, green: 1 } },
          right: { text: "chill", scores: { blue: 1 } },
          steps: 5,
        },
      ],
    });
    // fully left: |offset| 2 times each weight
    const left = scoreSubmission(quiz, { s1: 1 }) as OutcomesResult;
    expect(left.scores).toEqual({ red: 4, blue: 0, green: 2 });
    // one step right: blue gets 1
    const right = scoreSubmission(quiz, { s1: 4 }) as OutcomesResult;
    expect(right.scores).toEqual({ red: 0, blue: 1, green: 0 });
  });
});

describe("multi-axis scale questions in dimensions mode", () => {
  const quiz = parseQuizDefinition({
    version: 1,
    title: "Cross",
    scoring: "dimensions",
    dimensions: [
      { id: "EI", poles: ["E", "I"], labels: { E: "Extrovert", I: "Introvert" } },
      { id: "JP", poles: ["J", "P"], labels: { J: "Judging", P: "Perceiving" } },
    ],
    questions: [
      {
        id: "q1",
        type: "scale",
        // "out on the town" is both extroverted and spontaneous
        left: { text: "out on the town", scores: { E: 1, P: 1 } },
        right: { text: "night in, as planned", scores: { I: 1, J: 1 } },
        steps: 5,
      },
    ],
  });

  it("one scale item can push two axes at once", () => {
    const r = scoreSubmission(quiz, { q1: 1 }) as DimensionsResult;
    expect(r.axes.find((a) => a.dimension === "EI")!.score).toBe(1);
    expect(r.axes.find((a) => a.dimension === "JP")!.score).toBe(-1); // toward P
    expect(r.type).toBe("EP");
  });
});

describe("aggregateRound (weighted-outcomes)", () => {
  const sub = (answers: Answers) => ({ answers, result: scoreSubmission(COLOR_QUIZ, answers) });

  it("totals outcomes across friends and tallies winners by label", () => {
    const agg = aggregateRound(COLOR_QUIZ, [
      sub({ c1: "a", c2: "b", s1: 5 }), // blue 3, green 2
      sub({ c1: "c", c2: "a", s1: 1 }), // red 5
      sub({ c1: "b", c2: "b", s1: 5 }), // blue 5
    ]);
    expect(agg.kind).toBe("outcomes");
    expect(agg.outcomeTotals[0]).toMatchObject({ id: "blue", total: 8 });
    expect((agg.consensus as OutcomesResult).winnerId).toBe("blue");
    expect(agg.verdictTally).toEqual([
      { label: "Blue", count: 2 },
      { label: "Red", count: 1 },
    ]);
    const shares = agg.outcomeTotals.reduce((a, o) => a + o.share, 0);
    expect(shares).toBeCloseTo(1);

    const c1 = agg.questions.find((q) => q.questionId === "c1")!;
    expect(c1.choice!.counts).toEqual({ a: 1, b: 1, c: 1, d: 0 });
    expect(c1.disagreement).toBeCloseTo(1 - 1 / 3);
    const s1 = agg.questions.find((q) => q.questionId === "s1")!;
    expect(s1.scale!.counts).toEqual([1, 0, 0, 0, 2]);
  });
});

describe("aggregateRound (dimensions)", () => {
  const sub = (answers: Answers) => ({ answers, result: scoreSubmission(MBTI_QUIZ, answers) });

  it("returns an empty aggregate for zero submissions", () => {
    const agg = aggregateRound(MBTI_QUIZ, []);
    expect(agg.submissionCount).toBe(0);
    expect(agg.consensus).toBeNull();
    expect(agg.verdictTally).toEqual([]);
  });

  it("averages opposite extremes to a neutral consensus and tallies both verdicts", () => {
    const a = sub(answersToward({ EI: "E", SN: "S", TF: "T", JP: "J" }));
    const b = sub(answersToward({ EI: "I", SN: "N", TF: "F", JP: "P" }));
    const agg = aggregateRound(MBTI_QUIZ, [a, b]);

    expect(agg.submissionCount).toBe(2);
    expect((agg.consensus as DimensionsResult).type).toBe("INFP"); // ties break to I,N,F,P
    expect((agg.consensus as DimensionsResult).axes.every((x) => x.score === 0)).toBe(true);
    expect(agg.verdictTally).toEqual([
      { label: "ESTJ", count: 1 }, // sorted alphabetically at equal counts
      { label: "INFP", count: 1 },
    ]);
    expect(agg.axisScores.EI).toEqual([1, -1]);

    // Every question got one 1 and one 5 (opposite extremes): max disagreement.
    for (const q of agg.questions) {
      expect(q.total).toBe(2);
      expect(q.scale!.counts[0]).toBe(1);
      expect(q.scale!.counts[4]).toBe(1);
      expect(q.scale!.mean).toBe(3);
      expect(q.disagreement).toBe(1);
    }
  });
});

// --- mixed question types in dimensions mode ---

describe("choice questions in dimensions mode", () => {
  const quiz = parseQuizDefinition({
    version: 1,
    title: "Mini",
    scoring: "dimensions",
    dimensions: [
      { id: "EI", poles: ["E", "I"], labels: { E: "Extrovert", I: "Introvert" } },
    ],
    questions: [
      {
        id: "q1",
        type: "scale",
        left: { text: "talks", target: "E" },
        right: { text: "listens", target: "I" },
        steps: 5,
      },
      {
        id: "q2",
        type: "choice",
        text: "Ideal party role",
        options: [
          { id: "a", text: "Center of the dance floor", scores: { E: 2 } },
          { id: "b", text: "Kitchen conversation", scores: { I: 1 } },
          { id: "c", text: "Left an hour ago", scores: { I: 2 } },
        ],
      },
    ],
  });

  it("blends scale offsets and choice weights on the same axis", () => {
    // fully "talks" (E +2 of 2) + "left an hour ago" (I 2 of max 2) -> net 0
    const r1 = scoreSubmission(quiz, { q1: 1, q2: "c" }) as DimensionsResult;
    expect(r1.axes[0].score).toBe(0);

    // fully E on both -> +1
    const r2 = scoreSubmission(quiz, { q1: 1, q2: "a" }) as DimensionsResult;
    expect(r2.axes[0].score).toBe(1);

    // neutral scale + mild I option -> -1/4
    const r3 = scoreSubmission(quiz, { q1: 3, q2: "b" }) as DimensionsResult;
    expect(r3.axes[0].score).toBe(-0.25);
  });
});

// --- validator ---

describe("parseQuizDefinition", () => {
  it("normalizes M1 (`pole`) and M2 (`target`) scale sides to scores maps", () => {
    const legacy = {
      version: 1,
      title: "Legacy",
      scoring: "dimensions",
      dimensions: [{ id: "EI", poles: ["E", "I"], labels: { E: "Extrovert", I: "Introvert" } }],
      questions: [
        {
          id: "q1",
          type: "scale",
          dimension: "EI",
          left: { text: "talks", pole: "E" },
          right: { text: "listens", target: "I" },
          steps: 5,
        },
      ],
    };
    const parsed = parseQuizDefinition(legacy);
    const q = parsed.questions[0];
    expect(q.type).toBe("scale");
    if (q.type === "scale") {
      expect(q.left.scores).toEqual({ E: 1 });
      expect(q.right.scores).toEqual({ I: 1 });
      expect((q.left as unknown as Record<string, unknown>).pole).toBeUndefined();
      expect((q.right as unknown as Record<string, unknown>).target).toBeUndefined();
    }
  });

  it("keeps an optional scale prompt and drops an empty one", () => {
    const base = {
      version: 1,
      title: "Headers",
      scoring: "dimensions",
      dimensions: [{ id: "EI", poles: ["E", "I"], labels: { E: "Extrovert", I: "Introvert" } }],
      questions: [
        {
          id: "q1",
          type: "scale",
          prompt: "  How often does {name} go out?  ",
          left: { text: "never", scores: { I: 1 } },
          right: { text: "always", scores: { E: 1 } },
          steps: 5,
        },
        {
          id: "q2",
          type: "scale",
          prompt: "   ",
          left: { text: "quiet", scores: { I: 1 } },
          right: { text: "loud", scores: { E: 1 } },
          steps: 5,
        },
      ],
    };
    const parsed = parseQuizDefinition(base);
    const [q1, q2] = parsed.questions;
    if (q1.type === "scale") expect(q1.prompt).toBe("How often does {name} go out?");
    if (q2.type === "scale") expect(q2.prompt).toBeUndefined();
  });

  it("rejects broken definitions with useful messages", () => {
    expect(() => parseQuizDefinition({ version: 1, title: "X", scoring: "nope" })).toThrow(
      /scoring/,
    );
    expect(() =>
      parseQuizDefinition({
        version: 1,
        title: "X",
        scoring: "weighted-outcomes",
        outcomes: [{ id: "only", label: "Only" }],
        questions: [
          {
            id: "q1",
            type: "choice",
            text: "?",
            options: [
              { id: "a", text: "A", scores: { only: 1 } },
              { id: "b", text: "B", scores: { missing: 1 } },
            ],
          },
        ],
      }),
    ).toThrow(/2\.\.24 outcomes.*unknown target missing/s);
    expect(() =>
      parseQuizDefinition({
        version: 1,
        title: "X",
        scoring: "weighted-outcomes",
        outcomes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        questions: [
          {
            id: "q1",
            type: "scale",
            left: { text: "a-ish", scores: {} },
            right: { text: "b-ish", scores: { b: 1 } },
            steps: 5,
          },
        ],
      }),
    ).toThrow(/left side must score at least one target/);
  });
});

describe("normalizeResult", () => {
  it("stamps kind onto M1 stored results", () => {
    const legacy = { axes: [], type: "INTP", casedType: "intp" };
    expect(normalizeResult(legacy).kind).toBe("dimensions");
    const modern = { kind: "outcomes", scores: {}, winnerId: "x" };
    expect(normalizeResult(modern).kind).toBe("outcomes");
  });
});
