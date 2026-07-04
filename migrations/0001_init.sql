-- Quizzes are stored as validated canonical JSON definitions.
CREATE TABLE quizzes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  source      TEXT NOT NULL,               -- 'template' | 'manual' | 'ai_import'
  definition  TEXT NOT NULL,               -- canonical quiz JSON
  created_at  INTEGER NOT NULL             -- unix ms
);

-- A round = one subject x one quiz. Two-token auth: owner link (private
-- dashboard) and share link (public submit page).
CREATE TABLE rounds (
  id            TEXT PRIMARY KEY,
  quiz_id       TEXT NOT NULL REFERENCES quizzes(id),
  subject_name  TEXT NOT NULL,
  owner_token   TEXT NOT NULL UNIQUE,
  share_token   TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
  settings      TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL
);

CREATE TABLE submissions (
  id               TEXT PRIMARY KEY,
  round_id         TEXT NOT NULL REFERENCES rounds(id),
  respondent_name  TEXT,
  is_self          INTEGER NOT NULL DEFAULT 0,  -- subject's own take (perception gap)
  answers          TEXT NOT NULL,               -- {"q1": 4, ...} question id -> scale value
  result           TEXT NOT NULL,               -- computed result JSON at submit time
  created_at       INTEGER NOT NULL
);

CREATE INDEX idx_submissions_round ON submissions(round_id);
CREATE INDEX idx_rounds_owner ON rounds(owner_token);
CREATE INDEX idx_rounds_share ON rounds(share_token);
