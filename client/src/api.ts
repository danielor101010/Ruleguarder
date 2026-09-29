import type {
  DocumentFull,
  DocumentSummary,
  Report,
  Rule,
  RuleCreate,
  RuleTemplate,
  RuleType,
  RuleUpdate,
  SampleRulesResult,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  return (await res.json()) as T;
}

async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
  await send(path, init);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * True when the server doesn't provide an endpoint at all (older server build).
 * FastAPI answers 405 instead of 404 when the path matches another route's pattern
 * (e.g. `GET /rules/templates` vs `PATCH /rules/{id}`), so both mean "not available".
 */
export function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405);
}

export const api = {
  ruleTypes: () => request<RuleType[]>("/rules/types"),
  rules: () => request<Rule[]>("/rules"),
  createRule: (rule: RuleCreate) => request<Rule>("/rules", json("POST", rule)),
  updateRule: (id: number, changes: RuleUpdate) => request<Rule>(`/rules/${id}`, json("PATCH", changes)),
  deleteRule: (id: number) => requestNoContent(`/rules/${id}`, { method: "DELETE" }),
  ruleTemplates: () => request<RuleTemplate[]>("/rules/templates"),
  loadSampleRules: () => request<SampleRulesResult>("/rules/samples", { method: "POST" }),

  documents: () => request<DocumentSummary[]>("/documents"),
  document: (id: number) => request<DocumentFull>(`/documents/${id}`),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentFull>("/documents", { method: "POST", body: form });
  },
  deleteDocument: (id: number) => requestNoContent(`/documents/${id}`, { method: "DELETE" }),
  check: (id: number) => request<Report>(`/documents/${id}/check`, json("POST", {})),
  latestReport: (id: number) => request<Report>(`/documents/${id}/report`),
};
