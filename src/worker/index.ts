import { Hono } from "hono";
import { nanoid } from "nanoid";
import { aggregateRound, scoreSubmission } from "../shared/scoring";
import { TEMPLATES } from "../shared/templates/mbti";
import type {
  Answers,
  CreateRoundResponse,
  OwnerView,
  QuizDefinition,
  ShareView,
  SubmissionResult,
  SubmissionView,
  TemplateInfo,
} from "../shared/types";

const MAX_SUBMISSIONS_PER_ROUND = 200;
const MAX_NAME_LENGTH = 60;

type Env = { Bindings: { DB: D1Database } };

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

app.post("/rounds", async (c) => {
  const body = await c.req.json<{ templateId?: string; subjectName?: string }>().catch(() => null);
  const subjectName = body?.subjectName?.trim();
  if (!subjectName || subjectName.length > MAX_NAME_LENGTH) {
    return c.json({ error: `subjectName is required (max ${MAX_NAME_LENGTH} chars)` }, 400);
  }
  const template = TEMPLATES.find((t) => t.id === body?.templateId);
  if (!template) return c.json({ error: "unknown templateId" }, 400);

  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO quizzes (id, title, source, definition, created_at) VALUES (?, ?, 'template', ?, ?)",
  )
    .bind(template.id, template.quiz.title, JSON.stringify(template.quiz), now)
    .run();

  const response: CreateRoundResponse = {
    roundId: nanoid(12),
    subjectName,
    ownerToken: nanoid(24),
    shareToken: nanoid(24),
  };
  await c.env.DB.prepare(
    "INSERT INTO rounds (id, quiz_id, subject_name, owner_token, share_token, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)",
  )
    .bind(response.roundId, template.id, subjectName, response.ownerToken, response.shareToken, now)
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
  return { row, quiz: JSON.parse(row.definition) as QuizDefinition };
}

app.get("/rounds/share/:shareToken", async (c) => {
  const found = await roundByToken(c.env.DB, "share_token", c.req.param("shareToken"));
  if (!found) return c.json({ error: "round not found" }, 404);
  const view: ShareView = {
    subjectName: found.row.subject_name,
    status: found.row.status,
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
    result: JSON.parse(s.result),
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

export default app;
