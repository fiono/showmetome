import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { subst } from "../components";
import type { QuizInfo, TemplateInfo } from "../../shared/types";

export function Home() {
  const [templates, setTemplates] = useState<TemplateInfo[] | null>(null);
  const [publicQuizzes, setPublicQuizzes] = useState<QuizInfo[]>([]);
  const [subjectName, setSubjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.templates().then(setTemplates, (e) => setError(String(e)));
    api.publicQuizzes().then(setPublicQuizzes, () => {});
  }, []);

  const [templateIndex, setTemplateIndex] = useState(0);
  const template = templates?.[templateIndex];

  async function create() {
    if (!template || !subjectName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const round = await api.createRound({ templateId: template.id }, subjectName.trim());
      navigate(`/r/${round.ownerToken}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Your friends take the quiz. You get the picture.</h2>
        <p className="small">
          Pick a quiz, but don&rsquo;t take it &mdash; send it to your friends and they answer
          every question <em>about you</em>. When the answers come in, you see the consensus,
          where they agreed, and where they absolutely did not.
        </p>
      </div>

      <div className="card">
        <div className="featured-quiz">
          <h2>{template ? template.title : "Loading…"}</h2>
          {template && (
            <>
              <p className="small">{subst(template.description ?? "", "your friend")}</p>
              <p className="small muted">
                {template.scoring === "alignment"
                  ? "no questions — friends place you straight on the chart"
                  : `${template.questionCount} quick either/or questions`}{" "}
                &middot; {template.attribution}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  create();
                }}
              >
                <label htmlFor="subject">Who is this about? (probably you)</label>
                <div className="row">
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <input
                      id="subject"
                      type="text"
                      placeholder="Your name, as your friends know you"
                      value={subjectName}
                      maxLength={60}
                      onChange={(e) => setSubjectName(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-primary" disabled={busy || !subjectName.trim()}>
                    {busy ? "Creating…" : "Create my round"}
                  </button>
                </div>
              </form>
              {error && <p className="error">{error}</p>}
              {templates && templates.length > 1 && (
                <p className="small muted" style={{ marginTop: 10 }}>
                  Or start with:{" "}
                  {templates.map(
                    (t, i) =>
                      i !== templateIndex && (
                        <button
                          key={t.id}
                          type="button"
                          className="btn btn-small"
                          onClick={() => setTemplateIndex(i)}
                        >
                          {subst(t.title, "your friend")}
                        </button>
                      ),
                  )}
                </p>
              )}
            </>
          )}
          {!template && error && <p className="error">{error}</p>}
        </div>

        {publicQuizzes.length > 0 && (
          <section className="block">
            <h3>More quizzes, from users</h3>
            {publicQuizzes.map((q) => (
              <Link key={q.id} to={`/q/${q.id}`} className="quiz-link">
                <span className="quiz-link-title">{subst(q.title, "your friend")}</span>
                {q.description && (
                  <span className="small muted"> {subst(q.description, "your friend")}</span>
                )}
                <span className="small muted">
                  {" "}
                  &middot;{" "}
                  {q.scoring === "alignment"
                    ? "alignment chart"
                    : `${q.questionCount} question${q.questionCount === 1 ? "" : "s"}`}
                  {q.submissionCount > 0 && (
                    <>
                      {" "}
                      &middot; answered {q.submissionCount} time
                      {q.submissionCount === 1 ? "" : "s"}
                    </>
                  )}
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>

      <div className="card">
        <h2>Or build your own quiz</h2>
        <p className="small">
          Which kitchen appliance is your friend? What&rsquo;s their love language, according
          to everyone but them? Multiple choice and 1&ndash;5 questions, scored toward
          outcomes or axes.
        </p>
        <Link className="btn btn-primary" to="/build">
          Open the builder
        </Link>
      </div>
    </>
  );
}
