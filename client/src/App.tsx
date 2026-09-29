import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import DocumentsPanel from "./components/DocumentsPanel";
import ReportView from "./components/ReportView";
import RulesPanel from "./components/RulesPanel";
import { errorMessage, useDocumentReport } from "./hooks/useDocumentReport";
import type { DocumentSummary, Rule } from "./types";

export default function App() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const report = useDocumentReport(selectedId);

  const loadRules = useCallback(
    () => api.rules().then(setRules).catch((e: unknown) => setListError(errorMessage(e))),
    [],
  );
  const loadDocuments = useCallback(
    () => api.documents().then(setDocuments).catch((e: unknown) => setListError(errorMessage(e))),
    [],
  );

  useEffect(() => {
    void loadRules();
    void loadDocuments();
  }, [loadRules, loadDocuments]);

  const error = report.error ?? listError;

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
          {report.document ? (
            <ReportView
              key={`${report.document.id}-${report.checkedAt ?? "unchecked"}`}
              document={report.document}
              violations={report.violations}
              checking={report.checking}
              checkedAt={report.checkedAt}
              onCheck={report.runCheck}
            />
          ) : (
            <div className="empty">
              {report.loading ? (
                <p>Loading…</p>
              ) : (
                <>
                  <p>1. Create rules on the left (e.g. “no numeric figures that reveal system performance”).</p>
                  <p>2. Upload a .docx document.</p>
                  <p>3. Click “Check document” to see every violation and where it is.</p>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
