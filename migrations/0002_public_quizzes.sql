-- Owner-opt-in public listing: public quizzes surface on the homepage,
-- where anyone can start a new round of them.
ALTER TABLE quizzes ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_quizzes_public ON quizzes(is_public, created_at);
