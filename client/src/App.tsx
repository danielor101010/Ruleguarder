import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import DocumentsPanel from "./components/DocumentsPanel";
import ReportView from "./components/ReportView";
import RulesPanel from "./components/RulesPanel";
import type { DocumentFull, DocumentSummary, Rule, Violation } from "./types";

export default function App() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [document, setDocument] = useState<DocumentFull | null>(null);
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(() => api.rules().then(setRules).catch((e) => setError(e.message)), []);
  const loadDocuments = useCallback(() => api.documents().then(setDocuments).catch((e) => setError(e.message)), []);

  useEffect(() => {
    loadRules();
    loadDocuments();
  }, [loadRules, loadDocuments]);

  useEffect(() => {
    setDocument(null);
    setViolations(null);
    setCheckedAt(null);
    setError(null);
    if (selectedId === null) return;

    let cancelled = false;
    api
      .latestReport(selectedId)
      .then((report) => {
        if (cancelled) return;
        setDocument(report.document);
        setViolations(report.violations);
        setCheckedAt(report.checked_at);
      })
      .catch(async (err) => {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        const doc = await api.document(selectedId);
        if (!cancelled) setDocument(doc);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function runCheck() {
    if (selectedId === null) return;
    setChecking(true);
    setError(null);
    try {
      const report = await api.check(selectedId);
      setDocument(report.document);
      setViolations(report.violations);
      setCheckedAt(report.checked_at);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Ruleguarder</h1>
        <span className="muted">Check Word documents against your rules</span>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <RulesPanel rules={rules} onChange={loadRules} />
          <DocumentsPanel
            documents={documents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={loadDocuments}
          />
        </aside>
        <main className="main">
          {error && <p className="error banner">{error}</p>}
          {document ? (
            <ReportView
              document={document}
              violations={violations}
              checking={checking}
              checkedAt={checkedAt}
              onCheck={runCheck}
            />
          ) : (
            <div className="empty">
              <p>1. Create rules on the left (e.g. “no numeric figures that reveal system performance”).</p>
              <p>2. Upload a .docx document.</p>
              <p>3. Click “Check document” to see every violation and where it is.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
