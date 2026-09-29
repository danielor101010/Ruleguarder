import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, SEVERITY_CLASSES, SEVERITY_LABEL } from "../lib/severity";
import type { Severity } from "../types";

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700 active:bg-black",
  secondary: "border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400 hover:bg-zinc-100",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-900",
  "danger-solid": "bg-zinc-900 text-white hover:bg-black",
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
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50",
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
      <IconButton icon="trash" label={`Delete ${name}`} onClick={() => setAsking(true)} />
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

/** White card: the main surface of the dashboard. */
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
      className={cx("rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-sm", className)}
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
      <h2 id={id} className="flex items-baseline gap-2 text-base font-semibold tracking-tight text-zinc-900">
        {title}
        {count !== undefined && <span className="text-sm font-normal text-zinc-400 tabular-nums">{count}</span>}
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
      <div aria-hidden="true" className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col rounded-t-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl sm:rounded-3xl",
          size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <div className="flex items-start gap-3 border-b border-zinc-200 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-zinc-900" dir="auto">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div>}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-6 py-4">{footer}</div>}
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
        checked ? "bg-zinc-900 hover:bg-zinc-700" : "bg-zinc-300 hover:bg-zinc-400",
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
  "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 hover:border-zinc-400 focus:border-zinc-900 disabled:bg-zinc-50 disabled:opacity-60";

/* ------------------------------------------------------------------ labels & notes */

/** Plain severity label: uppercase text whose weight and shade follow the severity. No dot, no chip. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cx("text-[0.7rem] tracking-wider uppercase", SEVERITY_CLASSES[severity].text)}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/** Marks rules that run through the LLM and therefore spend AI quota. Plain text. */
export function AiQuotaBadge() {
  return (
    <span
      className="shrink-0 text-xs font-medium text-zinc-500"
      title="Checked by the AI model: every check with this rule enabled uses AI quota"
    >
      Uses AI quota
    </span>
  );
}

/** Neutral inline message box; `strong` gives errors a darker border than notices. */
function Note({ role, strong, children }: { role: "alert" | "status"; strong: boolean; children: ReactNode }) {
  return (
    <div
      role={role}
      className={cx(
        "flex items-start gap-2 rounded-2xl border bg-zinc-50 px-3 py-2 text-sm text-zinc-800",
        strong ? "border-zinc-900" : "border-zinc-300",
      )}
    >
      {children}
    </div>
  );
}

export function ErrorNote({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <Note role="alert" strong>
      <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-zinc-900" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss && <IconButton icon="x" label="Dismiss" onClick={onDismiss} className="-my-1 size-6" />}
    </Note>
  );
}

export function WarningNote({ children }: { children: ReactNode }) {
  return (
    <Note role="status" strong={false}>
      <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-zinc-700" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </Note>
  );
}

/** Neutral dismissible status line, e.g. the result of loading sample rules. */
export function StatusNote({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <p role="status" className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-800">
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {onDismiss && <IconButton icon="x" label="Dismiss" onClick={onDismiss} className="-my-1 size-6" />}
    </p>
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
