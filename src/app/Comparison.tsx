import { AlignmentChart } from "./AlignmentChart";
import { AxisChart, QuestionBreakdown, findQuestion } from "./components";
import { answerDivergence } from "../shared/scoring";
import type {
  Answers,
  Outcome,
  OutcomeTotal,
  QuizDefinition,
  RoundAggregate,
  SubmissionResult,
} from "../shared/types";

/** Grouped you-vs-group share bars for outcome quizzes. */
function OutcomeCompare(props: {
  outcomes: Outcome[];
  yourScores: Record<string, number>;
  group: OutcomeTotal[];
}) {
  const yourTotal = Object.values(props.yourScores).reduce((a, b) => a + b, 0);
  const yourShare = (id: string) =>
    yourTotal > 0 ? (props.yourScores[id] ?? 0) / yourTotal : 0;
  const label = (id: string) => props.outcomes.find((o) => o.id === id)?.label ?? id;
  return (
    <div>
      {props.group.map((g) => (
        <div className="cmp-row" key={g.id}>
          <span className="cmp-label">{label(g.id)}</span>
          <div className="cmp-track" title="your points share">
            <div className="cmp-bar you" style={{ width: `${yourShare(g.id) * 100}%` }} />
            <span className="cmp-pct">{Math.round(yourShare(g.id) * 100)}%</span>
          </div>
          <div className="cmp-track" title="the group's points share">
            <div className="cmp-bar group" style={{ width: `${g.share * 100}%` }} />
            <span className="cmp-pct">{Math.round(g.share * 100)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * One person's answers vs. a group's: used by the friend post-submit view
 * (you vs. the other respondents) and the owner's perception gap (self vs.
 * the friends' consensus). `aggregate` must be over the group WITHOUT the
 * viewer's own submission.
 */
export function ComparisonView(props: {
  quiz: QuizDefinition;
  subjectName: string;
  /** e.g. "3 other friends" or "your friends" */
  groupLabel: string;
  aggregate: RoundAggregate;
  yourAnswers: Answers;
  yourResult: SubmissionResult;
}) {
  const { quiz, aggregate, yourResult } = props;
  const verdict = (r: SubmissionResult) => verdictLabel(quiz, r);

  const ranked = aggregate.questions
    .filter((qa) => qa.total > 0)
    .map((qa) => ({
      qa,
      divergence: answerDivergence(
        findQuestion(quiz, qa.questionId),
        props.yourAnswers[qa.questionId],
        qa,
      ),
    }))
    .sort((a, b) => b.divergence - a.divergence);
  const differ = ranked.filter((r) => r.divergence > 0.2).slice(0, 3);

  return (
    <>
      <p className="small">
        {props.groupLabel} landed on{" "}
        <b className={aggregate.kind === "dimensions" ? "mono" : ""}>
          {aggregate.consensus ? verdict(aggregate.consensus) : "—"}
        </b>
        ; you said{" "}
        <b className={yourResult.kind === "dimensions" ? "mono" : ""}>{verdict(yourResult)}</b>.
      </p>

      {aggregate.kind === "alignment" ? (
        <>
          <div className="legend">
            <span>
              <span className="swatch-you" /> you
            </span>
            <span>
              <span className="swatch" /> one of {props.groupLabel}
            </span>
            <span>
              <span className="swatch-consensus" /> their consensus
            </span>
          </div>
          <AlignmentChart
            axes={quiz.alignment!}
            points={(aggregate.axisScores.x ?? []).map((x, i) => ({
              x,
              y: aggregate.axisScores.y[i],
            }))}
            consensus={
              aggregate.consensus?.kind === "alignment"
                ? { x: aggregate.consensus.x, y: aggregate.consensus.y }
                : undefined
            }
            you={yourResult.kind === "alignment" ? { x: yourResult.x, y: yourResult.y } : undefined}
          />
          {aggregate.consensus?.kind === "alignment" && yourResult.kind === "alignment" && (
            <p className="small muted">
              You and their consensus are{" "}
              {Math.round(
                (Math.hypot(
                  yourResult.x - aggregate.consensus.x,
                  yourResult.y - aggregate.consensus.y,
                ) /
                  (2 * Math.SQRT2)) *
                  100,
              )}
              % of the chart apart.
            </p>
          )}
        </>
      ) : aggregate.kind === "dimensions" ? (
        <>
          <div className="legend">
            <span>
              <span className="swatch-you" /> you
            </span>
            <span>
              <span className="swatch" /> one of {props.groupLabel}
            </span>
            <span>
              <span className="swatch-consensus" /> their consensus
            </span>
          </div>
          <AxisChart
            dimensions={quiz.dimensions!}
            scores={aggregate.axisScores}
            consensus={
              aggregate.consensus?.kind === "dimensions"
                ? Object.fromEntries(aggregate.consensus.axes.map((a) => [a.dimension, a.score]))
                : undefined
            }
            you={
              yourResult.kind === "dimensions"
                ? Object.fromEntries(yourResult.axes.map((a) => [a.dimension, a.score]))
                : undefined
            }
          />
        </>
      ) : (
        <>
          <div className="legend">
            <span>
              <span className="swatch" style={{ background: "var(--series-2)", borderRadius: 2 }} />{" "}
              you
            </span>
            <span>
              <span className="swatch" style={{ borderRadius: 2 }} /> {props.groupLabel}
            </span>
          </div>
          <OutcomeCompare
            outcomes={quiz.outcomes!}
            yourScores={yourResult.kind === "outcomes" ? yourResult.scores : {}}
            group={aggregate.outcomeTotals}
          />
        </>
      )}

      {quiz.questions.length > 0 && (
      <section className="block">
        <h3>Where you split from {props.groupLabel}</h3>
        {differ.length === 0 ? (
          <p className="small muted">
            Nowhere, really — you answered right down the middle of the pack.
          </p>
        ) : (
          differ.map(({ qa }) => (
            <QuestionBreakdown
              key={qa.questionId}
              question={findQuestion(quiz, qa.questionId)}
              qa={qa}
              subjectName={props.subjectName}
              highlight={props.yourAnswers[qa.questionId]}
            />
          ))
        )}
      </section>
      )}

      {quiz.questions.length > 0 && (
      <details style={{ marginTop: 14 }}>
        <summary className="small" style={{ cursor: "pointer" }}>
          Every question, with your answer marked
        </summary>
        <div style={{ marginTop: 10 }}>
          {aggregate.questions.map((qa) => (
            <QuestionBreakdown
              key={qa.questionId}
              question={findQuestion(quiz, qa.questionId)}
              qa={qa}
              subjectName={props.subjectName}
              highlight={props.yourAnswers[qa.questionId]}
            />
          ))}
        </div>
      </details>
      )}
    </>
  );
}

export function verdictLabel(quiz: QuizDefinition, r: SubmissionResult): string {
  if (r.kind === "dimensions") return r.casedType;
  if (r.kind === "alignment") return r.quadrant;
  return quiz.outcomes!.find((o) => o.id === r.winnerId)?.label ?? r.winnerId;
}
