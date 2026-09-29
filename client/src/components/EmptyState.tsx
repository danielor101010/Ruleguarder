import { useRef, useState, type DragEvent } from "react";
import { DOCX_ACCEPT, formatSize } from "../lib/documents";
import { cx } from "../lib/severity";
import type { DocumentSummary } from "../types";
import { Button, Icon, Panel } from "./ui";

interface Props {
  documents: DocumentSummary[];
  rulesEnabled: number;
  uploading: boolean;
  onUpload: (file: File) => void;
  onSelect: (id: number) => void;
}

const RECENT = 5;

/** Main area when no document is open: drop zone + recent documents. */
export default function EmptyState({ documents, rulesEnabled, uploading, onUpload, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Panel className="flex flex-1 flex-col p-4 sm:p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
            dragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-300",
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900">
            <Icon name="upload" className="size-7" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Check a Word document</h2>
            <p className="mt-1 text-sm text-zinc-500">Drop a .docx file here, or choose one from your computer.</p>
          </div>
          <Button icon="upload" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Choose .docx file"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={DOCX_ACCEPT}
            hidden
            aria-label="Choose .docx file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
          <p className="text-xs text-zinc-500">
            {rulesEnabled === 0
              ? "No rules are enabled yet: add or enable rules on the left before checking."
              : `${rulesEnabled} ${rulesEnabled === 1 ? "rule is" : "rules are"} enabled and will be checked.`}
          </p>
        </div>
      </Panel>

      {documents.length > 0 && (
        <Panel className="p-4" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="mb-3 text-base font-semibold tracking-tight text-zinc-900">
            Recent documents
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {documents.slice(0, RECENT).map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => onSelect(doc.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-zinc-400"
                >
                  <Icon name="document" className="size-5 shrink-0 text-zinc-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-900" dir="auto">
                      Open {doc.filename}
                    </span>
                    <span className="block text-xs text-zinc-500">{formatSize(doc.size_bytes)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
