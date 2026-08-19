import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AlignmentBoard } from "../AlignmentBoard";
import { subst } from "../components";
import { QuizForm } from "../QuizForm";
import type { Answers, OwnerView } from "../../shared/types";

/** The subject answers their own quiz; compared against friends on the dashboard. */
export function SelfTake() {
  const { ownerToken } = useParams<{ ownerToken: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<OwnerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ownerToken) return;
    api.ownerView(ownerToken).then(setView, (e) => setError(e.message ?? String(e)));
  }, [ownerToken]);

  async function submit(answers: Answers) {
    if (!ownerToken) return;
    setBusy(true);
    setError(null);
    try {
      await api.submitSelf(ownerToken, answers);
      navigate(`/r/${ownerToken}#gap`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (error && !view) return <div className="card error">{error}</div>;
  if (!view || !ownerToken) return <div className="card small">Loading…</div>;

  const name = view.round.subjectName;

  return (
    <>
      <div className="card">
        <h2>Now you, {name}</h2>
        <p className="small">
          Answer <b>{subst(view.quiz.title, name)}</b> about yourself, honestly. Your answers
          stay out of your friends&rsquo; consensus &mdash; they become the other side of the
          comparison: how you see yourself vs. how they see you.
          {view.selfSubmission && " Submitting again replaces your previous answers."}
        </p>
        <p className="small">
          <Link to={`/r/${ownerToken}`}>&larr; back to your results</Link>
        </p>
      </div>

      {view.quiz.definition.scoring === "alignment" ? (
        <AlignmentBoard
          quiz={view.quiz.definition}
          subjectName="yourself"
          submitLabel="Compare me to my friends"
          busy={busy}
          error={error}
          onSubmit={submit}
        />
      ) : (
        <QuizForm
          quiz={view.quiz.definition}
          subjectName={name}
          submitLabel="Compare me to my friends"
          busy={busy}
          error={error}
          onSubmit={submit}
        />
      )}
    </>
  );
}
