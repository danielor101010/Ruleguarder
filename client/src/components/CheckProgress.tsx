import type { CheckStatus } from "../types";
import { Button } from "./ui";

interface Props {
  progress: CheckStatus;
  onCancel: () => void;
}

/** Progress bar for a running background check, with a cancel button. */
export default function CheckProgress({ progress, onCancel }: Props) {
  const { progress_done: done, progress_total: total } = progress;
  const known = total > 0;
  const percent = known ? Math.round((Math.min(done, total) / total) * 100) : 0;
  const label = progress.status === "queued" ? "Waiting to start…" : (progress.step ?? "Starting…");

  return (
    <div className="flex w-full flex-col gap-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-zinc-900">
          Checking… <span className="text-zinc-500">{label}</span>
        </span>
        <span className="flex items-center gap-3">
          {known && (
            <span className="text-xs text-zinc-500 tabular-nums">
              {done} / {total}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Check progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? percent : undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200"
      >
        {known ? (
          <div className="h-full rounded-full bg-zinc-900 transition-[width] duration-500" style={{ width: `${percent}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-zinc-400" />
        )}
      </div>
    </div>
  );
}
