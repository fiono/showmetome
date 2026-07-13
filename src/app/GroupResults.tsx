import { AxisChart, FriendChip } from "./components";
import { verdictLabel } from "./Comparison";
import type {
  DimensionsResult,
  GroupSubject,
  QuizDefinition,
  SubmissionResult,
} from "../shared/types";

export interface GroupEntry {
  subject: GroupSubject;
  result: SubmissionResult;
}

/**
 * The group picture: an overview (all friends on one axis chart, or an
 * outcome tally with each friend under their result) plus a per-friend readout.
 * `colorIndex` follows roster order so chip colors match the board.
 */
export function GroupResults(props: {
  quiz: QuizDefinition;
  entries: GroupEntry[];
  colorOf: Record<string, number>;
  /** e.g. "the crew" — used in the heading. */
  groupTitle: string;
}) {
  const { quiz, entries, colorOf } = props;
  const isDimensions = quiz.scoring === "dimensions";

  return (
    <>
      <div className="card">
        <h2>{props.groupTitle}, sorted</h2>
        {isDimensions ? (
          <>
            <p className="hero-sub">Every friend placed on each spectrum.</p>
            <AxisChart
              dimensions={quiz.dimensions!}
              scores={Object.fromEntries(
                quiz.dimensions!.map((d) => [
                  d.id,
                  entries.map(
                    (e) => (e.result as DimensionsResult).axes.find((a) => a.dimension === d.id)!.score,
                  ),
                ]),
              )}
              names={entries.map((e) => e.subject.name)}
            />
          </>
        ) : (
          <OutcomeTally quiz={quiz} entries={entries} colorOf={colorOf} />
        )}
      </div>

      <div className="card">
        <h3 className="small muted" style={{ margin: "0 0 8px" }}>
          EACH FRIEND
        </h3>
        {entries.map((e) => (
          <div className="friend-row" key={e.subject.id}>
            <FriendChip name={e.subject.name} colorIndex={colorOf[e.subject.id]} />
            <span className={`friend-verdict${isDimensions ? " mono" : ""}`}>
              {verdictLabel(quiz, e.result)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Outcome mode: group friends by their winning outcome, biggest pile first. */
function OutcomeTally(props: {
  quiz: QuizDefinition;
  entries: GroupEntry[];
  colorOf: Record<string, number>;
}) {
  const { quiz, entries, colorOf } = props;
  const byOutcome = new Map<string, GroupEntry[]>();
  for (const e of entries) {
    const id = e.result.kind === "outcomes" ? e.result.winnerId : "";
    if (!byOutcome.has(id)) byOutcome.set(id, []);
    byOutcome.get(id)!.push(e);
  }
  const rows = [...byOutcome.entries()]
    .map(([id, es]) => ({
      label: quiz.outcomes!.find((o) => o.id === id)?.label ?? id,
      entries: es,
    }))
    .sort((a, b) => b.entries.length - a.entries.length || a.label.localeCompare(b.label));
  const max = Math.max(1, ...rows.map((r) => r.entries.length));

  return (
    <div>
      <p className="hero-sub">Where everyone landed.</p>
      {rows.map((r) => (
        <div className="tally-block" key={r.label}>
          <div className="tally-row">
            <span className="tally-type">{r.label}</span>
            <div className="tally-track">
              <div
                className="tally-fill"
                style={{ width: `${(r.entries.length / max) * 100}%` }}
              />
            </div>
            <span className="tally-count">{r.entries.length}</span>
          </div>
          <div className="tally-chips">
            {r.entries.map((e) => (
              <FriendChip key={e.subject.id} name={e.subject.name} colorIndex={colorOf[e.subject.id]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
