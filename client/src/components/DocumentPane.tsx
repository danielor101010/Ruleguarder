import { createElement, type KeyboardEvent } from "react";
import type { Flash } from "../hooks/useViolationFocus";
import { hasSpan, segmentText, worstSeverity } from "../lib/highlight";
import { layoutBlocks } from "../lib/layout";
import { cx, SEVERITY_CLASSES } from "../lib/severity";
import type { Block, Violation } from "../types";

interface CommonProps {
  byBlock: Map<number, Violation[]>;
  activeId: string | null;
  flash: Flash | null;
  onPick: (v: Violation) => void;
  registerBlock: (id: number) => (el: HTMLElement | null) => void;
}

/** The document as paragraphs, headings and tables, with severity highlights. */
export default function DocumentPane({ blocks, ...props }: CommonProps & { blocks: Block[] }) {
  if (!blocks.length) return <p className="text-sm text-slate-500">This document has no text.</p>;
  return (
    <div className="flex flex-col gap-2">
      {layoutBlocks(blocks).map((item) =>
        item.kind === "block" ? (
          <BlockView key={item.block.id} block={item.block} {...props} />
        ) : (
          <div key={`t${item.tableIndex}`} className="my-2 overflow-x-auto">
            <table dir="auto" className="w-full border-collapse text-sm">
              <tbody>
                {item.cells.map((row, r) => (
                  <tr key={r}>
                    {row.map((cellBlocks, c) => (
                      <td key={c} className="border border-slate-200 p-1.5 align-top">
                        {cellBlocks.map((b) => (
                          <BlockView key={b.id} block={b} {...props} />
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}

function tooltip(violations: readonly Violation[]): string {
  return violations.map((v) => `${v.rule_name}: ${v.message}`).join("\n");
}

type BlockTag = "p" | "h3" | "h4" | "h5" | "h6";

function headingTag(block: Block): BlockTag {
  if (block.kind !== "heading") return "p";
  const level = Math.min(Math.max(block.heading_level ?? 1, 1) + 2, 6);
  return `h${level}` as BlockTag;
}

function headingClass(block: Block): string {
  if (block.kind !== "heading") return "text-[0.95rem] leading-relaxed text-slate-800";
  const level = block.heading_level ?? 1;
  if (level === 0) return "text-2xl font-bold text-slate-950";
  if (level === 1) return "mt-3 text-xl font-semibold text-slate-950";
  if (level === 2) return "mt-2 text-lg font-semibold text-slate-900";
  return "mt-1 text-base font-semibold text-slate-900";
}

/** Enter / Space activate a focusable non-button element. */
function onActivate(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    action();
  };
}

function BlockView({ block, byBlock, activeId, flash, onPick, registerBlock }: CommonProps & { block: Block }) {
  const violations = byBlock.get(block.id) ?? [];
  // Violations without a span (quote not found, or a block-level rule) flag the whole block
  const wholeBlock = violations.filter((v) => !hasSpan(v));
  const flagged = wholeBlock.length > 0;
  const active = violations.some((v) => v.id === activeId);
  const flashing = flash?.blockId === block.id;
  const pickBlock = () => onPick(wholeBlock[0]);

  const children = block.text
    ? segmentText(block.text, violations).map((seg, i) => {
        if (!seg.violations.length) return <span key={i}>{seg.text}</span>;
        const severity = worstSeverity(seg.violations);
        const pick = () => onPick(seg.violations[0]);
        const segActive = seg.violations.some((v) => v.id === activeId);
        return (
          <mark
            key={i}
            data-violation={seg.violations.map((v) => v.id).join(" ")}
            data-severity={severity}
            data-active={segActive || undefined}
            role="button"
            tabIndex={0}
            className={cx(
              "rounded-sm px-0.5 text-slate-950 underline decoration-2 underline-offset-4 transition-colors",
              SEVERITY_CLASSES[severity].mark,
              segActive && "decoration-[3px] brightness-95 saturate-150",
            )}
            title={tooltip(seg.violations)}
            onClick={(e) => {
              e.stopPropagation();
              pick();
            }}
            onKeyDown={onActivate(pick)}
          >
            {seg.text}
          </mark>
        );
      })
    : " ";

  const blockSeverity = flagged ? worstSeverity(wholeBlock) : null;

  return createElement(
    headingTag(block),
    {
      ref: registerBlock(block.id),
      dir: "auto",
      "data-block-id": block.id,
      "data-severity": blockSeverity ?? undefined,
      "data-active": active || undefined,
      "data-flash": flashing || undefined,
      role: flagged ? "button" : undefined,
      tabIndex: flagged ? 0 : undefined,
      className: cx(
        "relative scroll-my-24 rounded-md px-3 py-1 transition-colors",
        headingClass(block),
        blockSeverity && SEVERITY_CLASSES[blockSeverity].block,
        active && !blockSeverity && "bg-indigo-50",
      ),
      onClick: flagged ? pickBlock : undefined,
      onKeyDown: flagged ? onActivate(pickBlock) : undefined,
      title: flagged ? tooltip(wholeBlock) : undefined,
    },
    children,
    flashing && (
      <span
        key={flash.nonce}
        aria-hidden="true"
        data-testid="flash-overlay"
        className="pointer-events-none absolute inset-0 animate-flash rounded-md motion-reduce:animate-none motion-reduce:bg-indigo-200/40"
      />
    ),
  );
}
