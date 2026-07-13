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

/** Number of distinct friend-chip colors (see .friend-c0..7 in styles.css). */
export const FRIEND_COLORS = 8;

/**
 * A named friend "pill" for group mode. The name carries identity; the color
 * is a scanning aid (cycles past 8, which is fine). Renders as a button so it
 * works for tap-to-assign; optional drag props enable drag as an enhancement.
 */
export function FriendChip(props: {
  name: string;
  colorIndex: number;
  armed?: boolean;
  onClick?: () => void;
  title?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`friend-chip friend-c${props.colorIndex % FRIEND_COLORS}${props.armed ? " armed" : ""}`}
      aria-pressed={props.armed ? true : undefined}
      title={props.title}
      onClick={(e) => {
        e.stopPropagation(); // chips inside a bin must not also trigger the bin
        props.onClick?.();
      }}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
    >
      <span className="friend-dot" aria-hidden="true" />
      {props.name}
    </button>
  );
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
  /** dimension id -> the viewer's own score (diamond marker), if comparing */
  you?: Record<string, number>;
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
            you={props.you?.[dim.id]}
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
  you?: number;
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
        {props.you !== undefined && (
          <div
            className="axis-you"
            style={{ left: `${scoreToPercent(props.you)}%` }}
            title={`you: ${props.you > 0 ? props.left.pole : props.right.pole} ${Math.abs(Math.round(props.you * 100))}%`}
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

function ScaleBreakdown(props: {
  question: ScaleQuestion;
  counts: number[];
  subjectName: string;
  /** the viewer's own answer (1..steps) to mark against the group */
  highlight?: number;
}) {
  const max = Math.max(...props.counts, 1);
  return (
    <div className={`qrow${props.question.prompt ? " qrow-headed" : ""}`}>
      {props.question.prompt && (
        <div className="qrow-header">{subst(props.question.prompt, props.subjectName)}</div>
      )}
      <div className="lhs">{subst(props.question.left.text, props.subjectName)}</div>
      <div className="mini-hist" aria-label="answer distribution">
        {props.counts.map((count, i) => {
          const isYou = props.highlight === i + 1;
          return (
            <div
              className={`col${isYou ? " col-you" : ""}`}
              key={i}
              title={`${count} answer${count === 1 ? "" : "s"}${isYou ? " — your pick" : ""}`}
            >
              {count > 0 && <span className="count">{count}</span>}
              <div
                className={`bar${count === 0 ? " zero" : ""}`}
                style={{ height: `${(count / max) * 100}%` }}
              />
              {isYou && <span className="you-caret">▲</span>}
            </div>
          );
        })}
      </div>
      <div className="rhs">{subst(props.question.right.text, props.subjectName)}</div>
    </div>
  );
}

function ChoiceBreakdown(props: {
  question: ChoiceQuestion;
  counts: Record<string, number>;
  subjectName: string;
  /** the viewer's own option id, marked against the group */
  highlight?: string;
}) {
  const max = Math.max(...Object.values(props.counts), 1);
  return (
    <div className="qrow qrow-choice">
      <div className="choice-prompt">{subst(props.question.text, props.subjectName)}</div>
      <div className="choice-breakdown">
        {props.question.options.map((o) => {
          const count = props.counts[o.id] ?? 0;
          const isYou = props.highlight === o.id;
          return (
            <div
              className="opt-row"
              key={o.id}
              title={`${count} answer${count === 1 ? "" : "s"}${isYou ? " — your pick" : ""}`}
            >
              <span className="opt-text">
                {subst(o.text, props.subjectName)}
                {isYou && <span className="you-tag">you</span>}
              </span>
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
  /** the viewer's own answer, marked against the group */
  highlight?: number | string;
}) {
  if (props.question.type === "scale") {
    return (
      <ScaleBreakdown
        question={props.question}
        counts={props.qa.scale?.counts ?? []}
        subjectName={props.subjectName}
        highlight={typeof props.highlight === "number" ? props.highlight : undefined}
      />
    );
  }
  return (
    <ChoiceBreakdown
      question={props.question}
      counts={props.qa.choice?.counts ?? {}}
      subjectName={props.subjectName}
      highlight={typeof props.highlight === "string" ? props.highlight : undefined}
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
