import { useRef } from "react";
import { DOCX_ACCEPT, formatSize } from "../lib/documents";
import { cx } from "../lib/severity";
import type { DocumentSummary } from "../types";
import { Button, DeleteButton, ErrorNote, Icon, Panel, PanelHeader } from "./ui";

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
    <Panel className="flex flex-col gap-4 p-4" aria-labelledby="documents-heading">
      <PanelHeader id="documents-heading" title="Documents" count={documents.length}>
        <Button size="sm" icon="upload" onClick={() => inputRef.current?.click()} disabled={uploading}>
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
      </PanelHeader>
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && <p className="text-sm text-slate-400">Loading documents…</p>}
      {!loading && !documents.length && (
        <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-400">
          No documents uploaded yet.
        </p>
      )}
      <ul className="flex flex-col gap-2" aria-label="Documents list">
        {documents.map((doc) => {
          const selected = doc.id === selectedId;
          return (
            <li
              key={doc.id}
              className={cx(
                "flex items-center gap-2 rounded-xl border pr-2 transition-colors",
                selected
                  ? "border-indigo-400/60 bg-indigo-500/15"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pl-3 text-left"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(doc.id)}
              >
                <Icon name="document" className={cx("size-5 shrink-0", selected ? "text-indigo-300" : "text-slate-500")} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white" dir="auto" title={doc.filename}>
                    {doc.filename}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {formatSize(doc.size_bytes)} · {new Date(doc.uploaded_at).toLocaleString()}
                  </span>
                </span>
              </button>
              <DeleteButton compact name={doc.filename} onConfirm={() => onDelete(doc)} />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
