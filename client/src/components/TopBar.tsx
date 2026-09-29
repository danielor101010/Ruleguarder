import { cx, SEVERITY_CLASSES, SEVERITY_LABEL } from "../lib/severity";
import { SEVERITIES, type Severity } from "../types";
import { SeverityDot } from "./ui";

interface Props {
  documentName: string | null;
  /** null => no report for the selected document */
  counts: Partial<Record<Severity, number>> | null;
}

export default function TopBar({ documentName, counts }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-white/10 bg-slate-950/60 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-bold tracking-tight text-white">Ruleguarder</h1>
        <span className="hidden text-sm text-slate-300 sm:inline">Check Word documents against your rules</span>
      </div>
      {documentName && (
        <p className="min-w-0 flex-1 truncate text-sm text-slate-200" dir="auto" title={documentName}>
          <span className="text-slate-400">Document: </span>
          {documentName}
        </p>
      )}
      {counts && (
        <ul className="ml-auto flex items-center gap-2" aria-label="Violations by severity">
          {SEVERITIES.map((s) => (
            <li
              key={s}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                SEVERITY_CLASSES[s].counter,
              )}
            >
              <SeverityDot severity={s} />
              {SEVERITY_LABEL[s]} <span className="tabular-nums">{counts[s] ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
