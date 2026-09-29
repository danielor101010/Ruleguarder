import { createElement, useMemo, useRef, useState } from "react";
import { countBySeverity, hasSpan, segmentText, violationsByBlock, worstSeverity } from "../lib/highlight";
import { layoutBlocks } from "../lib/layout";
import { SEVERITIES, type Block, type DocumentFull, type Violation } from "../types";

interface Props {
  document: DocumentFull;
  violations: Violation[] | null; // null => not checked yet
  checking: boolean;
  checkedAt: string | null;
  onCheck: () => void;
}

/** Render with a `key` that changes per document/report, so the active selection resets. */
export default function ReportView({ document, violations, checking, checkedAt, onCheck }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const blockRefs = useRef(new Map<number, HTMLElement>());

  const byBlock = useMemo(() => violationsByBlock(violations ?? []), [violations]);

  function focus(v: Violation) {
    setActiveId(v.id);
    if (v.block_id !== null) {
      blockRefs.current.get(v.block_id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const registerBlock = (id: number) => (el: HTMLElement | null) => {
    if (el) blockRefs.current.set(id, el);
    else blockRefs.current.delete(id);
  };

  const counts = countBySeverity(violations ?? []);

  return (
    <div className="report">
      <div className="report-toolbar">
        <h2 dir="auto">{document.filename}</h2>
        <div className="grow" />
        {violations && (
          <span className="summary">
            {violations.length === 0 ? (
              <span className="ok">No violations found ✓</span>
            ) : (
              SEVERITIES
                .map((s) => [s, counts[s] ?? 0] as const)
                .filter(([, n]) => n > 0)
                .map(([s, n]) => (
                  <span key={s} className={`pill sev-${s}`}>
                    {n} {s}
                  </span>
                ))
            )}
          </span>
        )}
        {checkedAt && <span className="muted small">Checked {new Date(checkedAt).toLocaleString()}</span>}
        <button onClick={onCheck} disabled={checking}>
          {checking ? "Checking…" : violations ? "Re-check" : "Check document"}
        </button>
      </div>

      <div className="report-body">
        <article className="doc">
          <DocumentBody
            blocks={document.blocks}
            byBlock={byBlock}
            activeId={activeId}
            onPick={focus}
            registerBlock={registerBlock}
          />
        </article>

        <aside className="violations">
          <h3>Violations</h3>
          {checking && <p className="muted">The AI is reading the document… this can take a minute for long documents.</p>}
          {!checking && violations === null && <p className="muted">Not checked yet. Click “Check document”.</p>}
          {violations?.map((v) => (
            <button
              key={v.id}
              className={`violation sev-${v.severity} ${v.id === activeId ? "active" : ""}`}
              onClick={() => focus(v)}
            >
              <div className="violation-head">
                <span className={`dot sev-${v.severity}`} />
                <strong dir="auto">{v.rule_name}</strong>
              </div>
              <div dir="auto">{v.message}</div>
              {v.excerpt && (
                <div className="excerpt" dir="auto">
                  {v.excerpt}
                </div>
              )}
              <div className="muted small" dir="auto">
                📍 {v.location}
              </div>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}

interface CommonProps {
  byBlock: Map<number, Violation[]>;
  activeId: string | null;
  onPick: (v: Violation) => void;
  registerBlock: (id: number) => (el: HTMLElement | null) => void;
}

function DocumentBody({ blocks, ...props }: CommonProps & { blocks: Block[] }) {
  return (
    <>
      {layoutBlocks(blocks).map((item) =>
        item.kind === "block" ? (
          <BlockView key={item.block.id} block={item.block} {...props} />
        ) : (
          <div key={`t${item.tableIndex}`} className="table-wrap">
            <table dir="auto">
              <tbody>
                {item.cells.map((row, r) => (
                  <tr key={r}>
                    {row.map((cellBlocks, c) => (
                      <td key={c}>
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
    </>
  );
}

function tooltip(violations: readonly Violation[]): string {
  return violations.map((v) => `${v.rule_name}: ${v.message}`).join("\n");
}

function headingTag(block: Block): "p" | "h3" | "h4" | "h5" | "h6" {
  if (block.kind !== "heading") return "p";
  const level = Math.min(Math.max(block.heading_level ?? 1, 1) + 2, 6);
  return `h${level}` as "h3" | "h4" | "h5" | "h6";
}

function BlockView({ block, byBlock, activeId, onPick, registerBlock }: CommonProps & { block: Block }) {
  const violations = byBlock.get(block.id) ?? [];
  // Violations without a span (quote not found) flag the whole block
  const wholeBlock = violations.filter((v) => !hasSpan(v));
  const flagged = wholeBlock.length > 0;
  const blockActive = wholeBlock.some((v) => v.id === activeId);
  const children = block.text
    ? segmentText(block.text, violations).map((seg, i) =>
        seg.violations.length ? (
          <mark
            key={i}
            className={`hl sev-${worstSeverity(seg.violations)} ${seg.violations.some((v) => v.id === activeId) ? "active" : ""}`}
            title={tooltip(seg.violations)}
            onClick={(e) => {
              e.stopPropagation();
              onPick(seg.violations[0]);
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )
    : " ";

  return createElement(
    headingTag(block),
    {
      ref: registerBlock(block.id),
      dir: "auto",
      className: `block ${flagged ? `flagged sev-${worstSeverity(wholeBlock)}` : ""} ${blockActive ? "active" : ""}`,
      onClick: flagged ? () => onPick(wholeBlock[0]) : undefined,
      title: flagged ? tooltip(wholeBlock) : undefined,
    },
    children,
  );
}
