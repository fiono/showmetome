import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { AxisChart } from "../components";
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
    const scores: Record<string, number[]> = {};
    for (const axis of result.axes) scores[axis.dimension] = [axis.score];
    return (
      <div className="card">
        <h2>Your read on {name}</h2>
        <div className="hero-type mono">{result.casedType}</div>
        <p className="hero-sub">
          Capital letters are clear calls; lowercase means you put {name} nearer the middle.
        </p>
        <AxisChart dimensions={quiz.dimensions} scores={scores} names={["you"]} />
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
          {name} wants to know how their friends see them. For each pair, pick the side that
          sounds more like <b>{name}</b> &mdash; the middle box means &ldquo;equally
          both&rdquo;. Go fast; first instincts are the good ones.
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
        {quiz.questions.map((q) => (
          <div key={q.id} className={`pair${answers[q.id] !== undefined ? " pair-answered" : ""}`}>
            <div className="pair-left">{q.left.text}</div>
            <div className="scale" role="radiogroup" aria-label={`${q.left.text} vs ${q.right.text}`}>
              {Array.from({ length: q.steps }, (_, i) => i + 1).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={answers[q.id] === v}
                  title={
                    v === (q.steps + 1) / 2
                      ? "equally both"
                      : v < (q.steps + 1) / 2
                        ? q.left.text
                        : q.right.text
                  }
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                />
              ))}
            </div>
            <div className="pair-right">{q.right.text}</div>
          </div>
        ))}
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
