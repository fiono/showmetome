import { useState } from "react";
import type { Dimension, QuizDefinition, ScaleQuestion } from "../shared/types";

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

export function QuestionRow(props: {
  question: ScaleQuestion;
  counts: number[];
  maxCount: number;
}) {
  const { question: q, counts } = props;
  return (
    <div className="qrow">
      <div className="lhs">{q.left.text}</div>
      <div className="mini-hist" aria-label="answer distribution">
        {counts.map((count, i) => (
          <div className="col" key={i} title={`${count} answer${count === 1 ? "" : "s"}`}>
            {count > 0 && <span className="count">{count}</span>}
            <div
              className={`bar${count === 0 ? " zero" : ""}`}
              style={{ height: `${props.maxCount ? (count / props.maxCount) * 100 : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="rhs">{q.right.text}</div>
    </div>
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

export function findQuestion(quiz: QuizDefinition, id: string): ScaleQuestion {
  return quiz.questions.find((q) => q.id === id)!;
}
