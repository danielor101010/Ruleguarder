import type { DocumentFull, DocumentSummary, Report, Rule, RuleInput, RuleType } from "./types";

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

export const api = {
  ruleTypes: () => request<RuleType[]>("/rules/types"),
  rules: () => request<Rule[]>("/rules"),
  createRule: (rule: RuleInput) => request<Rule>("/rules", json("POST", rule)),
  updateRule: (id: number, changes: Partial<RuleInput>) => request<Rule>(`/rules/${id}`, json("PATCH", changes)),
  deleteRule: (id: number) => requestNoContent(`/rules/${id}`, { method: "DELETE" }),

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
