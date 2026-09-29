import { SEVERITY_LABEL } from "../lib/severity";
import { SEVERITIES, type Severity } from "../types";
import { Icon } from "./ui";

interface Props {
  documentName: string | null;
  /** null => no report for the selected document */
  counts: Partial<Record<Severity, number>> | null;
}

export default function TopBar({ documentName, counts }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2">
        <Icon name="shield" className="size-6 text-zinc-900" />
        <h1 className="text-lg font-bold tracking-tight text-zinc-900">Ruleguarder</h1>
      </div>
      {documentName && (
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-600" title={documentName}>
          <Icon name="document" className="size-4 shrink-0 text-zinc-400" />
          <span className="truncate" dir="auto">
            {documentName}
          </span>
        </p>
      )}
      {counts && (
        <ul className="ml-auto flex items-center gap-5" aria-label="Violations by severity">
          {SEVERITIES.map((s) => (
            <li key={s} className="inline-flex items-baseline gap-1.5 text-sm text-zinc-500">
              {SEVERITY_LABEL[s]} <span className="font-semibold text-zinc-900 tabular-nums">{counts[s] ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
