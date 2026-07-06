import type {
  ChoiceQuestion,
  Dimension,
  QuizDefinition,
  ScaleQuestion,
  SubmissionResult,
} from "./types";

const LIMITS = {
  title: 120,
  description: 2000,
  attribution: 300,
  label: 60,
  statement: 300,
  dimensions: 8,
  outcomes: 24,
  questions: 100,
  options: 8,
  weight: 100,
};

/**
 * Normalize + validate an untrusted quiz definition. Accepts the M1 shape
 * (scale sides named `pole`, no explicit scoring targets elsewhere) and
 * returns the canonical shape. Throws with all problems joined.
 */
export function parseQuizDefinition(raw: unknown): QuizDefinition {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);
  const def = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  if (def.version !== 1) err("version must be 1");
  const title = typeof def.title === "string" ? def.title.trim() : "";
  if (!title || title.length > LIMITS.title) {
    err(`title is required (max ${LIMITS.title} chars)`);
  }
  for (const [field, max] of [
    ["description", LIMITS.description],
    ["attribution", LIMITS.attribution],
  ] as const) {
    const v = def[field];
    if (v !== undefined && (typeof v !== "string" || v.length > max)) {
      err(`${field} must be a string of at most ${max} chars`);
    }
  }

  const scoring = def.scoring;
  if (scoring !== "dimensions" && scoring !== "weighted-outcomes") {
    throw new Error('scoring must be "dimensions" or "weighted-outcomes"');
  }

  // --- targets ---
  const targets = new Set<string>();
  let dimensions: Dimension[] | undefined;
  let outcomes: QuizDefinition["outcomes"];

  if (scoring === "dimensions") {
    dimensions = Array.isArray(def.dimensions) ? (def.dimensions as Dimension[]) : [];
    if (dimensions.length < 1 || dimensions.length > LIMITS.dimensions) {
      err(`dimensions mode needs 1..${LIMITS.dimensions} dimensions`);
    }
    const dimIds = new Set<string>();
    for (const d of dimensions) {
      if (!d || typeof d.id !== "string" || !d.id) {
        err("every dimension needs an id");
        continue;
      }
      if (dimIds.has(d.id)) err(`duplicate dimension id ${d.id}`);
      dimIds.add(d.id);
      const poles = Array.isArray(d.poles) ? d.poles : [];
      if (
        poles.length !== 2 ||
        poles.some((p) => typeof p !== "string" || !p || p.length > 8) ||
        poles[0] === poles[1]
      ) {
        err(`dimension ${d.id} needs two distinct short poles`);
        continue;
      }
      for (const p of poles) {
        if (targets.has(p)) err(`pole ${p} is used by more than one dimension`);
        targets.add(p);
        const label = d.labels?.[p];
        if (typeof label !== "string" || !label || label.length > LIMITS.label) {
          err(`dimension ${d.id} needs a label for pole ${p} (max ${LIMITS.label} chars)`);
        }
      }
    }
  } else {
    outcomes = Array.isArray(def.outcomes) ? (def.outcomes as QuizDefinition["outcomes"]) : [];
    if (!outcomes || outcomes.length < 2 || outcomes.length > LIMITS.outcomes) {
      err(`weighted-outcomes mode needs 2..${LIMITS.outcomes} outcomes`);
    }
    for (const o of outcomes ?? []) {
      if (!o || typeof o.id !== "string" || !o.id) {
        err("every outcome needs an id");
        continue;
      }
      if (targets.has(o.id)) err(`duplicate outcome id ${o.id}`);
      targets.add(o.id);
      if (typeof o.label !== "string" || !o.label.trim() || o.label.length > LIMITS.label) {
        err(`outcome ${o.id} needs a label (max ${LIMITS.label} chars)`);
      }
    }
  }

  // --- questions ---
  const rawQuestions = Array.isArray(def.questions) ? def.questions : [];
  if (rawQuestions.length < 1 || rawQuestions.length > LIMITS.questions) {
    err(`quiz needs 1..${LIMITS.questions} questions`);
  }
  const qIds = new Set<string>();
  const questions = rawQuestions.map((rawQ, i) => {
    const q = (typeof rawQ === "object" && rawQ !== null ? rawQ : {}) as Record<string, any>;
    const id = typeof q.id === "string" && q.id ? q.id : `q${i + 1}`;
    if (qIds.has(id)) err(`duplicate question id ${id}`);
    qIds.add(id);

    if (q.type === "choice") {
      const options = Array.isArray(q.options) ? q.options : [];
      if (typeof q.text !== "string" || !q.text.trim() || q.text.length > LIMITS.statement) {
        err(`question ${id} needs prompt text (max ${LIMITS.statement} chars)`);
      }
      if (options.length < 2 || options.length > LIMITS.options) {
        err(`question ${id} needs 2..${LIMITS.options} options`);
      }
      const optIds = new Set<string>();
      for (const [j, opt] of options.entries()) {
        const oid = typeof opt?.id === "string" && opt.id ? opt.id : String.fromCharCode(97 + j);
        if (optIds.has(oid)) err(`question ${id} has duplicate option id ${oid}`);
        optIds.add(oid);
        opt.id = oid;
        if (typeof opt?.text !== "string" || !opt.text.trim() || opt.text.length > LIMITS.statement) {
          err(`question ${id} option ${oid} needs text (max ${LIMITS.statement} chars)`);
        }
        const scores = opt?.scores;
        const entries = scores && typeof scores === "object" ? Object.entries(scores) : [];
        if (entries.length === 0) {
          err(`question ${id} option ${oid} must score at least one target`);
        }
        let positive = false;
        for (const [target, weight] of entries) {
          if (!targets.has(target)) {
            err(`question ${id} option ${oid} scores unknown target ${target}`);
          }
          if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > LIMITS.weight) {
            err(`question ${id} option ${oid} weight for ${target} must be 0..${LIMITS.weight}`);
          } else if (weight > 0) {
            positive = true;
          }
        }
        if (entries.length > 0 && !positive) {
          err(`question ${id} option ${oid} must have a weight above zero`);
        }
      }
      return { id, type: "choice", text: q.text, options } as ChoiceQuestion;
    }

    // scale (the default; M1 definitions always set type: "scale")
    const steps = q.steps;
    if (!Number.isInteger(steps) || steps < 3 || steps > 9 || steps % 2 === 0) {
      err(`question ${id} steps must be an odd integer 3..9`);
    }
    const sides = { left: { ...q.left }, right: { ...q.right } };
    for (const side of ["left", "right"] as const) {
      const s = sides[side];
      // Back-compat: sides used to hold a single target (named `pole` in M1,
      // `target` in M2); normalize to a weighted scores map.
      if (!s.scores || typeof s.scores !== "object") {
        const single = typeof s.target === "string" ? s.target : s.pole;
        if (typeof single === "string") s.scores = { [single]: 1 };
      }
      delete s.pole;
      delete s.target;
      if (typeof s.text !== "string" || !s.text.trim() || s.text.length > LIMITS.statement) {
        err(`question ${id} ${side} side needs text (max ${LIMITS.statement} chars)`);
      }
      const entries = s.scores && typeof s.scores === "object" ? Object.entries(s.scores) : [];
      if (entries.length === 0) {
        err(`question ${id} ${side} side must score at least one target`);
      }
      let positive = false;
      for (const [target, weight] of entries) {
        if (!targets.has(target)) {
          err(`question ${id} ${side} side scores unknown target ${target}`);
        }
        if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > LIMITS.weight) {
          err(`question ${id} ${side} side weight for ${target} must be 0..${LIMITS.weight}`);
        } else if (weight > 0) {
          positive = true;
        }
      }
      if (entries.length > 0 && !positive) {
        err(`question ${id} ${side} side must have a weight above zero`);
      }
    }
    return {
      id,
      type: "scale",
      ...(typeof q.dimension === "string" ? { dimension: q.dimension } : {}),
      left: sides.left,
      right: sides.right,
      steps,
    } as ScaleQuestion;
  });

  if (errors.length > 0) throw new Error(errors.join("; "));

  return {
    version: 1,
    title,
    ...(def.description ? { description: def.description as string } : {}),
    ...(def.attribution ? { attribution: def.attribution as string } : {}),
    scoring,
    ...(dimensions ? { dimensions } : {}),
    ...(outcomes ? { outcomes } : {}),
    questions,
  };
}

/** M1 stored results have no `kind`; they are always dimensions results. */
export function normalizeResult(raw: unknown): SubmissionResult {
  const r = raw as SubmissionResult & { kind?: string };
  if (!r.kind) return { ...(r as object), kind: "dimensions" } as SubmissionResult;
  return r;
}
