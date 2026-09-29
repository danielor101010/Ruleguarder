import { useRef } from "react";
import { cx } from "../lib/severity";
import type { DocumentSummary } from "../types";
import { Button, ErrorNote, GlassPanel } from "./ui";

interface Props {
  documents: DocumentSummary[];
  selectedId: number | null;
  loading: boolean;
  uploading: boolean;
  error: string | null;
  onSelect: (id: number) => void;
  onUpload: (file: File) => void;
  onDelete: (doc: DocumentSummary) => void;
}

const DOCX_ACCEPT = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function DocumentsPanel({
  documents,
  selectedId,
  loading,
  uploading,
  error,
  onSelect,
  onUpload,
  onDelete,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <GlassPanel className="flex flex-col gap-3 p-5" aria-labelledby="documents-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="documents-heading" className="text-base font-semibold text-slate-900">
          Documents
        </h2>
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload .docx"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={DOCX_ACCEPT}
          hidden
          aria-label="Upload .docx file"
          data-testid="upload-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onUpload(file);
          }}
        />
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && <p className="text-sm text-slate-600">Loading documents…</p>}
      {!loading && !documents.length && <p className="text-sm text-slate-600">No documents uploaded yet.</p>}
      <ul className="flex flex-col gap-1" aria-label="Documents list">
        {documents.map((doc) => {
          const selected = doc.id === selectedId;
          return (
            <li
              key={doc.id}
              className={cx(
                "flex items-center gap-2 rounded-2xl pr-2",
                selected ? "bg-white text-slate-900 shadow-sm ring-2 ring-slate-900" : "text-slate-900 hover:bg-white/60",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 rounded-2xl px-3 py-2 text-left"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(doc.id)}
              >
                <span className="block truncate text-sm font-medium" dir="auto" title={doc.filename}>
                  {doc.filename}
                </span>
                <span className="block text-xs text-slate-600">
                  {(doc.size_bytes / 1024).toFixed(0)} KB · {new Date(doc.uploaded_at).toLocaleString()}
                </span>
              </button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(doc)}
                aria-label={`Delete ${doc.filename}`}
              >
                Delete
              </Button>
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
