import { useMemo, useRef, useState } from "react";
import { AlignmentChart } from "./AlignmentChart";
import { FriendChip } from "./components";
import { encodePlacement } from "../shared/scoring";
import { PLACEMENT_KEY } from "../shared/types";
import type { Answers, GroupAnswers, GroupSubject, QuizDefinition } from "../shared/types";

interface Point {
  x: number;
  y: number;
}

/**
 * Individual-mode alignment board: tap the chart to place {name}, drag to
 * fine-tune. One placement, then submit.
 */
export function AlignmentBoard(props: {
  quiz: QuizDefinition;
  subjectName: string;
  submitLabel: string;
  busy: boolean;
  error?: string | null;
  onSubmit: (answers: Answers) => void;
}) {
  const [pos, setPos] = useState<Point | null>(null);

  return (
    <>
      <div className="card">
        <p className="small" style={{ marginTop: 0 }}>
          Tap the chart where you think <b>{props.subjectName}</b> sits — drag to fine-tune.
        </p>
        <AlignmentChart
          axes={props.quiz.alignment!}
          points={pos ? [{ ...pos, name: props.subjectName }] : []}
          onPlace={(x, y) => setPos({ x, y })}
        />
      </div>

      {props.error && <p className="error">{props.error}</p>}

      <div className="progressbar">
        <span className="small" style={{ whiteSpace: "nowrap" }}>
          {pos ? "1 / 1" : "0 / 1"} placed
        </span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: pos ? "100%" : "0%" }} />
        </div>
        <button
          className="btn btn-primary"
          disabled={!pos || props.busy}
          onClick={() => pos && props.onSubmit({ [PLACEMENT_KEY]: encodePlacement(pos.x, pos.y) })}
        >
          {props.busy ? "Sending…" : pos ? props.submitLabel : `Place ${props.subjectName} first`}
        </button>
      </div>
    </>
  );
}

/**
 * Group-mode alignment board: a tray of friend chips above one chart. Tap a
 * chip to pick it up, tap the chart to drop it there — the next unplaced
 * chip arms itself, so a 10-person roster is 10 taps. Tap a placed dot to
 * pick that friend back up and move them (or just drag them around).
 */
export function AlignmentGroupBoard(props: {
  quiz: QuizDefinition;
  subjects: GroupSubject[];
  submitLabel: string;
  busy: boolean;
  error?: string | null;
  onSubmit: (answersBySubject: GroupAnswers) => void;
}) {
  const { subjects } = props;
  const [placements, setPlacements] = useState<Record<string, Point>>({});
  const [armed, setArmed] = useState<string | null>(subjects[0]?.id ?? null);
  /** Who the current press-drag gesture is moving (so auto-arm can't switch mid-drag). */
  const gestureId = useRef<string | null>(null);

  const colorOf = useMemo(() => {
    const m: Record<string, number> = {};
    subjects.forEach((s, i) => (m[s.id] = i));
    return m;
  }, [subjects]);

  const unplaced = subjects.filter((s) => placements[s.id] === undefined);
  const placed = subjects.filter((s) => placements[s.id] !== undefined);
  const complete = subjects.length > 0 && unplaced.length === 0;

  function place(x: number, y: number, subjectId?: string) {
    const id = subjectId ?? armed;
    if (!id) return;
    setPlacements((p) => {
      const next = { ...p, [id]: { x, y } };
      // Auto-arm the next friend still off the chart (unless we're moving one).
      if (id === armed) {
        const nextUp = subjects.find((s) => next[s.id] === undefined);
        setArmed(nextUp?.id ?? null);
      }
      return next;
    });
  }

  function submit() {
    if (!complete) return;
    const answersBySubject: GroupAnswers = {};
    for (const s of subjects) {
      const p = placements[s.id];
      answersBySubject[s.id] = { [PLACEMENT_KEY]: encodePlacement(p.x, p.y) };
    }
    props.onSubmit(answersBySubject);
  }

  const points = placed.map((s) => ({
    ...placements[s.id],
    name: s.name,
    colorIndex: colorOf[s.id],
  }));
  const armedPointIndex = armed ? placed.findIndex((s) => s.id === armed) : -1;

  return (
    <>
      <div className="card">
        <div className="tray" aria-label="friends still to place">
          {unplaced.length === 0 ? (
            <span className="small muted">Everyone placed ✓ — tap a dot to move someone</span>
          ) : (
            unplaced.map((s) => (
              <FriendChip
                key={s.id}
                name={s.name}
                colorIndex={colorOf[s.id]}
                armed={armed === s.id}
                onClick={() => setArmed((cur) => (cur === s.id ? null : s.id))}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}
                title="tap to pick up, then tap the chart"
              />
            ))
          )}
        </div>
        {armed && (
          <p className="small muted" style={{ margin: "0 0 8px" }}>
            Placing <b>{subjects.find((s) => s.id === armed)?.name}</b> — tap the chart.
          </p>
        )}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (!subjects.some((s) => s.id === id)) return;
            const svg = e.currentTarget.querySelector("svg");
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            const clamp = (v: number) => Math.max(-1, Math.min(1, Math.round(v * 100) / 100));
            place(
              clamp(((e.clientX - rect.left) / rect.width) * 2 - 1),
              clamp(-(((e.clientY - rect.top) / rect.height) * 2 - 1)),
              id,
            );
          }}
        >
          <AlignmentChart
            axes={props.quiz.alignment!}
            points={points}
            armedIndex={armedPointIndex >= 0 ? armedPointIndex : undefined}
            onPlace={(x, y) => {
              gestureId.current = armed;
              place(x, y);
            }}
            onDrag={(x, y) => {
              if (gestureId.current) place(x, y, gestureId.current);
            }}
            onPointClick={(i) => {
              setArmed(placed[i].id);
              gestureId.current = placed[i].id; // press-drag a dot moves it directly
            }}
          />
        </div>
      </div>

      {props.error && <p className="error">{props.error}</p>}

      <div className="progressbar">
        <span className="small" style={{ whiteSpace: "nowrap" }}>
          {placed.length} / {subjects.length} placed
        </span>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${subjects.length ? (placed.length / subjects.length) * 100 : 0}%` }}
          />
        </div>
        <button className="btn btn-primary" disabled={!complete || props.busy} onClick={submit}>
          {props.busy ? "Sending…" : complete ? props.submitLabel : "Place everyone to finish"}
        </button>
      </div>
    </>
  );
}
