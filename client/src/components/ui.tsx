import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx, SEVERITY_CLASSES, SEVERITY_LABEL } from "../lib/severity";
import type { Severity } from "../types";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // Dark pill (#0F172A) — the primary action
  primary: "bg-accent text-white shadow-sm hover:bg-accent-hover",
  secondary: "border border-slate-300 bg-white/80 text-slate-800 hover:bg-white",
  ghost: "text-slate-700 hover:bg-slate-900/5",
  danger: "text-red-700 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Frosted-glass content surface. */
export function GlassPanel({
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  as?: "section" | "div" | "article" | "aside";
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <Tag
      className={cx(
        "rounded-3xl border border-white/40 bg-white/70 text-slate-900 shadow-xl shadow-slate-950/20 backdrop-blur-md",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block size-2.5 shrink-0 rounded-full", SEVERITY_CLASSES[severity].dot)}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
      <SeverityDot severity={severity} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/** Marks rules that run through the LLM and therefore spend AI quota. */
export function AiQuotaBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-[0.7rem] font-semibold text-violet-800 ring-1 ring-violet-300"
      title="Checked by the AI model: every check with this rule enabled uses AI quota"
    >
      AI · uses quota
    </span>
  );
}

export function ErrorNote({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-1.5 text-red-700 hover:bg-red-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-sky-500";
