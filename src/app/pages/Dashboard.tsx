import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { AxisChart, CopyButton, QuestionRow, findQuestion } from "../components";
import type { OwnerView } from "../../shared/types";

export function Dashboard() {
  const { ownerToken } = useParams<{ ownerToken: string }>();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const [view, setView] = useState<OwnerView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!ownerToken) return;
    api.ownerView(ownerToken).then(setView, (e) => setError(e.message ?? String(e)));
  }, [ownerToken]);

  useEffect(load, [load]);

  const names = useMemo(
    () => view?.submissions.map((s) => s.respondentName) ?? [],
    [view],
  );

  if (error && !view) return <div className="card error">{error}</div>;
  if (!view || !ownerToken) return <div className="card small">Loading…</div>;

  const { round, quiz, aggregate, submissions } = view;
  const shareUrl = `${location.origin}/s/${round.shareToken}`;
  const n = aggregate.submissionCount;
  const maxTally = aggregate.typeTally[0]?.count ?? 1;

  const answeredQuestions = aggregate.questions.filter((q) => q.total > 0);
  const bySd = [...answeredQuestions].sort((a, b) => a.sd - b.sd);
  const mostAgreed = bySd.slice(0, 3);
  const mostDivided = bySd.slice(-3).reverse();

  async function setStatus(status: "open" | "closed") {
    await api.setStatus(ownerToken!, status);
    load();
  }

  async function remove(id: string, who: string | null) {
    if (!confirm(`Delete the answers from ${who ?? "anonymous"}?`)) return;
    await api.deleteSubmission(ownerToken!, id);
    load();
  }

  return (
    <>
      {isNew && (
        <div className="callout">
          <b>Round created — save this page&rsquo;s address.</b> It&rsquo;s the only way back
          to these results (there are no accounts). Then send the share link below to your
          friends.
        </div>
      )}

      <div className="card">
        <h2>
          {round.subjectName}, according to {n === 0 ? "your friends" : `${n} friend${n === 1 ? "" : "s"}`}
        </h2>
        <p className="small muted">
          {quiz.title} &middot; {quiz.attribution} &middot; round{" "}
          {round.status === "open" ? "open" : "closed"}
        </p>
        <label>Share link — send this to friends</label>
        <div className="linkbox">
          <code>{shareUrl}</code>
          <CopyButton text={shareUrl} />
        </div>
        <div className="row">
          <button className="btn btn-small" onClick={load}>
            refresh
          </button>
          {round.status === "open" ? (
            <button className="btn btn-small" onClick={() => setStatus("closed")}>
              stop collecting answers
            </button>
          ) : (
            <button className="btn btn-small" onClick={() => setStatus("open")}>
              reopen round
            </button>
          )}
        </div>
      </div>

      {n === 0 ? (
        <div className="card">
          <h2>No answers yet</h2>
          <p className="small">
            The picture appears here as soon as the first friend answers. Nudge them with the
            share link above.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <section>
              <h3 style={{ margin: 0 }} className="small muted">
                CONSENSUS
              </h3>
              <div className="hero-type mono">{aggregate.consensus!.casedType}</div>
              <p className="hero-sub">
                Averaged across {n} answer{n === 1 ? "" : "s"}. Capital letters are clear
                calls; lowercase means your friends put you nearer the middle.
              </p>
              <div className="legend">
                <span>
                  <span className="swatch" /> a friend&rsquo;s read
                </span>
                <span>
                  <span className="swatch-consensus" /> consensus
                </span>
              </div>
              <AxisChart
                dimensions={quiz.definition.dimensions}
                scores={aggregate.axisScores}
                consensus={Object.fromEntries(
                  aggregate.consensus!.axes.map((a) => [a.dimension, a.score]),
                )}
                names={names}
              />
            </section>

            <section className="block">
              <h3>Individual verdicts</h3>
              {aggregate.typeTally.map((t) => (
                <div className="tally-row" key={t.type}>
                  <span className="tally-type mono">{t.type}</span>
                  <div className="tally-track">
                    <div
                      className="tally-fill"
                      style={{ width: `${(t.count / maxTally) * 100}%` }}
                    />
                  </div>
                  <span className="tally-count">{t.count}</span>
                </div>
              ))}
            </section>
          </div>

          {n >= 2 && (
            <div className="card">
              <section>
                <h3 className="small muted" style={{ margin: 0 }}>
                  WHERE FRIENDS AGREE ABOUT {round.subjectName.toUpperCase()}
                </h3>
                {mostAgreed.map((qa) => (
                  <QuestionRow
                    key={qa.questionId}
                    question={findQuestion(quiz.definition, qa.questionId)}
                    counts={qa.counts}
                    maxCount={Math.max(...qa.counts)}
                  />
                ))}
              </section>
              <section className="block">
                <h3>Where they argue</h3>
                {mostDivided.map((qa) => (
                  <QuestionRow
                    key={qa.questionId}
                    question={findQuestion(quiz.definition, qa.questionId)}
                    counts={qa.counts}
                    maxCount={Math.max(...qa.counts)}
                  />
                ))}
              </section>
            </div>
          )}

          <div className="card">
            <details>
              <summary className="small" style={{ cursor: "pointer" }}>
                Every question, every answer ({answeredQuestions.length} questions)
              </summary>
              <div style={{ marginTop: 10 }}>
                {aggregate.questions.map((qa) => (
                  <QuestionRow
                    key={qa.questionId}
                    question={findQuestion(quiz.definition, qa.questionId)}
                    counts={qa.counts}
                    maxCount={Math.max(...qa.counts, 1)}
                  />
                ))}
              </div>
            </details>
          </div>

          <div className="card">
            <section>
              <h3 className="small muted" style={{ margin: 0 }}>
                WHO ANSWERED
              </h3>
              {submissions.map((s) => (
                <div className="respondent" key={s.id}>
                  <span className="who">
                    {s.respondentName ?? <span className="muted">anonymous</span>}
                  </span>
                  <span className="verdict mono">{s.result.casedType}</span>
                  <span className="small muted">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => remove(s.id, s.respondentName)}
                  >
                    delete
                  </button>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}
