import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CopyButton, subst } from "../components";
import { QuizPreview } from "../QuizPreview";
import type { QuizInfo } from "../../shared/types";

const MIN_ROSTER = 2;
const MAX_ROSTER = 10;

/** Home of a saved quiz: bookmarkable, starts new rounds of it. */
export function QuizStart() {
  const { quizId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [subjectName, setSubjectName] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [roster, setRoster] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quizId) return;
    api.quizInfo(quizId).then(setQuiz, (e) => setError(e.message ?? String(e)));
  }, [quizId]);

  async function start() {
    if (!quizId || !subjectName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const round = await api.createRound({ quizId }, subjectName.trim());
      navigate(`/r/${round.ownerToken}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const names = roster.map((n) => n.trim()).filter(Boolean);
  const groupReady = names.length >= MIN_ROSTER;

  function setName(i: number, value: string) {
    setRoster((r) => r.map((n, j) => (j === i ? value : n)));
  }
  function addName() {
    setRoster((r) => (r.length >= MAX_ROSTER ? r : [...r, ""]));
  }
  function removeName(i: number) {
    setRoster((r) => (r.length <= MIN_ROSTER ? r : r.filter((_, j) => j !== i)));
  }

  async function startGroup() {
    if (!quizId || !groupReady) return;
    setBusy(true);
    setError(null);
    try {
      const round = await api.createGroupRound({ quizId }, groupTitle.trim(), names);
      navigate(`/r/${round.ownerToken}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (error && !quiz) return <div className="card error">{error}</div>;
  if (!quiz) return <div className="card small">Loading…</div>;

  const previewName = subjectName.trim() || "your friend";

  return (
    <>
      {isNew && (
        <div className="callout">
          <b>Quiz saved.</b> This page is its home — bookmark it to start more rounds later.
        </div>
      )}
      <div className="card">
        <h2>{subst(quiz.title, "your friend")}</h2>
        {quiz.description && <p className="small">{subst(quiz.description, "your friend")}</p>}
        <p className="small muted">
          {quiz.scoring === "alignment"
            ? "alignment chart"
            : `${quiz.questionCount} question${quiz.questionCount === 1 ? "" : "s"}`}
          {quiz.roundCount > 0 && (
            <>
              {" "}
              &middot; {quiz.roundCount} round{quiz.roundCount === 1 ? "" : "s"} started
            </>
          )}
          {quiz.submissionCount > 0 && (
            <>
              {" "}
              &middot; answered {quiz.submissionCount} time{quiz.submissionCount === 1 ? "" : "s"}
            </>
          )}
          {quiz.attribution ? <> &middot; {quiz.attribution}</> : null}
        </p>
        <div className="linkbox">
          <code>{`${location.origin}/q/${quiz.id}`}</code>
          <CopyButton text={`${location.origin}/q/${quiz.id}`} />
          <Link className="btn btn-small" to={`/build?from=${quiz.id}`} title="Open a copy of this quiz in the builder">
            clone &amp; edit
          </Link>
        </div>
        <label>Start a round</label>
        <div className="mode-picker" style={{ margin: "6px 0 14px" }}>
          <button
            type="button"
            className="mode-option"
            aria-pressed={mode === "individual"}
            onClick={() => setMode("individual")}
          >
            <b>One person</b>
            <span className="small muted">Friends answer about a single subject.</span>
          </button>
          <button
            type="button"
            className="mode-option"
            aria-pressed={mode === "group"}
            onClick={() => setMode("group")}
          >
            <b>A group</b>
            <span className="small muted">Sort 2–10 friends through the quiz at once.</span>
          </button>
        </div>

        {mode === "individual" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <label htmlFor="subject">Who is it about?</label>
            <div className="row">
              <div style={{ flex: 1, minWidth: 200 }}>
                <input
                  id="subject"
                  type="text"
                  placeholder="The subject's name, as their friends know them"
                  value={subjectName}
                  maxLength={60}
                  onChange={(e) => setSubjectName(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" disabled={busy || !subjectName.trim()}>
                {busy ? "Creating…" : "Create round"}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startGroup();
            }}
          >
            <label htmlFor="grouptitle">Group name (optional)</label>
            <input
              id="grouptitle"
              type="text"
              placeholder="e.g. the book club, my roommates"
              value={groupTitle}
              maxLength={60}
              onChange={(e) => setGroupTitle(e.target.value)}
            />
            <label style={{ marginTop: 12 }}>
              Who&rsquo;s in the group? ({names.length}/{MAX_ROSTER})
            </label>
            {roster.map((name, i) => (
              <div className="draft-row" key={i}>
                <input
                  type="text"
                  aria-label={`Friend ${i + 1}`}
                  placeholder={`Friend ${i + 1}`}
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(i, e.target.value)}
                />
                {roster.length > MIN_ROSTER && (
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() => removeName(i)}
                    aria-label={`Remove friend ${i + 1}`}
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
            <div className="row" style={{ marginTop: 4 }}>
              {roster.length < MAX_ROSTER && (
                <button type="button" className="btn btn-small" onClick={addName}>
                  + add friend
                </button>
              )}
              <button className="btn btn-primary" disabled={busy || !groupReady}>
                {busy ? "Creating…" : "Create group round"}
              </button>
            </div>
            {!groupReady && (
              <p className="small muted" style={{ marginTop: 6 }}>
                Add at least {MIN_ROSTER} names to start.
              </p>
            )}
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {mode === "individual" && quiz.definition && (
        <div className="preview-frame">
          <div className="preview-frame-label">
            Preview — what {previewName} will see, as you fill in the name above. Nothing here
            is saved.
          </div>
          <QuizPreview
            key={quiz.id}
            quiz={quiz.definition}
            name={previewName}
            onUseIt={subjectName.trim() ? start : undefined}
          />
        </div>
      )}
    </>
  );
}
