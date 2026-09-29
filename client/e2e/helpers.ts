import { expect, type APIRequestContext } from "@playwright/test";

interface ApiRule {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

interface ApiDocument {
  id: number;
  filename: string;
}

/**
 * Hard safety stop before any "Check document" click: the check runs every enabled rule,
 * and an enabled `llm` rule would call the real Gemini API and spend quota.
 */
export async function assertNoEnabledLlmRules(request: APIRequestContext): Promise<void> {
  const res = await request.get("/api/rules");
  expect(res.ok()).toBe(true);
  const rules = (await res.json()) as ApiRule[];
  const llm = rules.filter((r) => r.type === "llm" && r.enabled).map((r) => r.name);
  expect(llm, "enabled llm rules would call the real LLM API; refusing to run a check").toEqual([]);
}

/** Deletes the rules and documents a test created (matched by its unique marker). */
export async function cleanUp(request: APIRequestContext, marker: string): Promise<void> {
  const rules = (await (await request.get("/api/rules")).json()) as ApiRule[];
  for (const r of rules.filter((r) => r.name.includes(marker))) await request.delete(`/api/rules/${r.id}`);
  const docs = (await (await request.get("/api/documents")).json()) as ApiDocument[];
  for (const d of docs.filter((d) => d.filename.includes(marker))) await request.delete(`/api/documents/${d.id}`);
}

/** Unique, regex-safe token per test, e.g. "RGE2EM1ABC2". */
export function uniqueMarker(): string {
  return `RGE2E${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
}

/** The template endpoints are built on another branch; an older server answers 404 (or 405, see api.ts). */
export async function templatesAvailable(request: APIRequestContext): Promise<{ ok: boolean; status: number }> {
  const res = await request.get("/api/rules/templates");
  return { ok: res.ok(), status: res.status() };
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Match text literally inside a RegExp (template labels contain parentheses, e.g. "(PII)"). */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\]/g, "\$&");
}
