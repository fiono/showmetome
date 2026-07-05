import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { AxisChart, OutcomeBars, subst } from "../components";
import type { Answers, ShareView, SubmissionResult } from "../../shared/types";

export function Submit() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [view, setView] = useState<ShareView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [respondentName, setRespondentName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    if (!shareToken) return;
    api.shareView(shareToken).then(setView, (e) => setError(e.message ?? String(e)));
  }, [shareToken]);

  const quiz = view?.quiz.definition;
  const answered = useMemo(
    () => (quiz ? quiz.questions.filter((q) => answers[q.id] !== undefined).length : 0),
    [quiz, answers],
  );
  const total = quiz?.questions.length ?? 0;
  const complete = total > 0 && answered === total;

  async function submit() {
    if (!shareToken || !complete) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.submit(shareToken, respondentName, answers);
      setResult(res.result);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !view) return <div className="card error">{error}</div>;
  if (!view || !quiz) return <div className="card small">Loading…</div>;

  const name = view.subjectName;

  if (result) {
    return (
      <div className="card">
        <h2>Your read on {name}</h2>
        {result.kind === "dimensions" ? (
          <>
            <div className="hero-type mono">{result.casedType}</div>
            <p className="hero-sub">
              Capital letters are clear calls; lowercase means you put {name} nearer the middle.
            </p>
            <AxisChart
              dimensions={quiz.dimensions!}
              scores={Object.fromEntries(result.axes.map((a) => [a.dimension, [a.score]]))}
              names={["you"]}
            />
          </>
        ) : (
          <>
            <div className="hero-type hero-outcome">
              {quiz.outcomes!.find((o) => o.id === result.winnerId)?.label}
            </div>
            <p className="hero-sub">
              {quiz.outcomes!.find((o) => o.id === result.winnerId)?.description ??
                `That's your verdict on ${name}.`}
            </p>
            <OutcomeBars
              outcomes={quiz.outcomes!}
              totals={outcomeTotalsOf(result.scores)}
              winnerId={result.winnerId}
            />
          </>
        )}
        <p className="small" style={{ marginTop: 18 }}>
          Your answers are saved &mdash; {name} will see them blended with everyone
          else&rsquo;s.
        </p>
        <p className="small">
          <Link to="/">Make your own round &rarr;</Link>
        </p>
      </div>
    );
  }

  if (view.status !== "open") {
    return (
      <div className="card">
        <h2>This round is closed</h2>
        <p className="small">
          {name} isn&rsquo;t collecting answers any more. <Link to="/">Make your own?</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2>How well do you know {name}?</h2>
        <p className="small">
          {name} wants to know how their friends see them &mdash; this is{" "}
          <b>{subst(view.quiz.title, name)}</b>, answered <em>about {name}</em>. Pick whatever
          sounds most like <b>{name}</b>. Go fast; first instincts are the good ones.
        </p>
        <label htmlFor="respondent">Your name (so {name} knows who said what)</label>
        <input
          id="respondent"
          type="text"
          placeholder="Optional, but be brave"
          value={respondentName}
          maxLength={60}
          onChange={(e) => setRespondentName(e.target.value)}
        />
      </div>

      <div className="card">
        {quiz.questions.map((q) =>
          q.type === "scale" ? (
            <div
              key={q.id}
              className={`pair${answers[q.id] !== undefined ? " pair-answered" : ""}`}
            >
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

      {error && <p className="error">{error}</p>}

      <div className="progressbar">
        <span className="small" style={{ whiteSpace: "nowrap" }}>
          {answered} / {total}
        </span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${total ? (answered / total) * 100 : 0}%` }} />
        </div>
        <button className="btn btn-primary" disabled={!complete || busy} onClick={submit}>
          {busy ? "Sending…" : complete ? `Send to ${name}` : "Answer all to send"}
        </button>
      </div>
    </>
  );
}

function outcomeTotalsOf(scores: Record<string, number>) {
  const grand = Object.values(scores).reduce((a, b) => a + b, 0);
  return Object.entries(scores)
    .map(([id, total]) => ({ id, total, share: grand > 0 ? total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}
