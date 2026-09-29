import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { errorMessage } from "../lib/errors";
import { ACTIVE_CHECK_STATES, type CheckStatus, type DocumentFull, type FailedRule, type Report, type Violation } from "../types";

export interface DocumentReportState {
  /** The document this state belongs to; results for any other document are ignored. */
  documentId: number | null;
  document: DocumentFull | null;
  /** null => document not checked yet */
  violations: Violation[] | null;
  /** Rules the last check could not run (the report is incomplete without them). */
  failedRules: FailedRule[];
  checkedAt: string | null;
  loading: boolean;
  /** The background check in progress (queued/running), or null. */
  progress: CheckStatus | null;
  /** A short outcome message, e.g. "Check cancelled." */
  notice: string | null;
  error: string | null;
}

/** How often a running check is polled. */
export const POLL_MS = 1000;

const EMPTY: Omit<DocumentReportState, "documentId"> = {
  document: null,
  violations: null,
  failedRules: [],
  checkedAt: null,
  loading: false,
  progress: null,
  notice: null,
  error: null,
};

const isActive = (c: CheckStatus | null): boolean => c !== null && ACTIVE_CHECK_STATES.includes(c.status);

/**
 * Loads a document's latest report (or the bare document if never checked), runs checks in the
 * background with progress, and reconnects to a check that is still running after a reload.
 */
export function useDocumentReport(documentId: number | null) {
  const [state, setState] = useState<DocumentReportState>({ ...EMPTY, documentId: null });

  // Reset during render when the selection changes (avoids setState inside an effect)
  if (state.documentId !== documentId) {
    setState({ ...EMPTY, documentId, loading: documentId !== null });
  }

  /** Apply an update only if the user is still looking at this document. */
  const forDocument = useCallback(
    (id: number, update: (s: DocumentReportState) => DocumentReportState) =>
      setState((s) => (s.documentId === id ? update(s) : s)),
    [],
  );

  useEffect(() => {
    if (documentId === null) return;
    let cancelled = false;
    load(documentId)
      .then((next) => !cancelled && setState({ ...EMPTY, ...next, documentId }))
      .catch((err: unknown) => !cancelled && setState({ ...EMPTY, documentId, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Poll the active check until it finishes, then show its outcome
  const activeCheckId = state.progress && isActive(state.progress) ? state.progress.check_id : null;
  useEffect(() => {
    if (documentId === null || activeCheckId === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const status = await api.getCheck(activeCheckId);
        if (stopped) return;
        if (isActive(status)) {
          forDocument(documentId, (s) => ({ ...s, progress: status }));
          timer = setTimeout(tick, POLL_MS);
          return;
        }
        const outcome = await finished(documentId, status);
        if (!stopped) forDocument(documentId, (s) => ({ ...s, ...outcome, progress: null }));
      } catch (err) {
        if (!stopped) forDocument(documentId, (s) => ({ ...s, progress: null, error: errorMessage(err) }));
      }
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [documentId, activeCheckId, forDocument]);

  const runCheck = useCallback(async () => {
    if (documentId === null) return;
    forDocument(documentId, (s) => ({ ...s, error: null, notice: null }));
    try {
      const status = await api.startCheck(documentId);
      forDocument(documentId, (s) => ({ ...s, progress: status }));
    } catch (err) {
      forDocument(documentId, (s) => ({ ...s, error: errorMessage(err) }));
    }
  }, [documentId, forDocument]);

  const cancelCheck = useCallback(async () => {
    if (documentId === null || activeCheckId === null) return;
    try {
      const status = await api.cancelCheck(activeCheckId);
      if (!isActive(status)) forDocument(documentId, (s) => ({ ...s, progress: null, notice: "Check cancelled." }));
    } catch (err) {
      forDocument(documentId, (s) => ({ ...s, error: errorMessage(err) }));
    }
  }, [documentId, activeCheckId, forDocument]);

  return { ...state, checking: isActive(state.progress), runCheck, cancelCheck };
}

function fromReport(report: Report): Partial<DocumentReportState> {
  return {
    document: report.document,
    violations: report.violations,
    failedRules: report.summary.failed_rules ?? [],
    checkedAt: report.checked_at,
  };
}

/** The state change for a check that just stopped. */
async function finished(documentId: number, status: CheckStatus): Promise<Partial<DocumentReportState>> {
  if (status.status === "completed") return { ...fromReport(await api.latestReport(documentId)), error: null };
  if (status.status === "cancelled") return { notice: "Check cancelled." };
  return { error: status.error ?? "The check failed." };
}

async function load(documentId: number): Promise<Partial<DocumentReportState>> {
  const [report, latest] = await Promise.all([
    api.latestReport(documentId).catch(notFoundAsNull),
    api.latestCheck(documentId).catch(notFoundAsNull),
  ]);
  const base = report ? fromReport(report) : { document: await api.document(documentId) };
  if (latest && isActive(latest)) return { ...base, progress: latest };
  // The newest check failed after the last good report: say so, since the report shown is older
  if (latest?.status === "failed" && (!report || latest.check_id > report.check_id)) {
    return { ...base, error: `The last check failed: ${latest.error ?? "unknown error"}` };
  }
  return base;
}

function notFoundAsNull(err: unknown): null {
  if (err instanceof ApiError && err.status === 404) return null;
  throw err;
}
