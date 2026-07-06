import { useState } from "react";
import type {
  ChoiceQuestion,
  Dimension,
  Outcome,
  OutcomeTotal,
  Question,
  QuestionAggregate,
  QuizDefinition,
  ScaleQuestion,
} from "../shared/types";

/** Substitute the {name} placeholder quiz authors can use in question text. */
export function subst(text: string, name: string): string {
  return text.replaceAll("{name}", name);
}

/** Map an axis score (+1 = poles[0], left) to a % position across the track. */
function scoreToPercent(score: number): number {
  return 2 + (1 - (score + 1) / 2) * 96;
}

const DOT_Y = [50, 27, 73, 38, 62]; // deterministic jitter levels, %

export function AxisChart(props: {
  dimensions: Dimension[];
  /** dimension id -> list of axis scores (one per respondent) */
  scores: Record<string, number[]>;
  /** dimension id -> consensus score (marker), if any */
  consensus?: Record<string, number>;
  /** respondent names aligned with the scores arrays, for tooltips */
  names?: (string | null)[];
}) {
  return (
    <div className="axis-chart">
      {props.dimensions.map((dim) => {
        const [a, b] = dim.poles;
        return (
          <AxisRowParts
            key={dim.id}
            dim={dim}
            left={{ pole: a, label: dim.labels[a] }}
            right={{ pole: b, label: dim.labels[b] }}
            scores={props.scores[dim.id] ?? []}
            consensus={props.consensus?.[dim.id]}
            names={props.names}
          />
        );
      })}
    </div>
  );
}

function AxisRowParts(props: {
  dim: Dimension;
  left: { pole: string; label: string };
  right: { pole: string; label: string };
  scores: number[];
  consensus?: number;
  names?: (string | null)[];
}) {
  return (
    <>
      <div className="axis-pole left" title={props.dim.description}>
        <b>{props.left.pole}</b> {props.left.label}
      </div>
      <div className="axis-track">
        {[20, 40, 60, 80].map((pct) => (
          <div key={pct} className="axis-gridline" style={{ left: `${pct}%` }} />
        ))}
        {props.scores.map((s, i) => (
          <div
            key={i}
            className="axis-dot"
            style={{
              left: `${scoreToPercent(s)}%`,
              top: `${DOT_Y[i % DOT_Y.length]}%`,
            }}
            title={`${props.names?.[i] ?? "anonymous"}: ${s > 0 ? props.left.pole : props.right.pole} ${Math.abs(Math.round(s * 100))}%`}
          />
        ))}
        {props.consensus !== undefined && (
          <div
            className="axis-consensus"
            style={{ left: `${scoreToPercent(props.consensus)}%` }}
            title={`consensus: ${props.consensus > 0 ? props.left.pole : props.right.pole} ${Math.abs(Math.round(props.consensus * 100))}%`}
          />
        )}
      </div>
      <div className="axis-pole right" title={props.dim.description}>
        <b>{props.right.pole}</b> {props.right.label}
      </div>
    </>
  );
}

/** Horizontal share bars for outcome scores (consensus or a single result). */
export function OutcomeBars(props: {
  outcomes: Outcome[];
  totals: OutcomeTotal[];
  winnerId?: string;
}) {
  const max = Math.max(...props.totals.map((t) => t.total), 1);
  const label = (id: string) => props.outcomes.find((o) => o.id === id)?.label ?? id;
  return (
    <div>
      {props.totals.map((t) => (
        <div className="tally-row" key={t.id}>
          <span className={`tally-type${t.id === props.winnerId ? "" : " muted"}`}>
            {label(t.id)}
          </span>
          <div className="tally-track">
            <div className="tally-fill" style={{ width: `${(t.total / max) * 100}%` }} />
          </div>
          <span className="tally-count">{Math.round(t.share * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function ScaleBreakdown(props: { question: ScaleQuestion; counts: number[]; subjectName: string }) {
  const max = Math.max(...props.counts, 1);
  return (
    <div className={`qrow${props.question.prompt ? " qrow-headed" : ""}`}>
      {props.question.prompt && (
        <div className="qrow-header">{subst(props.question.prompt, props.subjectName)}</div>
      )}
      <div className="lhs">{subst(props.question.left.text, props.subjectName)}</div>
      <div className="mini-hist" aria-label="answer distribution">
        {props.counts.map((count, i) => (
          <div className="col" key={i} title={`${count} answer${count === 1 ? "" : "s"}`}>
            {count > 0 && <span className="count">{count}</span>}
            <div
              className={`bar${count === 0 ? " zero" : ""}`}
              style={{ height: `${(count / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="rhs">{subst(props.question.right.text, props.subjectName)}</div>
    </div>
  );
}

function ChoiceBreakdown(props: {
  question: ChoiceQuestion;
  counts: Record<string, number>;
  subjectName: string;
}) {
  const max = Math.max(...Object.values(props.counts), 1);
  return (
    <div className="qrow qrow-choice">
      <div className="choice-prompt">{subst(props.question.text, props.subjectName)}</div>
      <div className="choice-breakdown">
        {props.question.options.map((o) => {
          const count = props.counts[o.id] ?? 0;
          return (
            <div className="opt-row" key={o.id} title={`${count} answer${count === 1 ? "" : "s"}`}>
              <span className="opt-text">{subst(o.text, props.subjectName)}</span>
              <div className="opt-track">
                <div
                  className={`opt-fill${count === 0 ? " zero" : ""}`}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
              <span className="tally-count">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Per-question answer distribution, for either question type. */
export function QuestionBreakdown(props: {
  question: Question;
  qa: QuestionAggregate;
  subjectName: string;
}) {
  if (props.question.type === "scale") {
    return (
      <ScaleBreakdown
        question={props.question}
        counts={props.qa.scale?.counts ?? []}
        subjectName={props.subjectName}
      />
    );
  }
  return (
    <ChoiceBreakdown
      question={props.question}
      counts={props.qa.choice?.counts ?? {}}
      subjectName={props.subjectName}
    />
  );
}

export function CopyButton(props: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-small"
      onClick={() => {
        navigator.clipboard.writeText(props.text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "copied!" : (props.label ?? "copy")}
    </button>
  );
}

export function findQuestion(quiz: QuizDefinition, id: string): Question {
  return quiz.questions.find((q) => q.id === id)!;
}
