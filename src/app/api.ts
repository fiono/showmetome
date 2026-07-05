import type {
  Answers,
  CreateRoundResponse,
  OwnerView,
  QuizDefinition,
  QuizInfo,
  ShareView,
  SubmissionResult,
  TemplateInfo,
} from "../shared/types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  templates: () => request<TemplateInfo[]>("/api/templates"),

  createRound: (from: { templateId?: string; quizId?: string }, subjectName: string) =>
    request<CreateRoundResponse>("/api/rounds", {
      method: "POST",
      body: JSON.stringify({ ...from, subjectName }),
    }),

  saveQuiz: (definition: QuizDefinition) =>
    request<QuizInfo>("/api/quizzes", {
      method: "POST",
      body: JSON.stringify({ definition }),
    }),

  quizInfo: (quizId: string) => request<QuizInfo>(`/api/quizzes/${quizId}`),

  shareView: (shareToken: string) => request<ShareView>(`/api/rounds/share/${shareToken}`),

  submit: (shareToken: string, respondentName: string, answers: Answers) =>
    request<{ id: string; result: SubmissionResult }>(
      `/api/rounds/share/${shareToken}/submissions`,
      { method: "POST", body: JSON.stringify({ respondentName, answers }) },
    ),

  ownerView: (ownerToken: string) => request<OwnerView>(`/api/rounds/owner/${ownerToken}`),

  setStatus: (ownerToken: string, status: "open" | "closed") =>
    request<{ status: string }>(`/api/rounds/owner/${ownerToken}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  deleteSubmission: (ownerToken: string, submissionId: string) =>
    request<{ deleted: boolean }>(`/api/rounds/owner/${ownerToken}/submissions/${submissionId}`, {
      method: "DELETE",
    }),
};
