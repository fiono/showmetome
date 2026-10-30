export const MIN_ROSTER = 2;
export const MAX_ROSTER = 10;

/** The trimmed, non-empty names in a roster draft. */
export function rosterNames(roster: string[]): string[] {
  return roster.map((n) => n.trim()).filter(Boolean);
}

/**
 * Editable 2–10 name list for creating a group round (optional group name
 * plus one input per friend). The parent owns the state and the submit button.
 */
export function RosterFields(props: {
  groupTitle: string;
  onGroupTitle: (title: string) => void;
  roster: string[];
  onRoster: (roster: string[]) => void;
  /** prefix for input ids, so two forms on a page don't collide */
  idPrefix?: string;
}) {
  const { roster, onRoster } = props;
  const prefix = props.idPrefix ?? "roster";
  const count = rosterNames(roster).length;

  return (
    <>
      <label htmlFor={`${prefix}-title`}>Group name (optional)</label>
      <input
        id={`${prefix}-title`}
        type="text"
        placeholder="e.g. the book club, my roommates"
        value={props.groupTitle}
        maxLength={60}
        onChange={(e) => props.onGroupTitle(e.target.value)}
      />
      <label style={{ marginTop: 12 }}>
        Who&rsquo;s in the group? ({count}/{MAX_ROSTER})
      </label>
      {roster.map((name, i) => (
        <div className="draft-row" key={i}>
          <input
            type="text"
            aria-label={`Friend ${i + 1}`}
            placeholder={`Friend ${i + 1}`}
            value={name}
            maxLength={60}
            onChange={(e) => onRoster(roster.map((n, j) => (j === i ? e.target.value : n)))}
          />
          {roster.length > MIN_ROSTER && (
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => onRoster(roster.filter((_, j) => j !== i))}
              aria-label={`Remove friend ${i + 1}`}
            >
              remove
            </button>
          )}
        </div>
      ))}
      {roster.length < MAX_ROSTER && (
        <button type="button" className="btn btn-small" onClick={() => onRoster([...roster, ""])}>
          + add friend
        </button>
      )}
    </>
  );
}
