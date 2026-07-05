import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { parseQuizDefinition } from "../../shared/validate";

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
  key: string;
  label: string;
  description: string;
}
interface OptionDraft {
  key: string;
  text: string;
  target: string;
  weight: number;
}
type QuestionDraft =
  | { key: string; type: "scale"; leftText: string; rightText: string; leftTarget: string }
  | { key: string; type: "scale-outcomes"; leftText: string; rightText: string; leftTarget: string; rightTarget: string }
  | { key: string; type: "choice"; text: string; options: OptionDraft[] };

export function Builder() {
  const navigate = useNavigate();
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          return { ...q, options: q.options.map((o) => ({ ...o, target: "" })) };
        }
        const base = { key: q.key, leftText: q.leftText, rightText: q.rightText };
        return next === "dimensions"
          ? { ...base, type: "scale", leftTarget: "" }
          : { ...base, type: "scale-outcomes", leftTarget: "", rightTarget: "" };
      }),
    );
  }

  function addScale() {
    setQuestions((qs) => [
      ...qs,
      mode === "dimensions"
        ? { key: key(), type: "scale", leftText: "", rightText: "", leftTarget: "" }
        : {
            key: key(),
            type: "scale-outcomes",
            leftText: "",
            rightText: "",
            leftTarget: "",
            rightTarget: "",
          },
    ]);
  }

  function addChoice() {
    setQuestions((qs) => [
      ...qs,
      {
        key: key(),
        type: "choice",
        text: "",
        options: [
          { key: key(), text: "", target: "", weight: 1 },
          { key: key(), text: "", target: "", weight: 1 },
        ],
      },
    ]);
  }

  function patchQuestion(k: string, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q) => (q.key === k ? ({ ...q, ...patch } as QuestionDraft) : q)));
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
        if (q.type === "choice") {
          return {
            id,
            type: "choice",
            text: q.text,
            options: q.options.map((o, j) => ({
              id: String.fromCharCode(97 + j),
              text: o.text,
              scores: { [o.target]: o.weight },
            })),
          };
        }
        const rightTarget = q.type === "scale" ? partnerPole(q.leftTarget) : q.rightTarget;
        return {
          id,
          type: "scale",
          left: { text: q.leftText, target: q.leftTarget },
          right: { text: q.rightText, target: rightTarget },
          steps: 5,
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
              <button
                className="btn btn-small btn-danger"
                onClick={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}
              >
                remove
              </button>
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
                  <div className="draft-row draft-row-opt" key={o.key}>
                    <input
                      type="text"
                      placeholder="Option text"
                      value={o.text}
                      maxLength={300}
                      onChange={(e) =>
                        patchQuestion(q.key, {
                          options: q.options.map((x) =>
                            x.key === o.key ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <select
                      value={o.target}
                      onChange={(e) =>
                        patchQuestion(q.key, {
                          options: q.options.map((x) =>
                            x.key === o.key ? { ...x, target: e.target.value } : x,
                          ),
                        })
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
                      value={o.weight}
                      title="points this option is worth"
                      onChange={(e) =>
                        patchQuestion(q.key, {
                          options: q.options.map((x) =>
                            x.key === o.key ? { ...x, weight: Number(e.target.value) } : x,
                          ),
                        })
                      }
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
                ))}
                <button
                  className="btn btn-small"
                  disabled={q.options.length >= 8}
                  onClick={() =>
                    patchQuestion(q.key, {
                      options: [...q.options, { key: key(), text: "", target: "", weight: 1 }],
                    })
                  }
                >
                  + add option
                </button>
              </>
            ) : (
              <>
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
                  {q.type === "scale" ? (
                    <span className="small">
                      right side scores{" "}
                      <b>
                        {targets.find((t) => t.value === partnerPole(q.leftTarget))?.label ??
                          "the opposite pole"}
                      </b>
                    </span>
                  ) : (
                    <select
                      value={q.rightTarget}
                      onChange={(e) => patchQuestion(q.key, { rightTarget: e.target.value })}
                    >
                      <option value="">right side scores toward…</option>
                      {targets.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
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
