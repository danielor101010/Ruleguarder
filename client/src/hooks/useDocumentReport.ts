import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { DocumentFull, Violation } from "../types";

export interface DocumentReportState {
  document: DocumentFull | null;
  /** null => document not checked yet */
  violations: Violation[] | null;
  checkedAt: string | null;
  loading: boolean;
  checking: boolean;
  error: string | null;
}

const EMPTY: DocumentReportState = {
  document: null,
  violations: null,
  checkedAt: null,
  loading: false,
  checking: false,
  error: null,
};

/** Loads the latest report for a document (or the bare document if never checked) and runs checks. */
export function useDocumentReport(documentId: number | null) {
  const [state, setState] = useState<DocumentReportState>(EMPTY);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  // Reset during render when the selection changes (avoids setState inside an effect)
  if (loadedId !== documentId) {
    setLoadedId(documentId);
    setState({ ...EMPTY, loading: documentId !== null });
  }

  useEffect(() => {
    if (documentId === null) return;
    let cancelled = false;
    load(documentId)
      .then((next) => !cancelled && setState({ ...EMPTY, ...next }))
      .catch((err: unknown) => !cancelled && setState({ ...EMPTY, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const runCheck = useCallback(async () => {
    if (documentId === null) return;
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const report = await api.check(documentId);
      setState({
        ...EMPTY,
        document: report.document,
        violations: report.violations,
        checkedAt: report.checked_at,
      });
    } catch (err) {
      setState((s) => ({ ...s, checking: false, error: errorMessage(err) }));
    }
  }, [documentId]);

  return { ...state, runCheck };
}

async function load(documentId: number): Promise<Partial<DocumentReportState>> {
  try {
    const report = await api.latestReport(documentId);
    return { document: report.document, violations: report.violations, checkedAt: report.checked_at };
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
    return { document: await api.document(documentId) };
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
