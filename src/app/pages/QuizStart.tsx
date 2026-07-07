import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CopyButton, subst } from "../components";
import type { QuizInfo } from "../../shared/types";

/** Home of a saved quiz: bookmarkable, starts new rounds of it. */
export function QuizStart() {
  const { quizId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
  const [subjectName, setSubjectName] = useState("");
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

  if (error && !quiz) return <div className="card error">{error}</div>;
  if (!quiz) return <div className="card small">Loading…</div>;

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
          {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"}
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
          <Link
            className="btn btn-small"
            to={`/q/${quiz.id}/preview${subjectName.trim() ? `?name=${encodeURIComponent(subjectName.trim())}` : ""}`}
            title="See the quiz exactly as your friends will — nothing gets saved"
          >
            preview as a friend
          </Link>
          <Link className="btn btn-small" to={`/build?from=${quiz.id}`} title="Open a copy of this quiz in the builder">
            clone &amp; edit
          </Link>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <label htmlFor="subject">Start a round — who is it about?</label>
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
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
