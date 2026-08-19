import { useState } from "react";
import { AlignmentBoard } from "./AlignmentBoard";
import { AlignmentChart } from "./AlignmentChart";
import { AxisChart, OutcomeBars, subst } from "./components";
import { QuizForm } from "./QuizForm";
import { scoreSubmission } from "../shared/scoring";
import type { Answers, QuizDefinition, SubmissionResult } from "../shared/types";

/**
 * The friend experience, live: header, questions, and a locally-scored
 * result. Pure browser-side — nothing is saved. `name` can change on every
 * keystroke; all {name} substitution follows it.
 */
export function QuizPreview(props: {
  quiz: QuizDefinition;
  name: string;
  /** Called from the result screen's "start a round" action. */
  onUseIt?: () => void;
}) {
  const { quiz, name } = props;
  const [result, setResult] = useState<SubmissionResult | null>(null);

  function tryAnswers(answers: Answers) {
    setResult(scoreSubmission(quiz, answers));
  }

  if (result) {
    return (
      <div className="card">
        <h2>A friend&rsquo;s read on {name}</h2>
        {result.kind === "dimensions" ? (
          <>
            <div className="hero-type mono">{result.casedType}</div>
            <p className="hero-sub">
              Capital letters are clear calls; lowercase means the answers sat nearer the
              middle.
            </p>
            <AxisChart
              dimensions={quiz.dimensions!}
              scores={Object.fromEntries(result.axes.map((a) => [a.dimension, [a.score]]))}
            />
          </>
        ) : result.kind === "alignment" ? (
          <>
            <div className="hero-type hero-outcome">{result.quadrant}</div>
            <p className="hero-sub">That&rsquo;s the verdict for this spot on the chart.</p>
            <AlignmentChart
              axes={quiz.alignment!}
              points={[{ x: result.x, y: result.y, name }]}
            />
          </>
        ) : (
          <>
            <div className="hero-type hero-outcome">
              {quiz.outcomes!.find((o) => o.id === result.winnerId)?.label}
            </div>
            <p className="hero-sub">
              {(() => {
                const desc = quiz.outcomes!.find((o) => o.id === result.winnerId)?.description;
                return desc ? subst(desc, name) : "That's the verdict this set of answers gives.";
              })()}
            </p>
            <OutcomeBars
              outcomes={quiz.outcomes!}
              totals={outcomeTotalsOf(result.scores)}
              winnerId={result.winnerId}
            />
          </>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>
          Preview only — nothing was saved. In a real round this read joins the consensus.
        </p>
        <div className="row">
          <button className="btn btn-small" onClick={() => setResult(null)}>
            try different answers
          </button>
          {props.onUseIt && (
            <button className="btn btn-small btn-primary" onClick={props.onUseIt}>
              Looks good — start a round
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h1 className="quiz-hero-title">{subst(quiz.title, name)}</h1>
        {quiz.description && <p className="quiz-hero-desc">{subst(quiz.description, name)}</p>}
        <p className="small">
          {quiz.scoring === "alignment" ? (
            <>
              No questions &mdash; just drop <b>{name}</b> where they belong on the chart and
              see the verdict.
            </>
          ) : (
            <>
              You&rsquo;re answering this <em>about {name}</em> &mdash; pick whatever sounds
              most like <b>{name}</b>, and go fast; first instincts are the good ones. When
              the answers come in, {name} sees the consensus, where their friends agreed, and
              where they absolutely did not.
            </>
          )}
        </p>
      </div>

      {quiz.scoring === "alignment" ? (
        <AlignmentBoard
          quiz={quiz}
          subjectName={name}
          submitLabel="See the result (preview)"
          busy={false}
          onSubmit={tryAnswers}
        />
      ) : (
        <QuizForm
          quiz={quiz}
          subjectName={name}
          submitLabel="See the result (preview)"
          incompleteLabel="Answer all to preview"
          busy={false}
          onSubmit={tryAnswers}
        />
      )}
    </>
  );
}

function outcomeTotalsOf(scores: Record<string, number>) {
  const grand = Object.values(scores).reduce((a, b) => a + b, 0);
  return Object.entries(scores)
    .map(([id, total]) => ({ id, total, share: grand > 0 ? total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}
