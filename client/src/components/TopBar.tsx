import { cx, SEVERITY_CLASSES, SEVERITY_LABEL } from "../lib/severity";
import { SEVERITIES, type Severity } from "../types";
import { Icon, SeverityDot } from "./ui";

interface Props {
  documentName: string | null;
  /** null => no report for the selected document */
  counts: Partial<Record<Severity, number>> | null;
}

export default function TopBar({ documentName, counts }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-800 bg-slate-900 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
          <Icon name="shield" className="size-5" />
        </span>
        <h1 className="text-lg font-bold tracking-tight text-white">Ruleguarder</h1>
      </div>
      {documentName && (
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-200" title={documentName}>
          <Icon name="document" className="size-4 shrink-0 text-slate-500" />
          <span className="truncate" dir="auto">
            {documentName}
          </span>
        </p>
      )}
      {counts && (
        <ul className="ml-auto flex items-center gap-5" aria-label="Violations by severity">
          {SEVERITIES.map((s) => (
            <li key={s} className={cx("inline-flex items-center gap-2 text-sm font-medium", SEVERITY_CLASSES[s].text)}>
              <SeverityDot severity={s} />
              {SEVERITY_LABEL[s]} <span className="font-semibold text-white tabular-nums">{counts[s] ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
