import { describe, expect, it } from "vitest";
import { aggregateRound, scoreSubmission, scoreToBin, validateAnswers } from "./scoring";
import { MBTI_QUIZ } from "./templates/mbti";
import type { Answers } from "./types";

/** Answers pushed fully toward each pole named in `targets` (one per dimension). */
function answersToward(targets: Record<string, string>): Answers {
  const answers: Answers = {};
  for (const q of MBTI_QUIZ.questions) {
    const target = targets[q.dimension];
    answers[q.id] = q.left.pole === target ? 1 : q.steps;
  }
  return answers;
}

function neutralAnswers(): Answers {
  const answers: Answers = {};
  for (const q of MBTI_QUIZ.questions) answers[q.id] = (q.steps + 1) / 2;
  return answers;
}

describe("MBTI template structure", () => {
  it("has 32 items, 8 per axis, with poles matching each item's dimension", () => {
    expect(MBTI_QUIZ.questions).toHaveLength(32);
    for (const d of MBTI_QUIZ.dimensions) {
      const items = MBTI_QUIZ.questions.filter((q) => q.dimension === d.id);
      expect(items, d.id).toHaveLength(8);
      for (const q of items) {
        expect(new Set([q.left.pole, q.right.pole])).toEqual(new Set(d.poles));
      }
    }
  });
});

describe("scoreSubmission", () => {
  it("scores fully-directed answers as clear outer-bin results", () => {
    const result = scoreSubmission(
      MBTI_QUIZ,
      answersToward({ EI: "E", SN: "N", TF: "F", JP: "P" }),
    );
    expect(result.type).toBe("ENFP");
    expect(result.casedType).toBe("ENFP");
    for (const axis of result.axes) {
      expect(Math.abs(axis.score)).toBe(1);
      expect(axis.strength).toBe("clear");
      expect([1, 5]).toContain(axis.bin);
    }
  });

  it("breaks perfect ties toward I, N, F, P with lowercase letters", () => {
    const result = scoreSubmission(MBTI_QUIZ, neutralAnswers());
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
    for (const q of MBTI_QUIZ.questions) {
      if (q.dimension === "TF") answers[q.id] = 3; // reset TF to neutral
      if (q.dimension === "JP") answers[q.id] = 3; // reset JP to neutral
    }
    const tf = MBTI_QUIZ.questions.filter((q) => q.dimension === "TF");
    const jp = MBTI_QUIZ.questions.filter((q) => q.dimension === "JP");
    for (const q of tf.slice(0, 2)) answers[q.id] = q.left.pole === "F" ? 2 : 4;
    for (const q of jp.slice(0, 6)) answers[q.id] = q.left.pole === "P" ? 2 : 4;

    const result = scoreSubmission(MBTI_QUIZ, answers);
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
    expect(() => validateAnswers(MBTI_QUIZ, { ...good, nope: 3 })).toThrow(/unknown/);
  });
});

describe("aggregateRound", () => {
  const sub = (answers: Answers) => ({ answers, result: scoreSubmission(MBTI_QUIZ, answers) });

  it("returns an empty aggregate for zero submissions", () => {
    const agg = aggregateRound(MBTI_QUIZ, []);
    expect(agg.submissionCount).toBe(0);
    expect(agg.consensus).toBeNull();
    expect(agg.typeTally).toEqual([]);
  });

  it("averages opposite extremes to a neutral consensus and tallies both verdicts", () => {
    const a = sub(answersToward({ EI: "E", SN: "S", TF: "T", JP: "J" }));
    const b = sub(answersToward({ EI: "I", SN: "N", TF: "F", JP: "P" }));
    const agg = aggregateRound(MBTI_QUIZ, [a, b]);

    expect(agg.submissionCount).toBe(2);
    expect(agg.consensus!.type).toBe("INFP"); // ties break to I,N,F,P
    expect(agg.consensus!.axes.every((x) => x.score === 0)).toBe(true);
    expect(agg.typeTally).toEqual([
      { type: "ESTJ", count: 1 }, // sorted alphabetically at equal counts
      { type: "INFP", count: 1 },
    ]);
    expect(agg.axisScores.EI).toEqual([1, -1]);

    // Every question got one 1 and one 5 (opposite extremes): max disagreement.
    for (const q of agg.questions) {
      expect(q.total).toBe(2);
      expect(q.counts[0]).toBe(1);
      expect(q.counts[4]).toBe(1);
      expect(q.mean).toBe(3);
      expect(q.sd).toBe(2);
    }
  });

  it("agreeing friends produce a clear consensus and zero spread", () => {
    const answers = answersToward({ EI: "I", SN: "N", TF: "T", JP: "P" });
    const agg = aggregateRound(MBTI_QUIZ, [sub(answers), sub(answers), sub(answers)]);
    expect(agg.consensus!.type).toBe("INTP");
    expect(agg.consensus!.casedType).toBe("INTP");
    expect(agg.typeTally).toEqual([{ type: "INTP", count: 3 }]);
    for (const q of agg.questions) expect(q.sd).toBe(0);
  });
});
