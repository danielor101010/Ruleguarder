import { useMemo, useState } from "react";
import DocumentsPanel from "./components/DocumentsPanel";
import ReportView from "./components/ReportView";
import RulesPanel from "./components/RulesPanel";
import TopBar from "./components/TopBar";
import EmptyState from "./components/EmptyState";
import { ErrorNote, Panel } from "./components/ui";
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
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-zinc-200 lg:h-screen">
      <TopBar documentName={report.document?.filename ?? null} counts={counts} />
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[23rem_minmax(0,1fr)]">
        {/* On small screens the main area (upload / report) comes first */}
        <aside className="order-2 flex flex-col gap-4 lg:order-none lg:min-h-0 lg:overflow-y-auto" aria-label="Rules and documents">
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

        <main className="order-1 flex min-w-0 flex-col gap-4 lg:order-none lg:min-h-0">
          {report.error && <ErrorNote>{report.error}</ErrorNote>}
          {report.document ? (
            <ReportView
              key={`${report.document.id}-${report.checkedAt ?? "unchecked"}`}
              document={report.document}
              violations={report.violations}
              failedRules={report.failedRules}
              checking={report.checking}
              checkedAt={report.checkedAt}
              aiRulesEnabled={aiRulesEnabled}
              onCheck={report.runCheck}
            />
          ) : (
            report.loading ? (
              <Panel className="flex flex-1 items-center justify-center p-8">
                <p role="status" className="text-sm text-zinc-500">
                  Loading document…
                </p>
              </Panel>
            ) : (
              <EmptyState
                documents={docs.documents}
                rulesEnabled={rules.rules.filter((r) => r.enabled).length}
                uploading={docs.uploading}
                onUpload={upload}
                onSelect={setSelectedId}
              />
            )
          )}
        </main>
      </div>
    </div>
  );
}
