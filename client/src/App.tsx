import { useMemo, useState } from "react";
import DocumentsPanel from "./components/DocumentsPanel";
import ReportView from "./components/ReportView";
import RulesPanel from "./components/RulesPanel";
import TopBar from "./components/TopBar";
import { ErrorNote, GlassPanel } from "./components/ui";
import { useDocumentReport } from "./hooks/useDocumentReport";
import { useDocuments } from "./hooks/useDocuments";
import { useRules } from "./hooks/useRules";
import { useRuleTemplates } from "./hooks/useRuleTemplates";
import { countBySeverity } from "./lib/highlight";
import { usesAiQuota } from "./lib/templates";
import type { DocumentSummary } from "./types";

/** Container: wires the data hooks to the presentation components. */
export default function App() {
  const rules = useRules();
  const templates = useRuleTemplates(rules.reload);
  const docs = useDocuments();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const report = useDocumentReport(selectedId);

  const counts = useMemo(() => (report.violations ? countBySeverity(report.violations) : null), [report.violations]);
  const aiRulesEnabled = rules.rules.filter((r) => r.enabled && usesAiQuota(r)).length;

  async function upload(file: File) {
    const doc = await docs.upload(file);
    if (doc) setSelectedId(doc.id);
  }

  async function removeDocument(doc: DocumentSummary) {
    if ((await docs.remove(doc.id)) && doc.id === selectedId) setSelectedId(null);
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-hidden bg-linear-to-br from-slate-950 via-slate-900 to-navy-950 lg:h-screen">
      {/* Soft colour glows behind the glass surfaces */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/4 size-[36rem] rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-0 bottom-0 size-[32rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>
      <TopBar documentName={report.document?.filename ?? null} counts={counts} />
      <div className="relative grid flex-1 grid-cols-1 gap-4 p-4 sm:p-6 lg:min-h-0 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto" aria-label="Rules and documents">
          <RulesPanel
            rules={rules.rules}
            types={rules.types}
            loading={rules.loading}
            error={rules.error}
            onDismissError={rules.dismissError}
            onCreate={rules.createRule}
            onUpdate={rules.updateRule}
            onToggle={rules.toggleRule}
            onDelete={rules.deleteRule}
            templates={{
              templates: templates.templates,
              status: templates.status,
              error: templates.error,
              onRetry: templates.retry,
            }}
            samples={{ ...templates.samples, onLoad: templates.loadSamples, onDismiss: templates.dismissSamples }}
          />
          <DocumentsPanel
            documents={docs.documents}
            selectedId={selectedId}
            loading={docs.loading}
            uploading={docs.uploading}
            error={docs.error}
            onSelect={setSelectedId}
            onUpload={upload}
            onDelete={removeDocument}
          />
        </aside>

        <main className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          {report.error && <ErrorNote>{report.error}</ErrorNote>}
          {report.document ? (
            <ReportView
              key={`${report.document.id}-${report.checkedAt ?? "unchecked"}`}
              document={report.document}
              violations={report.violations}
              checking={report.checking}
              checkedAt={report.checkedAt}
              aiRulesEnabled={aiRulesEnabled}
              onCheck={report.runCheck}
            />
          ) : (
            <GlassPanel className="m-auto max-w-lg p-8 text-sm leading-7 text-slate-700">
              {report.loading ? (
                <p role="status">Loading…</p>
              ) : (
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Create rules on the left, pick a template, or load the sample rules.</li>
                  <li>Upload a .docx document.</li>
                  <li>Click “Check document” to see every violation and where it is.</li>
                </ol>
              )}
            </GlassPanel>
          )}
        </main>
      </div>
    </div>
  );
}
