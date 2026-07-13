import { useMemo, useState } from "react";
import { FriendChip, subst } from "./components";
import type { Answers, GroupAnswers, GroupSubject, QuizDefinition, Question } from "../shared/types";

/** In group mode, question text speaks about the whole group, not one person. */
const GROUP_NAME = "each person";

interface Bin {
  value: number | string;
  label: string;
}

function binsFor(q: Question): Bin[] {
  if (q.type === "choice") {
    return q.options.map((o) => ({ value: o.id, label: subst(o.text, GROUP_NAME) }));
  }
  const mid = (q.steps + 1) / 2;
  return Array.from({ length: q.steps }, (_, i) => {
    const v = i + 1;
    let label: string;
    if (v === 1) label = subst(q.left.text, GROUP_NAME);
    else if (v === q.steps) label = subst(q.right.text, GROUP_NAME);
    else if (v === mid) label = "equally both";
    else label = v < mid ? `leans "${subst(q.left.text, GROUP_NAME)}"` : `leans "${subst(q.right.text, GROUP_NAME)}"`;
    return { value: v, label };
  });
}

// question id -> (subject id -> chosen bin value)
type Assignments = Record<string, Record<string, number | string>>;

type Armed =
  | { qid: string; kind: "chip"; subjectId: string }
  | { qid: string; kind: "bin"; value: number | string }
  | null;

/**
 * The group-sorting board: read each question once, place every friend into an
 * answer. Tap a friend then tap their answer (or tap an answer then the friends
 * who fit); drag works too. "Everyone else here" dumps the remaining chips.
 * Nothing is submitted until every friend is placed on every question.
 */
export function GroupBoard(props: {
  quiz: QuizDefinition;
  subjects: GroupSubject[];
  submitLabel: string;
  busy: boolean;
  error?: string | null;
  onSubmit: (answersBySubject: GroupAnswers) => void;
}) {
  const { quiz, subjects } = props;
  const [assign, setAssign] = useState<Assignments>({});
  const [armed, setArmed] = useState<Armed>(null);

  const colorOf = useMemo(() => {
    const m: Record<string, number> = {};
    subjects.forEach((s, i) => (m[s.id] = i));
    return m;
  }, [subjects]);

  const placedCount = useMemo(
    () => quiz.questions.reduce((n, q) => n + Object.keys(assign[q.id] ?? {}).length, 0),
    [assign, quiz],
  );
  const total = quiz.questions.length * subjects.length;
  const complete = total > 0 && placedCount === total;

  function place(qid: string, subjectId: string, value: number | string) {
    setAssign((a) => ({ ...a, [qid]: { ...(a[qid] ?? {}), [subjectId]: value } }));
  }

  function onChipClick(qid: string, subjectId: string) {
    if (armed && armed.qid === qid && armed.kind === "bin") {
      place(qid, subjectId, armed.value); // bin was armed → drop this friend in it, keep bin armed
      return;
    }
    setArmed((cur) =>
      cur && cur.kind === "chip" && cur.qid === qid && cur.subjectId === subjectId
        ? null
        : { qid, kind: "chip", subjectId },
    );
  }

  function onBinClick(qid: string, value: number | string) {
    if (armed && armed.qid === qid && armed.kind === "chip") {
      place(qid, armed.subjectId, value); // chip was armed → drop it here
      setArmed(null);
      return;
    }
    setArmed((cur) =>
      cur && cur.kind === "bin" && cur.qid === qid && cur.value === value
        ? null
        : { qid, kind: "bin", value },
    );
  }

  function everyoneElse(qid: string, value: number | string) {
    setAssign((a) => {
      const cur = { ...(a[qid] ?? {}) };
      for (const s of subjects) if (cur[s.id] === undefined) cur[s.id] = value;
      return { ...a, [qid]: cur };
    });
    setArmed(null);
  }

  function submit() {
    if (!complete) return;
    const answersBySubject: GroupAnswers = {};
    for (const s of subjects) {
      const answers: Answers = {};
      for (const q of quiz.questions) answers[q.id] = assign[q.id][s.id];
      answersBySubject[s.id] = answers;
    }
    props.onSubmit(answersBySubject);
  }

  return (
    <>
      {quiz.questions.map((q, qi) => {
        const placed = assign[q.id] ?? {};
        const unplaced = subjects.filter((s) => placed[s.id] === undefined);
        const bins = binsFor(q);
        const prompt = q.type === "choice" ? subst(q.text, GROUP_NAME) : subst(q.prompt ?? "", GROUP_NAME);
        return (
          <div className="card qboard" key={q.id}>
            <div className="qboard-head">
              <span className="small muted">
                Question {qi + 1} of {quiz.questions.length} · {subjects.length - unplaced.length}/
                {subjects.length} placed
              </span>
            </div>
            {prompt && <h3 className="qboard-prompt">{prompt}</h3>}

            <div className="tray" aria-label="friends still to place">
              {unplaced.length === 0 ? (
                <span className="small muted">Everyone placed ✓</span>
              ) : (
                unplaced.map((s) => (
                  <FriendChip
                    key={s.id}
                    name={s.name}
                    colorIndex={colorOf[s.id]}
                    armed={armed?.kind === "chip" && armed.qid === q.id && armed.subjectId === s.id}
                    onClick={() => onChipClick(q.id, s.id)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", `${q.id} ${s.id}`)}
                    title="tap to pick up, then tap an answer"
                  />
                ))
              )}
            </div>

            <div className="bins">
              {bins.map((bin) => {
                const here = subjects.filter((s) => placed[s.id] === bin.value);
                const isArmedBin = armed?.kind === "bin" && armed.qid === q.id && armed.value === bin.value;
                return (
                  <div
                    key={String(bin.value)}
                    className={`bin${isArmedBin ? " armed" : ""}`}
                    onClick={() => onBinClick(q.id, bin.value)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const [qid, sid] = e.dataTransfer.getData("text/plain").split(" ");
                      if (qid === q.id && sid) place(q.id, sid, bin.value);
                    }}
                  >
                    <div className="bin-label">{bin.label}</div>
                    <div className="bin-chips">
                      {here.map((s) => (
                        <FriendChip
                          key={s.id}
                          name={s.name}
                          colorIndex={colorOf[s.id]}
                          armed={
                            armed?.kind === "chip" && armed.qid === q.id && armed.subjectId === s.id
                          }
                          onClick={() => onChipClick(q.id, s.id)}
                          title="tap to move to a different answer"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", `${q.id} ${s.id}`)}
                        />
                      ))}
                    </div>
                    {unplaced.length > 0 && (
                      <button
                        type="button"
                        className="bin-rest"
                        onClick={(e) => {
                          e.stopPropagation();
                          everyoneElse(q.id, bin.value);
                        }}
                      >
                        + everyone else
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {props.error && <p className="error">{props.error}</p>}

      <div className="progressbar">
        <span className="small" style={{ whiteSpace: "nowrap" }}>
          {placedCount} / {total} placed
        </span>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${total ? (placedCount / total) * 100 : 0}%` }}
          />
        </div>
        <button className="btn btn-primary" disabled={!complete || props.busy} onClick={submit}>
          {props.busy ? "Sending…" : complete ? props.submitLabel : "Place everyone to finish"}
        </button>
      </div>
    </>
  );
}
