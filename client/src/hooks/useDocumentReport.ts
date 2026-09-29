import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { errorMessage } from "../lib/errors";
import type { DocumentFull, FailedRule, Report, Violation } from "../types";

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
  checking: boolean;
  error: string | null;
}

const EMPTY: Omit<DocumentReportState, "documentId"> = {
  document: null,
  violations: null,
  failedRules: [],
  checkedAt: null,
  loading: false,
  checking: false,
  error: null,
};

/** Loads the latest report for a document (or the bare document if never checked) and runs checks. */
export function useDocumentReport(documentId: number | null) {
  const [state, setState] = useState<DocumentReportState>({ ...EMPTY, documentId: null });

  // Reset during render when the selection changes (avoids setState inside an effect)
  if (state.documentId !== documentId) {
    setState({ ...EMPTY, documentId, loading: documentId !== null });
  }

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

  const runCheck = useCallback(async () => {
    if (documentId === null) return;
    // A check can take minutes; if another document was selected meanwhile, its result is dropped
    const forThisDocument = (update: (s: DocumentReportState) => DocumentReportState) =>
      setState((s) => (s.documentId === documentId ? update(s) : s));

    forThisDocument((s) => ({ ...s, checking: true, error: null }));
    try {
      const report = await api.check(documentId);
      forThisDocument(() => ({ ...EMPTY, ...fromReport(report), documentId }));
    } catch (err) {
      forThisDocument((s) => ({ ...s, checking: false, error: errorMessage(err) }));
    }
  }, [documentId]);

  return { ...state, runCheck };
}

function fromReport(report: Report): Partial<DocumentReportState> {
  return {
    document: report.document,
    violations: report.violations,
    failedRules: report.summary.failed_rules ?? [],
    checkedAt: report.checked_at,
  };
}

async function load(documentId: number): Promise<Partial<DocumentReportState>> {
  try {
    return fromReport(await api.latestReport(documentId));
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
    return { document: await api.document(documentId) };
  }
}
