# showmetome

**"Show me to me."** Pick a quiz — but don't take it. Your friends answer
every question *about you*, and you get the aggregate: the consensus
result, where they agreed, and where they argued. See [PLAN.md](PLAN.md)
for the full design.

The built-in template is the
[Fastest Personality Test](https://dynomight.net/mbti/) by dynomight
(32 either/or items, four MBTI axes, five bins per axis). The `/build`
page creates your own quizzes: multiple-choice and 1–5 scale questions,
scored either toward **outcomes** ("which kitchen appliance is {name}?")
or along **axes** (MBTI-style spectrums).

## Stack

One Cloudflare Worker serves both the API (Hono, under `/api/*`) and the
React SPA (Vite, static assets). Storage is D1 (Cloudflare's SQLite).
Everything fits the Cloudflare free tier.

```
src/
├── shared/     # canonical quiz types, pure scoring + aggregation (unit-tested)
│   └── templates/mbti.ts   # the hardcoded M1 quiz
├── worker/     # Hono API: rounds, submissions, owner results
└── app/        # React SPA: create round, friend submit page, owner dashboard
migrations/     # D1 schema
```

No accounts: creating a round mints a private **owner link** (`/r/<token>`,
the results dashboard — save it, it's the only way back) and a public
**share link** (`/s/<token>`) that friends open to answer.

Share and quiz links (`/s/*`, `/q/*`) are served by the Worker, which
injects per-link Open Graph tags into the SPA shell so pasted links get
rich previews (subject name + quiz description + `public/og-image.png`) in
WhatsApp, iMessage, Slack, etc.

## Develop

```sh
npm install
npm run db:migrate:local   # apply D1 migrations to the local database
npm run dev                # vite dev server (worker + SPA + local D1)
npm test                   # scoring engine unit tests
npm run check              # typecheck app + worker
```

## Deploy

One-time setup:

```sh
npx wrangler login
npx wrangler d1 create showmetome   # copy the returned id into wrangler.jsonc database_id
npm run db:migrate:remote
```

Then:

```sh
npm run deploy
```

After pulling changes that add a file to `migrations/`, run
`npm run db:migrate:remote` again before deploying.

## Moderation

Public listing is owner-opt-in, and the homepage ranks listed quizzes by
popularity (completions, then rounds started — both derived by counting,
not stored). There is no admin UI; to pull a problematic quiz off the
homepage without breaking its permalink or existing rounds:

```sh
npx wrangler d1 execute showmetome --remote \
  --command "UPDATE quizzes SET delisted = 1 WHERE id = 'quiz_...'"
```
