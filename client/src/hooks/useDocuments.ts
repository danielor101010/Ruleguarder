import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../lib/errors";
import type { DocumentFull, DocumentSummary } from "../types";

export interface DocumentsState {
  documents: DocumentSummary[];
  loading: boolean;
  uploading: boolean;
  error: string | null;
}

/** Uploaded documents: list, upload and delete. Failures are reported through `error`. */
export function useDocuments() {
  const [state, setState] = useState<DocumentsState>({ documents: [], loading: true, uploading: false, error: null });

  useEffect(() => {
    let cancelled = false;
    api
      .documents()
      .then((documents) => !cancelled && setState((s) => ({ ...s, documents, loading: false })))
      .catch((err: unknown) => !cancelled && setState((s) => ({ ...s, loading: false, error: errorMessage(err) })));
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const documents = await api.documents();
      setState((s) => ({ ...s, documents, error: null }));
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }));
    }
  }, []);

  /** Resolves to the uploaded document, or null when the upload failed. */
  const upload = useCallback(
    async (file: File): Promise<DocumentFull | null> => {
      setState((s) => ({ ...s, uploading: true, error: null }));
      try {
        const doc = await api.uploadDocument(file);
        setState((s) => ({ ...s, uploading: false }));
        await reload();
        return doc;
      } catch (err) {
        setState((s) => ({ ...s, uploading: false, error: errorMessage(err) }));
        return null;
      }
    },
    [reload],
  );

  /** Resolves to true when the document was deleted. */
  const remove = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await api.deleteDocument(id);
        await reload();
        return true;
      } catch (err) {
        setState((s) => ({ ...s, error: errorMessage(err) }));
        return false;
      }
    },
    [reload],
  );

  return { ...state, reload, upload, remove };
}
