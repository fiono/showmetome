import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import {
  AxisChart,
  CopyButton,
  FriendChip,
  OutcomeBars,
  QuestionBreakdown,
  findQuestion,
  subst,
} from "../components";
import { AlignmentChart } from "../AlignmentChart";
import { ComparisonView, verdictLabel } from "../Comparison";
import { GroupResults, type GroupEntry } from "../GroupResults";
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

  async function setStatus(status: "open" | "closed") {
    await api.setStatus(ownerToken!, status);
    load();
  }

  if (error && !view) return <div className="card error">{error}</div>;
  if (!view || !ownerToken) return <div className="card small">Loading…</div>;

  if (view.group) {
    return (
      <GroupDashboard
        view={view}
        ownerToken={ownerToken}
        isNew={isNew}
        onReload={load}
        onSetStatus={setStatus}
      />
    );
  }

  const { round, quiz, aggregate, submissions } = view;
  const subjectName = round.subjectName;
  const shareUrl = `${location.origin}/s/${round.shareToken}`;
  const n = aggregate.submissionCount;

  const withAnswers = aggregate.questions.filter((q) => q.total > 0);
  const byDisagreement = [...withAnswers].sort((a, b) => a.disagreement - b.disagreement);
  // Show at most 3 of each, never overlapping — with few questions the
  // "every question" list below already tells the whole story.
  const highlightCount = Math.min(3, Math.floor(byDisagreement.length / 2));
  const mostAgreed = byDisagreement.slice(0, highlightCount);
  const mostDivided = byDisagreement.slice(-highlightCount).reverse();

  const verdictOf = (s: (typeof submissions)[number]) => verdictLabel(quiz.definition, s.result);

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
          {subjectName}, according to {n === 0 ? "your friends" : `${n} friend${n === 1 ? "" : "s"}`}
        </h2>
        <p className="small muted">
          {subst(quiz.title, subjectName)}
          {quiz.attribution ? <> &middot; {quiz.attribution}</> : null} &middot; round{" "}
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
          <Link className="btn btn-small" to={`/r/${ownerToken}/self`}>
            {view.selfSubmission ? "retake it yourself" : "take it yourself"}
          </Link>
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
              {aggregate.kind === "dimensions" ? (
                <>
                  <div className="hero-type mono">
                    {aggregate.consensus!.kind === "dimensions" && aggregate.consensus!.casedType}
                  </div>
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
                    dimensions={quiz.definition.dimensions!}
                    scores={aggregate.axisScores}
                    consensus={
                      aggregate.consensus!.kind === "dimensions"
                        ? Object.fromEntries(
                            aggregate.consensus!.axes.map((a) => [a.dimension, a.score]),
                          )
                        : undefined
                    }
                    names={names}
                  />
                </>
              ) : aggregate.kind === "alignment" ? (
                <>
                  <div className="hero-type hero-outcome">
                    {aggregate.consensus!.kind === "alignment" && aggregate.consensus!.quadrant}
                  </div>
                  <p className="hero-sub">
                    Averaged across {n} placement{n === 1 ? "" : "s"} — the marker is where
                    your friends put you, on balance.
                  </p>
                  <div className="legend">
                    <span>
                      <span className="swatch" /> a friend&rsquo;s placement
                    </span>
                    <span>
                      <span className="swatch-consensus" /> consensus
                    </span>
                  </div>
                  <AlignmentChart
                    axes={quiz.definition.alignment!}
                    points={(aggregate.axisScores.x ?? []).map((x, i) => ({
                      x,
                      y: aggregate.axisScores.y[i],
                      name: names[i] ?? "anonymous",
                      colorIndex: i,
                    }))}
                    consensus={
                      aggregate.consensus!.kind === "alignment"
                        ? { x: aggregate.consensus!.x, y: aggregate.consensus!.y }
                        : undefined
                    }
                  />
                </>
              ) : (
                (() => {
                  const winnerId =
                    aggregate.consensus!.kind === "outcomes"
                      ? aggregate.consensus!.winnerId
                      : undefined;
                  const winner = quiz.definition.outcomes!.find((o) => o.id === winnerId);
                  return (
                    <>
                      <div className="hero-type hero-outcome">{winner?.label ?? ""}</div>
                      {winner?.description && (
                        <p className="hero-tagline">{subst(winner.description, subjectName)}</p>
                      )}
                      <p className="hero-sub">
                        Points summed across {n} answer{n === 1 ? "" : "s"} — every answer votes,
                        the biggest pile wins.
                      </p>
                      <OutcomeBars
                        outcomes={quiz.definition.outcomes!}
                        totals={aggregate.outcomeTotals}
                        winnerId={winnerId}
                      />
                    </>
                  );
                })()
              )}
            </section>

            <section className="block">
              <h3>Individual verdicts</h3>
              {aggregate.verdictTally.map((t) => (
                <div className="tally-row" key={t.label}>
                  <span className={`tally-type${aggregate.kind === "dimensions" ? " mono" : ""}`}>
                    {t.label}
                  </span>
                  <div className="tally-track">
                    <div
                      className="tally-fill"
                      style={{
                        width: `${(t.count / (aggregate.verdictTally[0]?.count ?? 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="tally-count">{t.count}</span>
                </div>
              ))}
            </section>
          </div>

          <div className="card" id="gap">
            {view.selfSubmission ? (
              <>
                <h3 className="small muted" style={{ margin: "0 0 4px" }}>
                  HOW YOU SEE YOURSELF VS. HOW THEY SEE YOU
                </h3>
                <ComparisonView
                  quiz={quiz.definition}
                  subjectName={subjectName}
                  groupLabel="your friends"
                  aggregate={aggregate}
                  yourAnswers={view.selfSubmission.answers}
                  yourResult={view.selfSubmission.result}
                />
              </>
            ) : (
              <>
                <h3 className="small muted" style={{ margin: "0 0 4px" }}>
                  THE OTHER HALF OF THE PICTURE
                </h3>
                <p className="small" style={{ margin: 0 }}>
                  <Link to={`/r/${ownerToken}/self`}>Take the quiz yourself</Link> to see where
                  your self-image and your friends&rsquo; read of you diverge — your answers
                  stay out of their consensus.
                </p>
              </>
            )}
          </div>

          {n >= 2 && highlightCount > 0 && (
            <div className="card">
              <section>
                <h3 className="small muted" style={{ margin: 0 }}>
                  WHERE FRIENDS AGREE ABOUT {subjectName.toUpperCase()}
                </h3>
                {mostAgreed.map((qa) => (
                  <QuestionBreakdown
                    key={qa.questionId}
                    question={findQuestion(quiz.definition, qa.questionId)}
                    qa={qa}
                    subjectName={subjectName}
                  />
                ))}
              </section>
              <section className="block">
                <h3>Where they argue</h3>
                {mostDivided.map((qa) => (
                  <QuestionBreakdown
                    key={qa.questionId}
                    question={findQuestion(quiz.definition, qa.questionId)}
                    qa={qa}
                    subjectName={subjectName}
                  />
                ))}
              </section>
            </div>
          )}

          {aggregate.questions.length > 0 && (
            <div className="card">
              <details>
                <summary className="small" style={{ cursor: "pointer" }}>
                  Every question, every answer ({aggregate.questions.length} questions)
                </summary>
                <div style={{ marginTop: 10 }}>
                  {aggregate.questions.map((qa) => (
                    <QuestionBreakdown
                      key={qa.questionId}
                      question={findQuestion(quiz.definition, qa.questionId)}
                      qa={qa}
                      subjectName={subjectName}
                    />
                  ))}
                </div>
              </details>
            </div>
          )}

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
                  <span className={`verdict${s.result.kind === "dimensions" ? " mono" : ""}`}>
                    {verdictOf(s)}
                  </span>
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

/** Owner dashboard for a group round: share/sort controls + the group picture. */
function GroupDashboard(props: {
  view: OwnerView;
  ownerToken: string;
  isNew: boolean;
  onReload: () => void;
  onSetStatus: (status: "open" | "closed") => void;
}) {
  const { view, isNew } = props;
  const { round, quiz } = view;
  const group = view.group!;
  const shareUrl = `${location.origin}/s/${round.shareToken}`;
  const sortUrl = `/s/${round.shareToken}`;
  const sittings = group.sittingCount;

  const colorOf = useMemo(() => {
    const m: Record<string, number> = {};
    group.subjects.forEach((sv, i) => (m[sv.subject.id] = i));
    return m;
  }, [group.subjects]);

  const entries: GroupEntry[] = group.subjects
    .filter((sv) => sv.aggregate.consensus)
    .map((sv) => ({ subject: sv.subject, result: sv.aggregate.consensus! }));

  return (
    <>
      {isNew && (
        <div className="callout">
          <b>Group round created — save this page&rsquo;s address.</b> It&rsquo;s the only way
          back to these results (there are no accounts). Sort the group yourself, or send the
          share link so someone else can.
        </div>
      )}

      <div className="card">
        <h2>{round.subjectName}</h2>
        <p className="small muted">
          {subst(quiz.title, round.subjectName)}
          {quiz.attribution ? <> &middot; {quiz.attribution}</> : null} &middot;{" "}
          {group.subjects.length} people &middot; round{" "}
          {round.status === "open" ? "open" : "closed"}
        </p>

        <div className="tally-chips" style={{ margin: "8px 0 14px" }}>
          {group.subjects.map((sv, i) => (
            <FriendChip key={sv.subject.id} name={sv.subject.name} colorIndex={i} />
          ))}
        </div>

        <label>Share link — send this so a friend can sort the group (or sort it yourself)</label>
        <div className="linkbox">
          <code>{shareUrl}</code>
          <CopyButton text={shareUrl} />
        </div>
        <div className="row">
          <Link className="btn btn-primary" to={sortUrl}>
            Sort the group →
          </Link>
          <button className="btn btn-small" onClick={props.onReload}>
            refresh
          </button>
          {round.status === "open" ? (
            <button className="btn btn-small" onClick={() => props.onSetStatus("closed")}>
              stop collecting answers
            </button>
          ) : (
            <button className="btn btn-small" onClick={() => props.onSetStatus("open")}>
              reopen round
            </button>
          )}
        </div>
      </div>

      {sittings === 0 ? (
        <div className="card">
          <h2>No sittings yet</h2>
          <p className="small">
            The group picture appears here as soon as someone sorts the roster. Use the{" "}
            <Link to={sortUrl}>Sort the group</Link> button above to do it yourself.
          </p>
        </div>
      ) : (
        <>
          <p className="small muted" style={{ margin: "0 0 12px" }}>
            {sittings} sitting{sittings === 1 ? "" : "s"} recorded
            {sittings > 1 ? " — each friend's result is their consensus across sittings." : "."}
          </p>
          <GroupResults
            quiz={quiz.definition}
            entries={entries}
            colorOf={colorOf}
            groupTitle={round.subjectName}
          />
        </>
      )}
    </>
  );
}
