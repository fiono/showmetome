import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { parseQuizDefinition } from "../../shared/validate";
import type { QuizDefinition } from "../../shared/types";

let nextKey = 1;
const key = () => `k${nextKey++}`;

type Mode = "dimensions" | "outcomes";

interface DimDraft {
  key: string;
  a: string;
  b: string;
  labelA: string;
  labelB: string;
}
interface OutcomeDraft {
  key: string; // doubles as the outcome id in the saved definition
  label: string;
  description: string;
}
interface ScoreDraft {
  key: string;
  target: string;
  weight: number;
}
interface OptionDraft {
  key: string;
  text: string;
  scores: ScoreDraft[];
}
type QuestionDraft =
  | { key: string; type: "scale"; prompt: string; leftText: string; rightText: string; leftTarget: string; steps: number }
  | { key: string; type: "scale-outcomes"; prompt: string; leftText: string; rightText: string; leftScores: ScoreDraft[]; rightScores: ScoreDraft[]; steps: number }
  | { key: string; type: "choice"; text: string; options: OptionDraft[] };

const freshScore = (): ScoreDraft => ({ key: key(), target: "", weight: 1 });

/** Editable list of (target, weight) rows — used by choice options and scale sides. */
function ScoreRows(props: {
  scores: ScoreDraft[];
  targets: { value: string; label: string }[];
  onChange: (scores: ScoreDraft[]) => void;
}) {
  const { scores, targets, onChange } = props;
  return (
    <>
      {scores.map((s, i) => (
        <div className="draft-row draft-row-score" key={s.key}>
          <select
            value={s.target}
            onChange={(e) =>
              onChange(scores.map((x) => (x.key === s.key ? { ...x, target: e.target.value } : x)))
            }
          >
            <option value="">scores toward…</option>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="weight"
            min={0}
            max={100}
            value={s.weight}
            title="points toward this target"
            onChange={(e) =>
              onChange(
                scores.map((x) => (x.key === s.key ? { ...x, weight: Number(e.target.value) } : x)),
              )
            }
          />
          <button
            className="btn btn-small btn-danger"
            disabled={scores.length <= 1}
            onClick={() => onChange(scores.filter((x) => x.key !== s.key))}
          >
            ✕
          </button>
          {i === scores.length - 1 && (
            <button className="btn btn-small" onClick={() => onChange([...scores, freshScore()])}>
              + another target
            </button>
          )}
        </div>
      ))}
    </>
  );
}

/** Turn an existing definition back into builder drafts (for cloning). */
function draftsFromDefinition(def: QuizDefinition): {
  mode: Mode;
  dims: DimDraft[];
  outcomes: OutcomeDraft[];
  questions: QuestionDraft[];
} {
  const mode: Mode = def.scoring === "dimensions" ? "dimensions" : "outcomes";
  const dims: DimDraft[] = (def.dimensions ?? []).map((d) => ({
    key: key(),
    a: d.poles[0],
    b: d.poles[1],
    labelA: d.labels[d.poles[0]] ?? "",
    labelB: d.labels[d.poles[1]] ?? "",
  }));
  const outcomes: OutcomeDraft[] = (def.outcomes ?? []).map((o) => ({
    key: o.id,
    label: o.label,
    description: o.description ?? "",
  }));
  const scoreRows = (scores: Record<string, number>): ScoreDraft[] =>
    Object.entries(scores).map(([target, weight]) => ({ key: key(), target, weight }));
  const questions: QuestionDraft[] = def.questions.map((q) => {
    if (q.type === "choice") {
      return {
        key: key(),
        type: "choice",
        text: q.text,
        options: q.options.map((o) => ({ key: key(), text: o.text, scores: scoreRows(o.scores) })),
      };
    }
    const base = {
      key: key(),
      prompt: q.prompt ?? "",
      leftText: q.left.text,
      rightText: q.right.text,
      steps: q.steps,
    };
    // The dimensions-mode editor keeps the simple one-pole-per-side UX, so
    // cloning keeps only the first target of each side there.
    return mode === "dimensions"
      ? { ...base, type: "scale", leftTarget: Object.keys(q.left.scores)[0] ?? "" }
      : {
          ...base,
          type: "scale-outcomes",
          leftScores: scoreRows(q.left.scores),
          rightScores: scoreRows(q.right.scores),
        };
  });
  return { mode, dims, outcomes, questions };
}

export function Builder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cloneFrom = searchParams.get("from");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<Mode>("outcomes");
  const [dims, setDims] = useState<DimDraft[]>([
    { key: key(), a: "", b: "", labelA: "", labelB: "" },
  ]);
  const [outcomes, setOutcomes] = useState<OutcomeDraft[]>([
    { key: key(), label: "", description: "" },
    { key: key(), label: "", description: "" },
  ]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [clonedTitle, setClonedTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cloneFrom) return;
    api.quizInfo(cloneFrom).then(
      (info) => {
        if (!info.definition) return;
        const drafts = draftsFromDefinition(info.definition);
        setTitle(info.definition.title);
        setDescription(info.definition.description ?? "");
        setMode(drafts.mode);
        if (drafts.dims.length > 0) setDims(drafts.dims);
        if (drafts.outcomes.length > 0) setOutcomes(drafts.outcomes);
        setQuestions(drafts.questions);
        setClonedTitle(info.definition.title);
      },
      (e) => setError(`couldn't load quiz to clone: ${e.message ?? e}`),
    );
  }, [cloneFrom]);

  /** Every valid scoring target in the current draft, with display labels. */
  const targets = useMemo(() => {
    if (mode === "dimensions") {
      return dims.flatMap((d) =>
        d.a && d.b
          ? [
              { value: d.a, label: `${d.a} — ${d.labelA || "?"}` },
              { value: d.b, label: `${d.b} — ${d.labelB || "?"}` },
            ]
          : [],
      );
    }
    return outcomes
      .filter((o) => o.label.trim())
      .map((o) => ({ value: o.key, label: o.label }));
  }, [mode, dims, outcomes]);

  /** In dimensions mode a scale question's right side is the partner pole. */
  function partnerPole(target: string): string {
    for (const d of dims) {
      if (d.a === target) return d.b;
      if (d.b === target) return d.a;
    }
    return "";
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (
      questions.length > 0 &&
      !confirm("Switching the result model resets which target each question scores. Continue?")
    ) {
      return;
    }
    setMode(next);
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.type === "choice") {
          return {
            ...q,
            options: q.options.map((o) => ({
              ...o,
              scores: o.scores.map((s) => ({ ...s, target: "" })),
            })),
          };
        }
        const base = {
          key: q.key,
          prompt: q.prompt,
          leftText: q.leftText,
          rightText: q.rightText,
          steps: q.steps,
        };
        return next === "dimensions"
          ? { ...base, type: "scale", leftTarget: "" }
          : { ...base, type: "scale-outcomes", leftScores: [freshScore()], rightScores: [freshScore()] };
      }),
    );
  }

  function addScale() {
    setQuestions((qs) => [
      ...qs,
      mode === "dimensions"
        ? { key: key(), type: "scale", prompt: "", leftText: "", rightText: "", leftTarget: "", steps: 5 }
        : {
            key: key(),
            type: "scale-outcomes",
            prompt: "",
            leftText: "",
            rightText: "",
            leftScores: [freshScore()],
            rightScores: [freshScore()],
            steps: 5,
          },
    ]);
  }

  function addChoice() {
    const freshOption = (): OptionDraft => ({ key: key(), text: "", scores: [freshScore()] });
    setQuestions((qs) => [
      ...qs,
      { key: key(), type: "choice", text: "", options: [freshOption(), freshOption()] },
    ]);
  }

  function patchQuestion(k: string, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q) => (q.key === k ? ({ ...q, ...patch } as QuestionDraft) : q)));
  }

  function moveQuestion(index: number, delta: number) {
    setQuestions((qs) => {
      const to = index + delta;
      if (to < 0 || to >= qs.length) return qs;
      const next = [...qs];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  function patchOption(qKey: string, oKey: string, patch: Partial<OptionDraft>) {
    setQuestions((qs) =>
      qs.map((q) =>
        q.key === qKey && q.type === "choice"
          ? { ...q, options: q.options.map((o) => (o.key === oKey ? { ...o, ...patch } : o)) }
          : q,
      ),
    );
  }

  function buildDefinition(): unknown {
    return {
      version: 1,
      title,
      ...(description.trim() ? { description: description.trim() } : {}),
      scoring: mode === "dimensions" ? "dimensions" : "weighted-outcomes",
      ...(mode === "dimensions"
        ? {
            dimensions: dims.map((d) => ({
              id: `${d.a}${d.b}`,
              poles: [d.a, d.b],
              labels: { [d.a]: d.labelA, [d.b]: d.labelB },
            })),
          }
        : {
            outcomes: outcomes.map((o) => ({
              id: o.key,
              label: o.label.trim(),
              ...(o.description.trim() ? { description: o.description.trim() } : {}),
            })),
          }),
      questions: questions.map((q, i) => {
        const id = `q${i + 1}`;
        const merge = (rows: ScoreDraft[]) => {
          const scores: Record<string, number> = {};
          for (const s of rows) scores[s.target] = (scores[s.target] ?? 0) + s.weight;
          return scores;
        };
        if (q.type === "choice") {
          return {
            id,
            type: "choice",
            text: q.text,
            options: q.options.map((o, j) => ({
              id: String.fromCharCode(97 + j),
              text: o.text,
              scores: merge(o.scores),
            })),
          };
        }
        const [leftScores, rightScores] =
          q.type === "scale"
            ? [{ [q.leftTarget]: 1 }, { [partnerPole(q.leftTarget)]: 1 }]
            : [merge(q.leftScores), merge(q.rightScores)];
        return {
          id,
          type: "scale",
          ...(q.prompt.trim() ? { prompt: q.prompt.trim() } : {}),
          left: { text: q.leftText, scores: leftScores },
          right: { text: q.rightText, scores: rightScores },
          steps: q.steps,
        };
      }),
    };
  }

  async function save() {
    setError(null);
    let definition;
    try {
      definition = parseQuizDefinition(buildDefinition());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setBusy(true);
    try {
      const info = await api.saveQuiz(definition, isPublic);
      navigate(`/q/${info.id}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      {clonedTitle && (
        <div className="callout">
          <b>Editing a copy of &ldquo;{clonedTitle}&rdquo;.</b> Saving creates a brand-new quiz
          — the original and its rounds are untouched.
        </div>
      )}
      <div className="card">
        <h2>Build a quiz</h2>
        <p className="small">
          Anything your friends can answer <em>about someone</em> works. Write{" "}
          <code className="mono">{"{name}"}</code> wherever the subject&rsquo;s name should
          appear &mdash; &ldquo;What would {"{name}"} grab in a fire?&rdquo;
        </p>
        <label htmlFor="qz-title">Title</label>
        <input
          id="qz-title"
          type="text"
          placeholder={'e.g. "Which kitchen appliance is {name}?"'}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label htmlFor="qz-desc" style={{ marginTop: 10 }}>
          Description (optional)
        </label>
        <input
          id="qz-desc"
          type="text"
          placeholder="One line about what this quiz reveals"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label style={{ marginTop: 14 }}>Result model</label>
        <div className="mode-picker">
          <button
            type="button"
            className="mode-option"
            aria-pressed={mode === "outcomes"}
            onClick={() => switchMode("outcomes")}
          >
            <b>Outcomes</b>
            <span className="small">
              &ldquo;Which X are you&rdquo; — answers add points to outcomes, top pile wins
            </span>
          </button>
          <button
            type="button"
            className="mode-option"
            aria-pressed={mode === "dimensions"}
            onClick={() => switchMode("dimensions")}
          >
            <b>Axes</b>
            <span className="small">
              MBTI-style — answers slide the subject along spectrums like E&hellip;I
            </span>
          </button>
        </div>
      </div>

      <div className="card">
        {mode === "outcomes" ? (
          <>
            <h2>Outcomes</h2>
            <p className="small">The possible results — at least two.</p>
            {outcomes.map((o, i) => (
              <div className="draft-row" key={o.key}>
                <input
                  type="text"
                  placeholder={`Outcome ${i + 1} — e.g. "Toaster"`}
                  value={o.label}
                  maxLength={60}
                  onChange={(e) =>
                    setOutcomes((os) =>
                      os.map((x) => (x.key === o.key ? { ...x, label: e.target.value } : x)),
                    )
                  }
                />
                <input
                  type="text"
                  placeholder="Description shown to whoever gets this (optional)"
                  value={o.description}
                  onChange={(e) =>
                    setOutcomes((os) =>
                      os.map((x) => (x.key === o.key ? { ...x, description: e.target.value } : x)),
                    )
                  }
                />
                <button
                  className="btn btn-small btn-danger"
                  disabled={outcomes.length <= 2}
                  onClick={() => setOutcomes((os) => os.filter((x) => x.key !== o.key))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn btn-small"
              onClick={() =>
                setOutcomes((os) => [...os, { key: key(), label: "", description: "" }])
              }
            >
              + add outcome
            </button>
          </>
        ) : (
          <>
            <h2>Axes</h2>
            <p className="small">
              Each axis runs between two poles, like <b>E</b> Extrovert &hellip; <b>I</b>{" "}
              Introvert. Give each pole a letter and a label.
            </p>
            {dims.map((d, i) => (
              <div className="draft-row draft-row-dim" key={d.key}>
                <input
                  type="text"
                  className="pole-letter mono"
                  placeholder="E"
                  value={d.a}
                  maxLength={8}
                  onChange={(e) =>
                    setDims((ds) =>
                      ds.map((x) => (x.key === d.key ? { ...x, a: e.target.value.trim() } : x)),
                    )
                  }
                />
                <input
                  type="text"
                  placeholder={`left pole label${i === 0 ? ' — e.g. "Extrovert"' : ""}`}
                  value={d.labelA}
                  maxLength={60}
                  onChange={(e) =>
                    setDims((ds) =>
                      ds.map((x) => (x.key === d.key ? { ...x, labelA: e.target.value } : x)),
                    )
                  }
                />
                <input
                  type="text"
                  className="pole-letter mono"
                  placeholder="I"
                  value={d.b}
                  maxLength={8}
                  onChange={(e) =>
                    setDims((ds) =>
                      ds.map((x) => (x.key === d.key ? { ...x, b: e.target.value.trim() } : x)),
                    )
                  }
                />
                <input
                  type="text"
                  placeholder={`right pole label${i === 0 ? ' — e.g. "Introvert"' : ""}`}
                  value={d.labelB}
                  maxLength={60}
                  onChange={(e) =>
                    setDims((ds) =>
                      ds.map((x) => (x.key === d.key ? { ...x, labelB: e.target.value } : x)),
                    )
                  }
                />
                <button
                  className="btn btn-small btn-danger"
                  disabled={dims.length <= 1}
                  onClick={() => setDims((ds) => ds.filter((x) => x.key !== d.key))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn btn-small"
              onClick={() =>
                setDims((ds) => [...ds, { key: key(), a: "", b: "", labelA: "", labelB: "" }])
              }
            >
              + add axis
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Questions</h2>
        {questions.length === 0 && (
          <p className="small muted">No questions yet — add your first below.</p>
        )}
        {questions.map((q, i) => (
          <div className="qdraft" key={q.key}>
            <div className="qdraft-head">
              <span className="small muted">
                {i + 1}. {q.type === "choice" ? "multiple choice" : "1–5 pair"}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <button
                  className="btn btn-small"
                  disabled={i === 0}
                  title="Move up"
                  aria-label="Move question up"
                  onClick={() => moveQuestion(i, -1)}
                >
                  ↑
                </button>
                <button
                  className="btn btn-small"
                  disabled={i === questions.length - 1}
                  title="Move down"
                  aria-label="Move question down"
                  onClick={() => moveQuestion(i, 1)}
                >
                  ↓
                </button>
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}
                >
                  remove
                </button>
              </div>
            </div>

            {q.type === "choice" ? (
              <>
                <input
                  type="text"
                  placeholder='Prompt — e.g. "It’s 2am. Where is {name}?"'
                  value={q.text}
                  maxLength={300}
                  onChange={(e) => patchQuestion(q.key, { text: e.target.value })}
                />
                {q.options.map((o) => (
                  <div className="opt-draft" key={o.key}>
                    <div className="draft-row">
                      <input
                        type="text"
                        placeholder="Option text"
                        value={o.text}
                        maxLength={300}
                        onChange={(e) => patchOption(q.key, o.key, { text: e.target.value })}
                      />
                      <button
                        className="btn btn-small btn-danger"
                        disabled={q.options.length <= 2}
                        onClick={() =>
                          patchQuestion(q.key, {
                            options: q.options.filter((x) => x.key !== o.key),
                          })
                        }
                      >
                        ✕
                      </button>
                    </div>
                    <ScoreRows
                      scores={o.scores}
                      targets={targets}
                      onChange={(scores) => patchOption(q.key, o.key, { scores })}
                    />
                  </div>
                ))}
                <button
                  className="btn btn-small"
                  disabled={q.options.length >= 8}
                  onClick={() =>
                    patchQuestion(q.key, {
                      options: [...q.options, { key: key(), text: "", scores: [freshScore()] }],
                    })
                  }
                >
                  + add option
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder='Optional header — e.g. "How often does {name} make plans?"'
                  value={q.prompt}
                  maxLength={300}
                  onChange={(e) => patchQuestion(q.key, { prompt: e.target.value })}
                />
                <div className="draft-row draft-row-pair">
                  <input
                    type="text"
                    placeholder='Left statement — e.g. "makes lists"'
                    value={q.leftText}
                    maxLength={300}
                    onChange={(e) => patchQuestion(q.key, { leftText: e.target.value })}
                  />
                  <span className="small muted">vs</span>
                  <input
                    type="text"
                    placeholder='Right statement — e.g. "relies on memory"'
                    value={q.rightText}
                    maxLength={300}
                    onChange={(e) => patchQuestion(q.key, { rightText: e.target.value })}
                  />
                </div>
                {q.type === "scale" ? (
                  <div className="draft-row draft-row-pair">
                    <select
                      value={q.leftTarget}
                      onChange={(e) => patchQuestion(q.key, { leftTarget: e.target.value })}
                    >
                      <option value="">left side scores toward…</option>
                      {targets.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <span className="small muted">&rarr;</span>
                    <span className="small">
                      right side scores{" "}
                      <b>
                        {targets.find((t) => t.value === partnerPole(q.leftTarget))?.label ??
                          "the opposite pole"}
                      </b>
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="score-group">
                      <span className="small muted">leaning left scores toward:</span>
                      <ScoreRows
                        scores={q.leftScores}
                        targets={targets}
                        onChange={(leftScores) => patchQuestion(q.key, { leftScores })}
                      />
                    </div>
                    <div className="score-group">
                      <span className="small muted">leaning right scores toward:</span>
                      <ScoreRows
                        scores={q.rightScores}
                        targets={targets}
                        onChange={(rightScores) => patchQuestion(q.key, { rightScores })}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={addChoice}>
            + multiple choice
          </button>
          <button className="btn" onClick={addScale}>
            + 1–5 pair
          </button>
        </div>
      </div>

      {error && (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      <div className="card">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          <span>
            <b>List this quiz publicly</b>
            <span className="small" style={{ display: "block" }}>
              It appears on the homepage, where anyone can start their own round of it.
              Either way it gets a permalink you can share.
            </span>
          </span>
        </label>
      </div>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save quiz"}
        </button>
      </div>
    </>
  );
}
