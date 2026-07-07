import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { AxisChart, OutcomeBars, subst } from "../components";
import { QuizForm } from "../QuizForm";
import { scoreSubmission } from "../../shared/scoring";
import type { Answers, QuizInfo, SubmissionResult } from "../../shared/types";

/**
 * Try the quiz exactly as a friend would see it, before starting a round.
 * Everything runs in the browser — answers are scored locally with the
 * shared scoring engine and nothing is saved.
 */
export function Preview() {
  const { quizId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const name = searchParams.get("name")?.trim() || "your friend";
  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    if (!quizId) return;
    api.quizInfo(quizId).then(setQuiz, (e) => setError(e.message ?? String(e)));
  }, [quizId]);

  if (error && !quiz) return <div className="card error">{error}</div>;
  if (!quiz?.definition) return <div className="card small">Loading…</div>;
  const def = quiz.definition;

  function tryAnswers(answers: Answers) {
    setResult(scoreSubmission(quiz!.definition!, answers));
    window.scrollTo(0, 0);
  }

  if (result) {
    return (
      <>
        <div className="callout">
          <b>Preview result — nothing was saved.</b> In a real round this read would be
          blended into the consensus on your dashboard.
        </div>
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
                dimensions={def.dimensions!}
                scores={Object.fromEntries(result.axes.map((a) => [a.dimension, [a.score]]))}
              />
            </>
          ) : (
            <>
              <div className="hero-type hero-outcome">
                {def.outcomes!.find((o) => o.id === result.winnerId)?.label}
              </div>
              <p className="hero-sub">
                {(() => {
                  const desc = def.outcomes!.find((o) => o.id === result.winnerId)?.description;
                  return desc ? subst(desc, name) : "That's the verdict this set of answers gives.";
                })()}
              </p>
              <OutcomeBars
                outcomes={def.outcomes!}
                totals={outcomeTotalsOf(result.scores)}
                winnerId={result.winnerId}
              />
            </>
          )}
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn" onClick={() => setResult(null)}>
              try different answers
            </button>
            <Link className="btn btn-primary" to={`/q/${quizId}`}>
              Looks good — start a round
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="callout">
        <b>Preview — this is what your friends will see.</b> Answer away; nothing is saved.
        {" "}
        <Link to={`/q/${quizId}`}>&larr; back to start a round</Link>
      </div>

      <div className="card">
        <h1 className="quiz-hero-title">{subst(def.title, name)}</h1>
        {def.description && <p className="quiz-hero-desc">{subst(def.description, name)}</p>}
        <p className="small">
          You&rsquo;re answering this <em>about {name}</em> &mdash; pick whatever sounds most
          like <b>{name}</b>, and go fast; first instincts are the good ones. When the answers
          come in, {name} sees the consensus, where their friends agreed, and where they
          absolutely did not.
        </p>
      </div>

      <QuizForm
        quiz={def}
        subjectName={name}
        submitLabel="See the result (preview)"
        incompleteLabel="Answer all to preview"
        busy={false}
        onSubmit={tryAnswers}
      />
    </>
  );
}

function outcomeTotalsOf(scores: Record<string, number>) {
  const grand = Object.values(scores).reduce((a, b) => a + b, 0);
  return Object.entries(scores)
    .map(([id, total]) => ({ id, total, share: grand > 0 ? total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}
