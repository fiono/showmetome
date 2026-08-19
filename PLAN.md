# showmetome — Plan

**"Show me to me."** You pick a quiz — a color-season analysis, a personality
quiz, anything — but you don't take it. Your friends take it *about you*.
The app aggregates their submissions into an outside-in portrait: the
consensus result, where friends agreed, where they split, and (optionally)
how their picture of you compares to your own.

The core inversion vs. a normal quiz app: the unit of interest is the
**subject**, not the quiz-taker. One subject accumulates many submissions,
which is why persistent storage and aggregation are the heart of the system.

---

## 1. Core concepts

| Concept | What it is |
|---|---|
| **Quiz** | A reusable definition: questions, options, outcomes, scoring rules. Comes from a template, the manual builder, or AI import. |
| **Round** | One subject × one quiz. "What color season is Frances?" Created by the subject (or a friend on their behalf). Owns two links. |
| **Submission** | One friend's complete set of answers for a round, plus their individually computed result. |
| **Aggregate** | Computed view over a round's submissions: consensus outcome, per-question distributions, agreement/split stats. |

### The two-link auth model (no accounts)

Creating a round mints two unguessable tokens (nanoid, ~21 chars):

- **Owner link** (`/r/<owner_token>`) — private. Results dashboard, round
  settings, close/delete round. Losing it means losing admin access, so the
  UI nags you to save/bookmark it (and offers a "copy both links" button).
- **Share link** (`/s/<share_token>`) — public. What friends open to submit.
  Never reveals the owner token.

That's the entire auth system for v1. Consequences to accept and mitigate:
anyone with the share link can submit (cap submissions per round, e.g. 100;
set a cookie to discourage double-submits; owner can delete any submission
from the dashboard).

---

## 2. Quiz sources: three inputs, one pipeline

All three sources the app supports converge on the same canonical quiz
format, and the manual builder doubles as the review/edit surface for the
other two:

```
templates ─────────────┐
manual builder ────────┼──▶ canonical quiz JSON ──▶ rounds/submissions/aggregation
AI import ──▶ builder ─┘        (validated)
```

1. **Template library** — a curated set shipped as seed data (color season,
   Big Five–style dimensions, love languages, "which X are you"). These
   guarantee the app is instantly usable and give the aggregation layer
   well-tested scoring to develop against.
2. **Manual builder** — form-based editor for questions/options/outcomes and
   how options map to outcomes. Also serves as the edit step after AI import.
3. **AI import** — paste a URL or raw quiz text. The server fetches the page
   (with paste-the-text fallback for sites that block fetching), sends it to
   an LLM with a strict JSON schema, validates the output, then drops the
   result **into the manual builder for human review** before saving. AI
   import is never trusted blind.

### Canonical quiz format (stored as JSON in D1)

```jsonc
{
  "version": 1,
  "title": "What color season are you?",
  "scoring": "weighted-outcomes",   // v1 supports this one type; see below
  "outcomes": [
    { "id": "autumn", "label": "Autumn", "description": "Warm, muted, deep..." }
  ],
  "questions": [
    {
      "id": "q1",
      "text": "What color are {name}'s eyes?",   // {name} = subject substitution
      "options": [
        { "id": "a", "text": "Warm brown", "scores": { "autumn": 2, "spring": 1 } }
      ]
    }
  ]
}
```

- **Scoring types.** `dimensions` (bipolar axes like MBTI's E/I) shipped
  first, in M1, because the flagship template — dynomight's Fastest
  Personality Test — is axis-scored: 32 statement *pairs* on a 5-point
  scale (`type: "scale"` questions with a pole on each side), 8 per axis,
  each axis binned into 5 bins with dynomight's casing convention
  (uppercase = clear call, lowercase = near the middle). The
  `weighted-outcomes` type described above (options add weight to
  outcomes; highest total wins) lands with the template library/builder in
  M2. The `version` + `scoring` fields keep the two coexisting.
- **Second-person problem**: quizzes are written as "Do *you* prefer...".
  Two-layer fix: the submit page frames everything as *"Answer as if you
  were {name}"* (works verbatim for any quiz), and AI import / builder can
  additionally rewrite questions to third person with `{name}` placeholders
  for a nicer experience. Templates ship already using `{name}`.
- JSON-in-a-column (vs. normalized question/option tables) is deliberate:
  quiz structures are arbitrary and read as a unit; only submissions need
  relational treatment for aggregation, and those aggregate in app code
  (a round has at most ~100 submissions — trivial to compute per request).

---

## 3. Data model (D1 / SQLite)

```sql
CREATE TABLE quizzes (
  id          TEXT PRIMARY KEY,            -- nanoid
  title       TEXT NOT NULL,
  source      TEXT NOT NULL,               -- 'template' | 'manual' | 'ai_import'
  definition  TEXT NOT NULL,               -- canonical quiz JSON (validated on write)
  created_at  INTEGER NOT NULL             -- unix ms
);

CREATE TABLE rounds (
  id            TEXT PRIMARY KEY,
  quiz_id       TEXT NOT NULL REFERENCES quizzes(id),
  subject_name  TEXT NOT NULL,             -- "Frances"
  owner_token   TEXT NOT NULL UNIQUE,      -- private admin/results link
  share_token   TEXT NOT NULL UNIQUE,      -- public submit link
  status        TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  settings      TEXT NOT NULL DEFAULT '{}',    -- e.g. {"showFriendResult": true}
  created_at    INTEGER NOT NULL
);

CREATE TABLE submissions (
  id               TEXT PRIMARY KEY,
  round_id         TEXT NOT NULL REFERENCES rounds(id),
  respondent_name  TEXT,                   -- optional; "anonymous" allowed
  is_self          INTEGER NOT NULL DEFAULT 0,  -- subject's own take (perception gap)
  answers          TEXT NOT NULL,          -- {"q1": "a", "q2": "c", ...}
  result           TEXT NOT NULL,          -- computed outcome scores at submit time
  created_at       INTEGER NOT NULL
);

CREATE INDEX idx_submissions_round ON submissions(round_id);
CREATE INDEX idx_rounds_owner ON rounds(owner_token);
CREATE INDEX idx_rounds_share ON rounds(share_token);
```

Group rounds (M5, migration `0004`) add this, additively:

```sql
ALTER TABLE rounds ADD COLUMN mode TEXT NOT NULL DEFAULT 'individual';
-- 'individual' | 'group'. For a group round, rounds.subject_name holds the
-- group title (e.g. "the crew"); the roster lives in `subjects`.
CREATE TABLE subjects (
  id        TEXT PRIMARY KEY,               -- nanoid
  round_id  TEXT NOT NULL REFERENCES rounds(id),
  name      TEXT NOT NULL,                  -- one roster member
  position  INTEGER NOT NULL               -- roster order (drives chip color)
);
CREATE INDEX idx_subjects_round ON subjects(round_id);
ALTER TABLE submissions ADD COLUMN subject_id TEXT;  -- NULL for individual
ALTER TABLE submissions ADD COLUMN sitting_id TEXT;  -- groups one sitting's N rows
CREATE INDEX idx_submissions_subject ON submissions(subject_id);
```

One group sitting writes N `submissions` rows (one per roster member,
sharing a `sitting_id`), so each friend's consensus is just
`aggregateRound` over their own rows — the entire aggregation/comparison
machinery reused with no new math.

Results are computed per submission at write time (stable even if a quiz is
later edited) and aggregated across the round at read time.

---

## 4. Aggregation — the product's payoff

The results dashboard (owner link) shows:

1. **Consensus result** — sum each submission's outcome scores across all
   friends; top outcome is "how your friends see you", with a score bar per
   outcome (e.g. *Autumn 62% · Spring 23% · Winter 15%*).
2. **Verdict spread** — each friend's individual result as a tally:
   *"5 friends got you Autumn, 2 got Spring."*
3. **Per-question breakdown** — option distribution per question, sorted by
   disagreement, surfacing *"most agreed"* (8/9 picked the same option) and
   *"most divided"* (measured by the top option's vote share).
4. **Perception gap** (once `is_self` exists) — the subject takes the quiz
   too; dashboard contrasts self-result vs. friends-consensus and highlights
   the questions where self and friends diverge most. This is the feature
   that makes people share the app.
5. **Respondent list** — who answered and when, with per-submission detail
   and owner-only delete.

What friends see after submitting is a round setting: their own computed
result, the running consensus, or just a thank-you.

---

## 5. Stack (Cloudflare free tier, all-JS)

Chosen for the "works on Cloudflare free tier, Python or JS" constraint —
the JS path is the one Cloudflare's free tier actually supports well
(Python Workers are beta and can't run FastAPI/Django; Next.js needs an
adapter that adds friction without adding value here).

| Layer | Choice | Free-tier fit |
|---|---|---|
| Runtime + API | **Cloudflare Worker + Hono** (TypeScript) | 100k requests/day |
| Database | **D1** (SQLite) | 5 GB, 5M row reads/day, 100k writes/day |
| Frontend | **Vite + React SPA**, served via Workers Static Assets | free, unlimited static requests |
| AI import | **Workers AI** (free daily allocation) behind a provider interface; optional Anthropic API key as a Worker secret for higher parse quality | $0 default |
| Dev/deploy | **wrangler** (`wrangler dev` local with local D1; `wrangler deploy`) | free; `*.workers.dev` subdomain included |

One Worker serves both the API (`/api/*`) and the SPA — one deploy, no CORS.
A friends-scale app won't get within an order of magnitude of these limits.

```
showmetome/
├── wrangler.toml
├── migrations/            # D1 SQL migrations (wrangler d1 migrations)
├── src/
│   ├── worker/            # Hono app: routes, scoring, aggregation, AI import
│   │   ├── index.ts
│   │   ├── routes/        # quizzes, rounds, submissions, results, import
│   │   ├── scoring.ts     # pure functions: score submission, aggregate round
│   │   └── quizSchema.ts  # zod schema for canonical quiz JSON
│   ├── app/               # React SPA: create flow, builder, submit page, dashboard
│   └── shared/            # types shared between worker and app
├── seeds/templates/       # built-in quiz library as JSON files
└── package.json
```

### API sketch

```
POST /api/rounds                    create round (quiz_id or inline quiz, subject name)
GET  /api/rounds/share/:shareToken  quiz + subject for the submit page (no results)
POST /api/rounds/share/:shareToken/submissions   friend submits answers
GET  /api/rounds/owner/:ownerToken  full results: aggregate + submissions
PATCH/DELETE (owner-token routes)   close round, settings, delete submission
GET  /api/templates                 template library
POST /api/import                    { url | text } → parsed quiz JSON for builder review
POST /api/quizzes                   save a built/reviewed quiz
```

Scoring and aggregation live in `scoring.ts` as pure functions over the quiz
JSON + answers — the most unit-testable and most correctness-critical code
in the app.

---

## 6. Milestones

Each milestone ends deployed and usable.

- **M1 — Core loop (the whole idea, minimally). ✅ Shipped.** Worker + Hono +
  D1 + React scaffold; migrations; one hardcoded template quiz (dynomight's
  Fastest Personality Test, 32 items, dimensions-scored). Create round →
  two links → friends submit → owner dashboard with consensus + verdict
  spread + agree/argue question breakdowns. *This alone proves the product.*
- **M2 — Manual builder. ✅ Shipped (builder half).** The quiz format now
  supports both scoring modes (`dimensions` axes and `weighted-outcomes`)
  and both question types (1–5 scale pairs and multiple choice) in either
  mode, with a shared hand-rolled validator used by the builder UI and the
  API. `/build` creates quizzes; `/q/:quizId` is a saved quiz's bookmarkable
  home for starting rounds. Remaining from the original M2 scope: seeding a
  proper template library (4–6 curated quizzes).
- **M3 — AI import.** URL fetch + text paste → LLM (Workers AI default,
  Anthropic-key optional) → schema-validated quiz JSON → opens in the
  builder for review → save. Handles the "arbitrary quizzes" promise.
- **M4 — Perception gap + polish. ✅ Mostly shipped.** Self-take
  (`is_self`, owner-token authed, retake replaces, excluded from the
  friends' consensus everywhere) with a self-vs-friends comparison on the
  dashboard; friends get the same treatment — after submitting, they see
  their read vs. the *other* respondents (anonymized aggregate only, no
  names leak). Both views share one ComparisonView: you-diamond overlaid
  on the group's axis dots (or you-vs-group outcome share bars), plus
  "where you split" ranked by an answerDivergence metric with your pick
  highlighted per question. Agreement highlights, close round, submission
  cap, and OG share previews shipped earlier. The double-submit guard is a
  soft one: submitting sets an HttpOnly per-round cookie, returning
  visitors get a "you already answered" notice with an explicit
  answer-again override (never a hard block — shared devices are
  legitimate, and duplicates stay owner-deletable). **M4 complete.**
- **M5 — Group rounds. ✅ Shipped.** A round is now either *individual*
  (one subject, unchanged) or *group* (a fixed roster of 2–10 friends),
  gated on a new `rounds.mode` column that defaults to `'individual'` so
  every existing round is untouched. Group rounds draw from the same
  quizzes; the organizer sorts the whole roster on a **board** — all
  questions in one scroll, each its own mini-board where you read the
  question once and assign every friend by tap-to-assign (tap a friend then
  their answer, or tap an answer then the friends who fit), with pointer
  drag as a desktop enhancement and a **"+ everyone else"** shortcut per
  answer to kill the tedium of ~N×Q placements. One sitting expands to N
  `submissions` rows sharing a `sitting_id`, each tagged with its
  `subject_id`, so `scoreSubmission`/`aggregateRound` are reused per friend
  with **zero new scoring math** — each friend's result is `aggregateRound`
  over their own rows (a consensus once multiple people sort the same
  roster). Results show a **group picture** (all friends on one `AxisChart`
  for dimensions, or an outcome tally for weighted-outcomes) plus a
  per-friend readout, both after a sitting and on the owner dashboard.
  Because data is stored per-friend, *collaborative consensus* (several
  people sort the same roster → per-friend perception gap) is a later add
  with no schema change. Migration `0004_group_rounds.sql`.
- **M6 — Alignment charts. ✅ Shipped.** A third scoring mode,
  `"alignment"`: the quiz maker names two axes (x: Chaotic↔Lawful, y:
  Evil↔Good) and the quiz has **no questions at all** — taking it is
  **direct placement**, tapping/dragging the subject (or, in group mode,
  every roster member; the next chip auto-arms so 10 friends is 10 taps)
  straight onto a 2D SVG grid. The stored answer is one
  `{ placement: "x,y" }` entry, so `Answers`, `GroupAnswers`, the sitting
  endpoint, and D1 are all untouched; the result is
  `{ kind: "alignment", x, y, quadrant }` where the quadrant label combines
  the pole words ("Chaotic Good") with a ±0.2 neutral band (matching
  `scoreToBin`'s middle quintile) that reads "Neutral" / "True Neutral" —
  shaded on the chart so the verdict never surprises. The validator
  requires `questions: []` for alignment, so every per-question surface
  (aggregates, breakdowns, divergence, agree/argue cards) no-ops by
  construction; `aggregateRound` gains an alignment branch (mean position →
  consensus, quadrant tally) reusing `axisScores` under fixed `"x"`/`"y"`
  keys. One `AlignmentChart` SVG renders everywhere: builder live preview,
  quiz-page preview, post-submit result, dashboard consensus (dots + a
  consensus cross), self-vs-friends comparison (you-diamond + a "N% of the
  chart apart" gap line), and the group showcase (everyone as a named,
  roster-colored dot on one chart). The builder's third mode option is the
  simplest authoring path in the app: four axis-end labels and done. New
  template `tmpl_alignment_v1` ("The Alignment Chart"). No migration —
  purely additive on the shared layer.

### Social link previews (Open Graph)

Share (`/s/:token`) and quiz (`/q/:id`) links run the Worker first, which
injects per-link Open Graph + Twitter Card tags into the SPA shell (via
`HTMLRewriter`) so a pasted link in WhatsApp/iMessage/Slack previews with
the subject's name ("How well do you know Fiona?"), the quiz description,
and a branded `og:image`. Humans still get the full SPA — the tags are
appended to the same `index.html` that boots React. The image is a static
branded card in `public/og-image.png`; a per-subject generated image would
need runtime PNG rendering (satori/resvg) and is deferred.

### The viral loop (shipped with M2)

Anyone who receives a share link can answer anonymously (name field is
optional), and the post-submit screen offers to mint them their own round
of the same quiz — enter your name, get your own owner + share links.
The share payload carries the quiz id to make this possible; quizzes are
already persistent, so a quiz propagates from friend to friend with no
copying.

### Live preview on the quiz page

Every quiz page embeds a **live preview** of the friend experience — the
same header, questions, and (locally-scored) result a friend would see —
in a framed panel that updates on every keystroke of the "who is it
about?" field, so `{name}` substitutions render in real time. It reuses
the shared `scoreSubmission`, so answering the preview shows a real result
with nothing persisted; "Looks good — start a round" hands straight to the
create-round action. (This replaced an earlier standalone `/q/:id/preview`
route.)

### Cloning instead of editing

Any quiz page offers **clone & edit** (`/build?from=<quizId>`), which loads
the definition back into the builder; saving always creates a new quiz.
In-place editing was considered and rejected for now: the `/q/` permalink
is not a secret (it's the share/listing link, so it can't prove ownership),
and mutating a definition would corrupt dashboards of live rounds that
reference it. Real editing would need a quiz owner-token plus
copy-on-write versioning — future work if cloning proves insufficient.

Scale sides and choice options both score weighted **sets** of targets
(`scores: {fire: 2, air: 1}`), so a 1–5 pair is as expressive as a choice
option in either scoring mode. A 1–5 pair may also carry an optional
`prompt` header ("How often does {name} make plans?") shown above the
statements, so the two sides can read as scale endpoints ("Never" …
"All the time"); it is additive and absent on every pre-existing quiz.
The builder can reorder questions with up/down controls.

## 7. Open questions (deferred, not blocking)

- ~~**Homepage gallery of popular quizzes**~~ — shipped as owner-opt-in:
  a "list this quiz publicly" checkbox in the builder puts the quiz on the
  homepage (`/api/quizzes/public`, 50 most recent), where anyone can start
  a round via its `/q/:quizId` permalink, ranked by popularity (completions,
  then rounds started — derived counts, not stored). Unlisted quizzes keep
  working via their permalink. Takedown = setting the `delisted` column
  (hides from the homepage, permalink unaffected); command documented in
  the README. A report button + admin view remain future work if strangers
  show up.

- **Results visibility for friends** — per-round setting; default = friend
  sees their own result only, not the group's, until the owner shares.
- ~~**Dimension-scored quizzes**~~ — pulled forward into M1 (see above);
  `weighted-outcomes` is now the type that lands in M2 instead.
- **Owner-link recovery** — no accounts means no recovery; v2 could add an
  optional email-the-link-to-me field without becoming an auth system.
- **Moderation/abuse** — share links are public; v1 relies on obscure tokens,
  submission caps, and owner delete. Revisit if the app grows beyond friends.
