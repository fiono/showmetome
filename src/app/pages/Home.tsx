import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { subst } from "../components";
import { MIN_ROSTER, RosterFields, rosterNames } from "../RosterFields";
import type { QuizInfo, TemplateInfo } from "../../shared/types";

function quizMeta(scoring: TemplateInfo["scoring"], questionCount: number): string {
  return scoring === "alignment"
    ? "alignment chart"
    : `${questionCount} question${questionCount === 1 ? "" : "s"}`;
}

export function Home() {
  const [templates, setTemplates] = useState<TemplateInfo[] | null>(null);
  const [publicQuizzes, setPublicQuizzes] = useState<QuizInfo[]>([]);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [subjectName, setSubjectName] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [roster, setRoster] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.templates().then(setTemplates, (e) => setError(String(e)));
    api.publicQuizzes().then(setPublicQuizzes, () => {});
  }, []);

  const template = templates?.find((t) => t.id === featuredId) ?? templates?.[0];
  const otherTemplates = templates?.filter((t) => t.id !== template?.id) ?? [];
  const names = rosterNames(roster);

  async function create() {
    if (!template) return;
    if (mode === "individual" ? !subjectName.trim() : names.length < MIN_ROSTER) return;
    setBusy(true);
    setError(null);
    try {
      const round =
        mode === "individual"
          ? await api.createRound({ templateId: template.id }, subjectName.trim())
          : await api.createGroupRound({ templateId: template.id }, groupTitle.trim(), names);
      navigate(`/r/${round.ownerToken}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function feature(id: string) {
    setFeaturedId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <div className="card">
        <h2>Your friends take the quiz. You get the picture.</h2>
        <p className="small">
          Pick a quiz, but don&rsquo;t take it &mdash; send it to your friends and they answer
          <em> about you</em>. Or make it about a whole group: one person sorts everyone at
          once. Either way you see the consensus, where people agreed, and where they
          absolutely did not.
        </p>
      </div>

      <div className="card">
        <div className="featured-quiz">
          <h2>{template ? subst(template.title, "your friend") : "Loading…"}</h2>
          {template && (
            <>
              <p className="small">{subst(template.description ?? "", "your friend")}</p>
              <p className="small muted">
                {template.scoring === "alignment"
                  ? "no questions — just place people on the chart"
                  : `${template.questionCount} quick either/or questions`}
                {template.attribution && <> &middot; {template.attribution}</>}
              </p>

              <div className="mode-picker" style={{ margin: "12px 0 14px" }}>
                <button
                  type="button"
                  className="mode-option"
                  aria-pressed={mode === "individual"}
                  onClick={() => setMode("individual")}
                >
                  <b>About me</b>
                  <span className="small muted">Friends answer about you; you see how they see you.</span>
                </button>
                <button
                  type="button"
                  className="mode-option"
                  aria-pressed={mode === "group"}
                  onClick={() => setMode("group")}
                >
                  <b>About a group</b>
                  <span className="small muted">Sort 2–10 friends at once and see where everyone lands.</span>
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  create();
                }}
              >
                {mode === "individual" ? (
                  <>
                    <label htmlFor="subject">Your name, as your friends know you</label>
                    <div className="row">
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <input
                          id="subject"
                          type="text"
                          placeholder="e.g. Fiona"
                          value={subjectName}
                          maxLength={60}
                          onChange={(e) => setSubjectName(e.target.value)}
                        />
                      </div>
                      <button className="btn btn-primary" disabled={busy || !subjectName.trim()}>
                        {busy ? "Creating…" : "Create my round"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <RosterFields
                      idPrefix="home-roster"
                      groupTitle={groupTitle}
                      onGroupTitle={setGroupTitle}
                      roster={roster}
                      onRoster={setRoster}
                    />
                    <div className="row" style={{ marginTop: 12 }}>
                      <button
                        className="btn btn-primary"
                        disabled={busy || names.length < MIN_ROSTER}
                      >
                        {busy ? "Creating…" : "Create group round"}
                      </button>
                      {names.length < MIN_ROSTER && (
                        <span className="small muted">Add at least {MIN_ROSTER} names.</span>
                      )}
                    </div>
                  </>
                )}
              </form>
              {error && <p className="error">{error}</p>}
            </>
          )}
          {!template && error && <p className="error">{error}</p>}
        </div>

        {(otherTemplates.length > 0 || publicQuizzes.length > 0) && (
          <section className="block">
            <h3>More quizzes</h3>
            {otherTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="quiz-link quiz-link-button"
                onClick={() => feature(t.id)}
              >
                <span className="quiz-link-title">{subst(t.title, "your friend")}</span>
                {t.description && (
                  <span className="small muted"> {subst(t.description, "your friend")}</span>
                )}
                <span className="small muted"> &middot; {quizMeta(t.scoring, t.questionCount)}</span>
              </button>
            ))}
            {publicQuizzes.map((q) => (
              <Link key={q.id} to={`/q/${q.id}`} className="quiz-link">
                <span className="quiz-link-title">{subst(q.title, "your friend")}</span>
                {q.description && (
                  <span className="small muted"> {subst(q.description, "your friend")}</span>
                )}
                <span className="small muted">
                  {" "}
                  &middot; {quizMeta(q.scoring, q.questionCount)}
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
          Which kitchen appliance is your friend? Where does your group chat land on an
          alignment chart of your own design? Multiple choice and 1&ndash;5 questions scored
          toward outcomes or axes &mdash; or just name two axes.
        </p>
        <Link className="btn btn-primary" to="/build">
          Open the builder
        </Link>
      </div>
    </>
  );
}
