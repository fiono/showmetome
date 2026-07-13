-- Group rounds: one organizer sorts a fixed roster of 2-10 friends through the
-- same quiz, making a per-friend selection on each question. Additive and
-- back-compatible — individual rounds keep mode = 'individual' and leave the
-- new submission columns NULL.

ALTER TABLE rounds ADD COLUMN mode TEXT NOT NULL DEFAULT 'individual';  -- 'individual' | 'group'

-- The roster of a group round. For a group round, rounds.subject_name holds the
-- group's title (e.g. "the book club"); the people are these rows.
CREATE TABLE subjects (
  id        TEXT PRIMARY KEY,       -- nanoid
  round_id  TEXT NOT NULL REFERENCES rounds(id),
  name      TEXT NOT NULL,
  position  INTEGER NOT NULL        -- display order
);
CREATE INDEX idx_subjects_round ON subjects(round_id);

-- A group "sitting" (one person sorting the whole roster once) expands to N
-- submission rows — one per friend, all sharing a sitting_id, each tagged with
-- which roster member (subject_id) it scores. NULL on both for individual rounds.
ALTER TABLE submissions ADD COLUMN subject_id TEXT;   -- REFERENCES subjects(id)
ALTER TABLE submissions ADD COLUMN sitting_id TEXT;

CREATE INDEX idx_submissions_subject ON submissions(subject_id);
