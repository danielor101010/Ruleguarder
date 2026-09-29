import { useRef, useState } from "react";
import { api } from "../api";
import type { DocumentSummary } from "../types";

interface Props {
  documents: DocumentSummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onChange: () => void;
}

export default function DocumentsPanel({ documents, selectedId, onSelect, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const doc = await api.uploadDocument(file);
      onChange();
      onSelect(doc.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(doc: DocumentSummary) {
    await api.deleteDocument(doc.id);
    if (doc.id === selectedId) onSelect(null);
    onChange();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Documents</h2>
        <button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload .docx"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </div>
      {error && <p className="error">{error}</p>}
      {!documents.length && <p className="muted">No documents uploaded yet.</p>}
      <ul className="list">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className={`clickable ${doc.id === selectedId ? "selected" : ""}`}
            onClick={() => onSelect(doc.id)}
          >
            <div className="grow">
              <div dir="auto">{doc.filename}</div>
              <div className="muted small">
                {(doc.size_bytes / 1024).toFixed(0)} KB · {new Date(doc.uploaded_at).toLocaleString()}
              </div>
            </div>
            <button
              className="link danger"
              onClick={(e) => {
                e.stopPropagation();
                remove(doc);
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
