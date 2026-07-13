import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AxisChart, OutcomeBars, subst } from "../components";
import { ComparisonView } from "../Comparison";
import { GroupBoard } from "../GroupBoard";
import { GroupResults, type GroupEntry } from "../GroupResults";
import { QuizForm } from "../QuizForm";
import type {
  Answers,
  GroupAnswers,
  GroupSittingResponse,
  ShareView,
  SubmitResponse,
} from "../../shared/types";

/** Post-submit viral loop: start your own round of the same quiz. */
function YourTurn(props: { quizId: string; heading?: string }) {
  const navigate = useNavigate();
  const [myName, setMyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!myName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const round = await api.createRound({ quizId: props.quizId }, myName.trim());
      navigate(`/r/${round.ownerToken}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{props.heading ?? "Your turn"}</h2>
      <p className="small">
        Get your own link for this quiz &mdash; send it to your friends and find out how{" "}
        <em>they</em> see <em>you</em>.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <div className="row">
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              aria-label="Your name"
              placeholder="Your name, as your friends know you"
              value={myName}
              maxLength={60}
              onChange={(e) => setMyName(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" disabled={busy || !myName.trim()}>
            {busy ? "Creating…" : "Get my link"}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Group flow: sort the whole roster on the board, then see everyone's result. */
function GroupSubmit(props: { shareToken: string; view: ShareView }) {
  const { view } = props;
  const subjects = view.subjects ?? [];
  const quiz = view.quiz.definition;
  const [respondentName, setRespondentName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<GroupSittingResponse | null>(null);

  const colorOf = useMemo(() => {
    const m: Record<string, number> = {};
    subjects.forEach((s, i) => (m[s.id] = i));
    return m;
  }, [subjects]);

  async function submit(answersBySubject: GroupAnswers) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.submitSitting(props.shareToken, respondentName, answersBySubject);
      setDone(res);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const entries: GroupEntry[] = subjects.map((subject) => ({
      subject,
      result: done.results[subject.id],
    }));
    return (
      <>
        <GroupResults quiz={quiz} entries={entries} colorOf={colorOf} groupTitle={view.subjectName} />
        <YourTurn quizId={view.quizId} heading="Now find out what you are" />
      </>
    );
  }

  if (view.status !== "open") {
    return (
      <>
        <div className="card">
          <h2>This round is closed</h2>
          <p className="small">This group isn&rsquo;t collecting answers any more.</p>
        </div>
        <YourTurn quizId={view.quizId} heading="Start your own instead" />
      </>
    );
  }

  return (
    <>
      <div className="card">
        <h1 className="quiz-hero-title">{subst(view.quiz.title, view.subjectName)}</h1>
        {view.quiz.description && (
          <p className="quiz-hero-desc">{subst(view.quiz.description, view.subjectName)}</p>
        )}
        <p className="small">
          Sort <b>{view.subjectName}</b> ({subjects.length} people) &mdash; on each question,
          place every friend into the answer that fits. <b>Tap a friend, then tap their
          answer</b> (or drag them in). Use <em>&ldquo;+ everyone else&rdquo;</em> to drop the
          rest into one answer. You only read each question once.
        </p>
        <label htmlFor="respondent">Your name (optional)</label>
        <input
          id="respondent"
          type="text"
          placeholder="Leave blank to stay anonymous"
          value={respondentName}
          maxLength={60}
          onChange={(e) => setRespondentName(e.target.value)}
        />
      </div>

      <GroupBoard
        quiz={quiz}
        subjects={subjects}
        submitLabel="See everyone's results"
        busy={busy}
        error={error}
        onSubmit={submit}
      />
    </>
  );
}

export function Submit() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [view, setView] = useState<ShareView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [respondentName, setRespondentName] = useState("");
  const [done, setDone] = useState<{ response: SubmitResponse; answers: Answers } | null>(null);
  const [answerAgain, setAnswerAgain] = useState(false);

  useEffect(() => {
    if (!shareToken) return;
    api.shareView(shareToken).then(setView, (e) => setError(e.message ?? String(e)));
  }, [shareToken]);

  async function submit(answers: Answers) {
    if (!shareToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.submit(shareToken, respondentName, answers);
      setDone({ response, answers });
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !view) return <div className="card error">{error}</div>;
  if (!view) return <div className="card small">Loading…</div>;

  if (view.mode === "group") return <GroupSubmit shareToken={shareToken!} view={view} />;

  const quiz = view.quiz.definition;
  const name = view.subjectName;

  if (done) {
    const { result, others } = done.response;
    return (
      <>
        <div className="card">
          <h2>Your read on {name}</h2>
          {result.kind === "dimensions" ? (
            <>
              <div className="hero-type mono">{result.casedType}</div>
              <p className="hero-sub">
                Capital letters are clear calls; lowercase means you put {name} nearer the
                middle.
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
                {(() => {
                  const desc = quiz.outcomes!.find((o) => o.id === result.winnerId)?.description;
                  return desc ? subst(desc, name) : `That's your verdict on ${name}.`;
                })()}
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
        </div>

        {others ? (
          <div className="card">
            <h2>
              You vs. the other {others.count} friend{others.count === 1 ? "" : "s"}
            </h2>
            <ComparisonView
              quiz={quiz}
              subjectName={name}
              groupLabel={`the other ${others.count} friend${others.count === 1 ? "" : "s"}`}
              aggregate={others.aggregate}
              yourAnswers={done.answers}
              yourResult={result}
            />
          </div>
        ) : (
          <div className="card">
            <h2>You&rsquo;re the first!</h2>
            <p className="small">
              No one else has answered about {name} yet, so there&rsquo;s nothing to compare
              against &mdash; but your answers are in.
            </p>
          </div>
        )}

        <YourTurn quizId={view.quizId} heading={`Now find out what you are`} />
      </>
    );
  }

  if (view.status !== "open") {
    return (
      <>
        <div className="card">
          <h2>This round is closed</h2>
          <p className="small">{name} isn&rsquo;t collecting answers any more.</p>
        </div>
        <YourTurn quizId={view.quizId} heading="Take it for yourself instead" />
      </>
    );
  }

  if (view.alreadyAnswered && !answerAgain) {
    return (
      <>
        <div className="card">
          <h2>Looks like you already answered this one</h2>
          <p className="small">
            This browser has already sent {name} its read. Answering again adds a second
            submission &mdash; it won&rsquo;t replace your first, and {name} can see and
            delete duplicates.
          </p>
          <button className="btn" onClick={() => setAnswerAgain(true)}>
            Answer again anyway
          </button>
        </div>
        <YourTurn quizId={view.quizId} heading="Or find out what you are" />
      </>
    );
  }

  return (
    <>
      <div className="card">
        <h1 className="quiz-hero-title">{subst(view.quiz.title, name)}</h1>
        {view.quiz.description && (
          <p className="quiz-hero-desc">{subst(view.quiz.description, name)}</p>
        )}
        <p className="small">
          You&rsquo;re answering this <em>about {name}</em> &mdash; pick whatever sounds most
          like <b>{name}</b>, and go fast; first instincts are the good ones. When the answers
          come in, {name} sees the consensus, where their friends agreed, and where they
          absolutely did not.
        </p>
        <label htmlFor="respondent">Your name (so {name} knows who said what)</label>
        <input
          id="respondent"
          type="text"
          placeholder="Leave blank to answer anonymously"
          value={respondentName}
          maxLength={60}
          onChange={(e) => setRespondentName(e.target.value)}
        />
      </div>

      <QuizForm
        quiz={quiz}
        subjectName={name}
        submitLabel={`Send to ${name}`}
        busy={busy}
        error={error}
        onSubmit={submit}
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
