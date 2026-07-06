import { Hono } from "hono";
import { nanoid } from "nanoid";
import { aggregateRound, scoreSubmission } from "../shared/scoring";
import { parseQuizDefinition, normalizeResult } from "../shared/validate";
import { TEMPLATES } from "../shared/templates/mbti";
import type {
  Answers,
  CreateRoundResponse,
  OwnerView,
  QuizDefinition,
  QuizInfo,
  ShareView,
  SubmissionResult,
  SubmissionView,
  TemplateInfo,
} from "../shared/types";

const MAX_SUBMISSIONS_PER_ROUND = 200;
const MAX_NAME_LENGTH = 60;
const MAX_DEFINITION_BYTES = 100_000;

interface WorkerEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}
type Env = { Bindings: WorkerEnv };

const app = new Hono<Env>().basePath("/api");

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

app.get("/templates", (c) => {
  const templates: TemplateInfo[] = TEMPLATES.map(({ id, quiz }) => ({
    id,
    title: quiz.title,
    description: quiz.description,
    attribution: quiz.attribution,
    questionCount: quiz.questions.length,
  }));
  return c.json(templates);
});

// --- quizzes ---

interface QuizRow {
  id: string;
  title: string;
  source: QuizInfo["source"];
  definition: string;
  is_public: number;
  round_count: number;
  submission_count: number;
}

/** Selects quiz rows with derived popularity counts. */
const QUIZ_SELECT = `SELECT q.id, q.title, q.source, q.definition, q.is_public,
  (SELECT COUNT(*) FROM rounds r WHERE r.quiz_id = q.id) AS round_count,
  (SELECT COUNT(*) FROM submissions s JOIN rounds r ON r.id = s.round_id WHERE r.quiz_id = q.id) AS submission_count
FROM quizzes q`;

function quizInfo(row: QuizRow, quiz: QuizDefinition): QuizInfo {
  return {
    id: row.id,
    title: quiz.title,
    description: quiz.description,
    attribution: quiz.attribution,
    source: row.source,
    questionCount: quiz.questions.length,
    isPublic: row.is_public === 1,
    roundCount: row.round_count,
    submissionCount: row.submission_count,
  };
}

app.post("/quizzes", async (c) => {
  const body = await c.req
    .json<{ definition?: unknown; isPublic?: boolean }>()
    .catch(() => null);
  if (!body?.definition) return c.json({ error: "definition is required" }, 400);

  let quiz: QuizDefinition;
  try {
    quiz = parseQuizDefinition(body.definition);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "invalid definition" }, 400);
  }
  const json = JSON.stringify(quiz);
  if (json.length > MAX_DEFINITION_BYTES) return c.json({ error: "quiz is too large" }, 400);

  const id = `quiz_${nanoid(14)}`;
  const isPublic = body.isPublic === true ? 1 : 0;
  await c.env.DB.prepare(
    "INSERT INTO quizzes (id, title, source, definition, created_at, is_public) VALUES (?, ?, 'manual', ?, ?, ?)",
  )
    .bind(id, quiz.title, json, Date.now(), isPublic)
    .run();
  return c.json(
    quizInfo(
      {
        id,
        title: quiz.title,
        source: "manual",
        definition: json,
        is_public: isPublic,
        round_count: 0,
        submission_count: 0,
      },
      quiz,
    ),
    201,
  );
});

// Must be registered before /quizzes/:id or the :id route captures "public".
app.get("/quizzes/public", async (c) => {
  const order =
    c.req.query("sort") === "recent"
      ? "q.created_at DESC"
      : "submission_count DESC, round_count DESC, q.created_at DESC";
  const { results } = await c.env.DB.prepare(
    `${QUIZ_SELECT} WHERE q.is_public = 1 AND q.delisted = 0 ORDER BY ${order} LIMIT 50`,
  ).all<QuizRow>();
  return c.json(results.map((row) => quizInfo(row, parseQuizDefinition(JSON.parse(row.definition)))));
});

app.get("/quizzes/:id", async (c) => {
  const row = await c.env.DB.prepare(`${QUIZ_SELECT} WHERE q.id = ?`)
    .bind(c.req.param("id"))
    .first<QuizRow>();
  if (!row) return c.json({ error: "quiz not found" }, 404);
  const quiz = parseQuizDefinition(JSON.parse(row.definition));
  // Include the definition so anyone can clone the quiz into the builder.
  return c.json({ ...quizInfo(row, quiz), definition: quiz });
});

// --- rounds ---

app.post("/rounds", async (c) => {
  const body = await c.req
    .json<{ templateId?: string; quizId?: string; subjectName?: string }>()
    .catch(() => null);
  const subjectName = body?.subjectName?.trim();
  if (!subjectName || subjectName.length > MAX_NAME_LENGTH) {
    return c.json({ error: `subjectName is required (max ${MAX_NAME_LENGTH} chars)` }, 400);
  }

  const now = Date.now();
  let quizId: string;
  if (body?.quizId) {
    const row = await c.env.DB.prepare("SELECT id FROM quizzes WHERE id = ?")
      .bind(body.quizId)
      .first<{ id: string }>();
    if (!row) return c.json({ error: "unknown quizId" }, 400);
    quizId = row.id;
  } else {
    const template = TEMPLATES.find((t) => t.id === body?.templateId);
    if (!template) return c.json({ error: "unknown templateId or quizId" }, 400);
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO quizzes (id, title, source, definition, created_at) VALUES (?, ?, 'template', ?, ?)",
    )
      .bind(template.id, template.quiz.title, JSON.stringify(template.quiz), now)
      .run();
    quizId = template.id;
  }

  const response: CreateRoundResponse = {
    roundId: nanoid(12),
    subjectName,
    ownerToken: nanoid(24),
    shareToken: nanoid(24),
  };
  await c.env.DB.prepare(
    "INSERT INTO rounds (id, quiz_id, subject_name, owner_token, share_token, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)",
  )
    .bind(response.roundId, quizId, subjectName, response.ownerToken, response.shareToken, now)
    .run();

  return c.json(response, 201);
});

interface RoundRow {
  id: string;
  subject_name: string;
  status: "open" | "closed";
  created_at: number;
  share_token: string;
  quiz_id: string;
  definition: string;
}

const ROUND_SELECT =
  "SELECT r.id, r.subject_name, r.status, r.created_at, r.share_token, r.quiz_id, q.definition " +
  "FROM rounds r JOIN quizzes q ON q.id = r.quiz_id";

async function roundByToken(
  db: D1Database,
  column: "share_token" | "owner_token",
  token: string,
): Promise<{ row: RoundRow; quiz: QuizDefinition } | null> {
  const row = await db
    .prepare(`${ROUND_SELECT} WHERE r.${column} = ?`)
    .bind(token)
    .first<RoundRow>();
  if (!row) return null;
  // parseQuizDefinition also upgrades definitions stored in the M1 shape.
  return { row, quiz: parseQuizDefinition(JSON.parse(row.definition)) };
}

app.get("/rounds/share/:shareToken", async (c) => {
  const found = await roundByToken(c.env.DB, "share_token", c.req.param("shareToken"));
  if (!found) return c.json({ error: "round not found" }, 404);
  const view: ShareView = {
    subjectName: found.row.subject_name,
    status: found.row.status,
    quizId: found.row.quiz_id,
    quiz: {
      title: found.quiz.title,
      description: found.quiz.description,
      attribution: found.quiz.attribution,
      definition: found.quiz,
    },
  };
  return c.json(view);
});

app.post("/rounds/share/:shareToken/submissions", async (c) => {
  const found = await roundByToken(c.env.DB, "share_token", c.req.param("shareToken"));
  if (!found) return c.json({ error: "round not found" }, 404);
  if (found.row.status !== "open") return c.json({ error: "this round is closed" }, 409);

  const body = await c.req
    .json<{ respondentName?: string; answers?: Answers }>()
    .catch(() => null);
  if (!body?.answers) return c.json({ error: "answers are required" }, 400);
  const respondentName = body.respondentName?.trim().slice(0, MAX_NAME_LENGTH) || null;

  let result: SubmissionResult;
  try {
    result = scoreSubmission(found.quiz, body.answers);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "invalid answers" }, 400);
  }

  const { count } = (await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM submissions WHERE round_id = ?",
  )
    .bind(found.row.id)
    .first<{ count: number }>())!;
  if (count >= MAX_SUBMISSIONS_PER_ROUND) {
    return c.json({ error: "this round is full" }, 409);
  }

  const id = nanoid(12);
  await c.env.DB.prepare(
    "INSERT INTO submissions (id, round_id, respondent_name, is_self, answers, result, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)",
  )
    .bind(
      id,
      found.row.id,
      respondentName,
      JSON.stringify(body.answers),
      JSON.stringify(result),
      Date.now(),
    )
    .run();

  return c.json({ id, result }, 201);
});

app.get("/rounds/owner/:ownerToken", async (c) => {
  const found = await roundByToken(c.env.DB, "owner_token", c.req.param("ownerToken"));
  if (!found) return c.json({ error: "round not found" }, 404);

  const { results } = await c.env.DB.prepare(
    "SELECT id, respondent_name, is_self, answers, result, created_at FROM submissions WHERE round_id = ? ORDER BY created_at ASC",
  )
    .bind(found.row.id)
    .all<{
      id: string;
      respondent_name: string | null;
      is_self: number;
      answers: string;
      result: string;
      created_at: number;
    }>();

  const submissions: SubmissionView[] = results.map((s) => ({
    id: s.id,
    respondentName: s.respondent_name,
    isSelf: s.is_self === 1,
    createdAt: s.created_at,
    answers: JSON.parse(s.answers),
    // normalizeResult upgrades results stored by M1 (no `kind` field).
    result: normalizeResult(JSON.parse(s.result)),
  }));

  const view: OwnerView = {
    round: {
      id: found.row.id,
      subjectName: found.row.subject_name,
      status: found.row.status,
      createdAt: found.row.created_at,
      shareToken: found.row.share_token,
    },
    quiz: {
      title: found.quiz.title,
      description: found.quiz.description,
      attribution: found.quiz.attribution,
      definition: found.quiz,
    },
    submissions,
    aggregate: aggregateRound(found.quiz, submissions),
  };
  return c.json(view);
});

app.patch("/rounds/owner/:ownerToken", async (c) => {
  const found = await roundByToken(c.env.DB, "owner_token", c.req.param("ownerToken"));
  if (!found) return c.json({ error: "round not found" }, 404);
  const body = await c.req.json<{ status?: string }>().catch(() => null);
  if (body?.status !== "open" && body?.status !== "closed") {
    return c.json({ error: "status must be 'open' or 'closed'" }, 400);
  }
  await c.env.DB.prepare("UPDATE rounds SET status = ? WHERE id = ?")
    .bind(body.status, found.row.id)
    .run();
  return c.json({ status: body.status });
});

app.delete("/rounds/owner/:ownerToken/submissions/:id", async (c) => {
  const found = await roundByToken(c.env.DB, "owner_token", c.req.param("ownerToken"));
  if (!found) return c.json({ error: "round not found" }, 404);
  const { meta } = await c.env.DB.prepare(
    "DELETE FROM submissions WHERE id = ? AND round_id = ?",
  )
    .bind(c.req.param("id"), found.row.id)
    .run();
  if (meta.changes === 0) return c.json({ error: "submission not found" }, 404);
  return c.json({ deleted: true });
});

// --- Social link previews (Open Graph) ---
//
// The app is a client-rendered SPA, so crawlers (WhatsApp, iMessage, Slack,
// Twitter…) that don't run JS would otherwise only see the generic index.html
// meta tags. For share and quiz links we inject per-link OG tags into the
// SPA shell so the preview names the subject and describes the quiz.

const substName = (text: string, name: string) => text.replaceAll("{name}", name);

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface LinkMeta {
  pageTitle: string;
  description: string;
  image: string;
  url: string;
}

async function shareMeta(db: D1Database, token: string, origin: string): Promise<LinkMeta | null> {
  const found = await roundByToken(db, "share_token", token);
  if (!found) return null;
  const subject = found.row.subject_name;
  const quizTitle = substName(found.quiz.title, subject);
  const description = found.quiz.description
    ? substName(found.quiz.description, subject)
    : `${subject}'s friends are saying how they really see ${subject}. Answer "${quizTitle}" and add your take.`;
  return {
    pageTitle: `How well do you know ${subject}?`,
    description,
    image: `${origin}/og-image.png`,
    url: `${origin}/s/${token}`,
  };
}

async function quizMeta(db: D1Database, id: string, origin: string): Promise<LinkMeta | null> {
  const row = await db
    .prepare("SELECT definition FROM quizzes WHERE id = ?")
    .bind(id)
    .first<{ definition: string }>();
  if (!row) return null;
  const quiz = parseQuizDefinition(JSON.parse(row.definition));
  const title = substName(quiz.title, "your friend");
  const description = quiz.description
    ? substName(quiz.description, "your friend")
    : `Start a round of "${title}" — your friends answer about you, and you see how they really see you.`;
  return { pageTitle: title, description, image: `${origin}/og-image.png`, url: `${origin}/q/${id}` };
}

async function renderShellWithMeta(
  request: Request,
  env: WorkerEnv,
  meta: LinkMeta | null,
): Promise<Response> {
  const shell = await env.ASSETS.fetch(new URL("/index.html", request.url));
  if (!meta) return shell;

  const tags =
    `<meta property="og:title" content="${escapeAttr(meta.pageTitle)}">` +
    `<meta property="og:description" content="${escapeAttr(meta.description)}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:url" content="${escapeAttr(meta.url)}">` +
    `<meta property="og:image" content="${escapeAttr(meta.image)}">` +
    `<meta property="og:image:width" content="1200">` +
    `<meta property="og:image:height" content="630">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:title" content="${escapeAttr(meta.pageTitle)}">` +
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}">` +
    `<meta name="twitter:image" content="${escapeAttr(meta.image)}">`;

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(meta.pageTitle);
      },
    })
    .on("head", {
      element(el) {
        el.append(tags, { html: true });
      },
    })
    .transform(shell);
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }

    // Inject link-preview metadata for share and quiz permalinks.
    if (request.method === "GET") {
      const share = url.pathname.match(/^\/s\/([^/]+)\/?$/);
      if (share) {
        return renderShellWithMeta(request, env, await shareMeta(env.DB, share[1], url.origin));
      }
      const quiz = url.pathname.match(/^\/q\/([^/]+)\/?$/);
      if (quiz) {
        return renderShellWithMeta(request, env, await quizMeta(env.DB, quiz[1], url.origin));
      }
    }

    return env.ASSETS.fetch(request);
  },
};
