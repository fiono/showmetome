import { useMemo, useState } from "react";
import { subst } from "./components";
import type { Answers, QuizDefinition } from "../shared/types";

/**
 * The answer-every-question form with sticky progress bar. Used by the
 * friend submit flow and the subject's own self-take.
 */
export function QuizForm(props: {
  quiz: QuizDefinition;
  /** Question text renders {name} as this. */
  subjectName: string;
  submitLabel: string;
  busy: boolean;
  error?: string | null;
  onSubmit: (answers: Answers) => void;
}) {
  const { quiz, subjectName: name } = props;
  const [answers, setAnswers] = useState<Answers>({});

  const answered = useMemo(
    () => quiz.questions.filter((q) => answers[q.id] !== undefined).length,
    [quiz, answers],
  );
  const total = quiz.questions.length;
  const complete = total > 0 && answered === total;

  return (
    <>
      <div className="card">
        {quiz.questions.map((q) =>
          q.type === "scale" ? (
            <div
              key={q.id}
              className={`pair${q.prompt ? " pair-headed" : ""}${answers[q.id] !== undefined ? " pair-answered" : ""}`}
            >
              {q.prompt && <div className="pair-header">{subst(q.prompt, name)}</div>}
              <div className="pair-left">{subst(q.left.text, name)}</div>
              <div
                className="scale"
                role="radiogroup"
                aria-label={`${subst(q.left.text, name)} vs ${subst(q.right.text, name)}`}
              >
                {Array.from({ length: q.steps }, (_, i) => i + 1).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={answers[q.id] === v}
                    title={
                      v === (q.steps + 1) / 2
                        ? "equally both"
                        : v < (q.steps + 1) / 2
                          ? subst(q.left.text, name)
                          : subst(q.right.text, name)
                    }
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                  />
                ))}
              </div>
              <div className="pair-right">{subst(q.right.text, name)}</div>
            </div>
          ) : (
            <div
              key={q.id}
              className={`choice${answers[q.id] !== undefined ? " pair-answered" : ""}`}
            >
              <div className="choice-text">{subst(q.text, name)}</div>
              <div className="choice-options" role="radiogroup" aria-label={subst(q.text, name)}>
                {q.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="choice-option"
                    aria-pressed={answers[q.id] === o.id}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                  >
                    {subst(o.text, name)}
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      {props.error && <p className="error">{props.error}</p>}

      <div className="progressbar">
        <span className="small" style={{ whiteSpace: "nowrap" }}>
          {answered} / {total}
        </span>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
          />
        </div>
        <button
          className="btn btn-primary"
          disabled={!complete || props.busy}
          onClick={() => props.onSubmit(answers)}
        >
          {props.busy ? "Sending…" : complete ? props.submitLabel : "Answer all to send"}
        </button>
      </div>
    </>
  );
}
