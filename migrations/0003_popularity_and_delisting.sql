-- Moderation: a delisted quiz never appears in the public listing (even if
-- is_public = 1), but its permalink and existing rounds keep working.
-- There is no admin UI; delist with:
--   wrangler d1 execute showmetome --remote \
--     --command "UPDATE quizzes SET delisted = 1 WHERE id = 'quiz_...'"
ALTER TABLE quizzes ADD COLUMN delisted INTEGER NOT NULL DEFAULT 0;

-- Popularity (rounds created / quizzes completed per quiz) is derived by
-- counting rounds and submissions; this index makes those counts cheap.
CREATE INDEX idx_rounds_quiz ON rounds(quiz_id);
