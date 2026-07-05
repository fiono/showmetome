import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { TemplateInfo } from "../../shared/types";

export function Home() {
  const [templates, setTemplates] = useState<TemplateInfo[] | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.templates().then(setTemplates, (e) => setError(String(e)));
  }, []);

  const template = templates?.[0];

  async function create() {
    if (!template || !subjectName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const round = await api.createRound({ templateId: template.id }, subjectName.trim());
      navigate(`/r/${round.ownerToken}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Your friends take the quiz. You get the picture.</h2>
        <p className="small">
          Pick a quiz, but don&rsquo;t take it &mdash; send it to your friends and they answer
          every question <em>about you</em>. When the answers come in, you see the consensus,
          where they agreed, and where they absolutely did not.
        </p>
      </div>

      <div className="card">
        <h2>{template ? template.title : "Loading…"}</h2>
        {template && (
          <>
            <p className="small">{template.description}</p>
            <p className="small muted">
              {template.questionCount} quick either/or questions &middot; {template.attribution}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <label htmlFor="subject">Who is this about? (probably you)</label>
              <div className="row">
                <div style={{ flex: 1, minWidth: 200 }}>
                  <input
                    id="subject"
                    type="text"
                    placeholder="Your name, as your friends know you"
                    value={subjectName}
                    maxLength={60}
                    onChange={(e) => setSubjectName(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary" disabled={busy || !subjectName.trim()}>
                  {busy ? "Creating…" : "Create my round"}
                </button>
              </div>
            </form>
            {error && <p className="error">{error}</p>}
          </>
        )}
        {!template && error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>Or build your own quiz</h2>
        <p className="small">
          Which kitchen appliance is your friend? What&rsquo;s their love language, according
          to everyone but them? Multiple choice and 1&ndash;5 questions, scored toward
          outcomes or axes. <Link to="/build">Open the builder &rarr;</Link>
        </p>
      </div>
    </>
  );
}
