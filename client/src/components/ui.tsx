import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, SEVERITY_CLASSES, SEVERITY_LABEL } from "../lib/severity";
import type { Severity } from "../types";

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-indigo-500 text-white shadow-md shadow-indigo-950/40 hover:bg-indigo-400 active:bg-indigo-600",
  secondary: "border border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700",
  ghost: "text-slate-300 hover:bg-slate-800 hover:text-white",
  danger: "border border-red-500/40 text-red-300 hover:bg-red-500/15 hover:text-red-200",
  "danger-solid": "bg-red-600 text-white hover:bg-red-500",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className,
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: IconName }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} className={size === "sm" ? "size-3.5" : "size-4"} />}
      {children}
    </button>
  );
}

/** Square icon-only button; `label` is its accessible name and tooltip. */
export function IconButton({
  icon,
  label,
  tone = "default",
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  label: string;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50",
        tone === "danger"
          ? "text-slate-400 hover:bg-red-500/15 hover:text-red-300"
          : "text-slate-400 hover:bg-slate-700 hover:text-white",
        className,
      )}
      {...props}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

/**
 * Two-step delete: the first click asks for confirmation in place, so nothing is lost by a
 * stray click. `name` is used in the accessible labels ("Delete X" / "Confirm delete X").
 */
export function DeleteButton({ name, onConfirm, compact = false }: { name: string; onConfirm: () => void; compact?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return compact ? (
      <IconButton icon="trash" tone="danger" label={`Delete ${name}`} onClick={() => setAsking(true)} />
    ) : (
      <Button variant="danger" icon="trash" onClick={() => setAsking(true)} aria-label={`Delete ${name}`}>
        Delete
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={`Confirm deleting ${name}`}>
      <Button variant="danger-solid" size="sm" onClick={onConfirm} aria-label={`Confirm delete ${name}`}>
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
        Keep
      </Button>
    </span>
  );
}

/* ------------------------------------------------------------------ surfaces */

/** Opaque dark card: the main surface of the dashboard. */
export function Panel({
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
      className={cx("rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-lg shadow-black/20", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-200 uppercase">
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300 tabular-nums">{count}</span>
        )}
      </h2>
      {children}
    </div>
  );
}

/**
 * Accessible modal dialog: focus moves inside, Tab is trapped, Escape and the backdrop close it,
 * and focus returns to the opener on close.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusables = () =>
      dialog
        ? [...dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
            (el) => !el.hasAttribute("disabled"),
          )
        : [];
    // Focus the first form field if there is one, otherwise the first control
    const first = dialog?.querySelector<HTMLElement>("input:not([type='hidden']), select, textarea") ?? focusables()[0];
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl sm:rounded-2xl",
          size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <div className="flex items-start gap-3 border-b border-slate-800 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-white" dir="auto">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-400">{subtitle}</div>}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ controls */

export function Switch({
  checked,
  onChange,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Enable <rule name>". */
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? "Enabled: click to turn off" : "Disabled: click to turn on"}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cx(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors",
        size === "sm" ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-emerald-500 hover:bg-emerald-400" : "bg-slate-600 hover:bg-slate-500",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "inline-block rounded-full bg-white shadow transition-transform",
          size === "sm" ? "size-4" : "size-5",
          checked ? (size === "sm" ? "translate-x-[1.125rem]" : "translate-x-[1.375rem]") : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 hover:border-slate-600 focus:border-indigo-400 disabled:opacity-60";

/* ------------------------------------------------------------------ badges & notes */

export function SeverityDot({ severity }: { severity: Severity }) {
  return <span aria-hidden="true" className={cx("inline-block size-2.5 shrink-0 rounded-full", SEVERITY_CLASSES[severity].dot)} />;
}

/** Plain severity label: coloured dot + text, no chip. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs font-semibold", SEVERITY_CLASSES[severity].text)}>
      <SeverityDot severity={severity} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/** Marks rules that run through the LLM and therefore spend AI quota. Plain text, no chip. */
export function AiQuotaBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-violet-300"
      title="Checked by the AI model: every check with this rule enabled uses AI quota"
    >
      <Icon name="sparkles" className="size-3.5" />
      Uses AI quota
    </span>
  );
}

export function ErrorNote({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/30">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-red-300" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss && <IconButton icon="x" label="Dismiss" onClick={onDismiss} className="-my-1 size-6" />}
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

const ICON_PATHS = {
  plus: "M12 5v14M5 12h14",
  pencil: "M16.86 4.49a2.1 2.1 0 1 1 2.97 2.97L8.25 19.04 4 20l.96-4.25L16.86 4.49Z",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  x: "M6 6l12 12M18 6 6 18",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  document: "M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h5M9 13h6M9 17h6",
  shield: "M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4",
  chevron: "m9 6 6 6-6 6",
  sparkles: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
  template: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4H4V5Zm0 8h7v7H5a1 1 0 0 1-1-1v-6Zm11 0h5v6a1 1 0 0 1-1 1h-4v-7Z",
  download: "M12 4v12m0 0-4-4m4 4 4-4M4 20h16",
  alert: "M12 8v5m0 3h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  check: "m5 12 5 5 9-10",
  play: "M7 4.5v15l12-7.5-12-7.5Z",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-4"}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
