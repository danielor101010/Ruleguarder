import { useEffect, useMemo, useRef, useState } from "react";
import type { Block, DocumentFull, Severity, Violation } from "../types";

interface Props {
  document: DocumentFull;
  violations: Violation[] | null; // null => not checked yet
  checking: boolean;
  checkedAt: string | null;
  onCheck: () => void;
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

export default function ReportView({ document, violations, checking, checkedAt, onCheck }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const blockRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => setActiveId(null), [document.id, violations]);

  const byBlock = useMemo(() => {
    const map = new Map<number, Violation[]>();
    for (const v of violations ?? []) {
      if (v.block_id === null) continue;
      map.set(v.block_id, [...(map.get(v.block_id) ?? []), v]);
    }
    return map;
  }, [violations]);

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

  const counts = (violations ?? []).reduce<Record<string, number>>((acc, v) => {
    acc[v.severity] = (acc[v.severity] ?? 0) + 1;
    return acc;
  }, {});

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
              (["error", "warning", "info"] as Severity[])
                .filter((s) => counts[s])
                .map((s) => (
                  <span key={s} className={`pill sev-${s}`}>
                    {counts[s]} {s}
                    {counts[s] > 1 ? "s" : ""}
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
          <DocumentBody blocks={document.blocks} byBlock={byBlock} activeId={activeId} onPick={focus} registerBlock={registerBlock} />
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

type BodyProps = CommonProps & { blocks: Block[] };

/** Renders paragraphs/headings in order, and groups consecutive table-cell blocks back into tables. */
function DocumentBody({ blocks, ...props }: BodyProps) {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.table_index === null) {
      out.push(<BlockView key={b.id} block={b} {...props} />);
      i++;
      continue;
    }
    const tableBlocks: Block[] = [];
    while (i < blocks.length && blocks[i].table_index === b.table_index) tableBlocks.push(blocks[i++]);
    out.push(<TableView key={`t${b.table_index}`} blocks={tableBlocks} {...props} />);
  }
  return <>{out}</>;
}

function TableView({ blocks, ...props }: BodyProps) {
  const rows = Math.max(...blocks.map((b) => b.row ?? 1));
  const cols = Math.max(...blocks.map((b) => b.col ?? 1));
  const cell = (r: number, c: number) => blocks.filter((b) => b.row === r && b.col === c);
  return (
    <div className="table-wrap">
      <table dir="auto">
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  {cell(r + 1, c + 1).map((b) => (
                    <BlockView key={b.id} block={b} {...props} />
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockView({ block, byBlock, activeId, onPick, registerBlock }: CommonProps & { block: Block }) {
  const violations = byBlock.get(block.id) ?? [];
  // Violations without a span (quote not found) flag the whole block
  const wholeBlock = violations.filter((v) => v.start === null || v.end === null);
  const spans = violations.filter((v) => v.start !== null && v.end !== null);

  const Tag = (block.kind === "heading" ? `h${Math.min(Math.max(block.heading_level ?? 1, 1) + 2, 6)}` : "p") as
    | "p"
    | "h3";
  const flagged = wholeBlock.length > 0;
  const blockActive = wholeBlock.some((v) => v.id === activeId);

  return (
    <Tag
      ref={registerBlock(block.id)}
      dir="auto"
      className={`block ${flagged ? `flagged sev-${worst(wholeBlock)}` : ""} ${blockActive ? "active" : ""}`}
      onClick={flagged ? () => onPick(wholeBlock[0]) : undefined}
      title={flagged ? wholeBlock.map((v) => `${v.rule_name}: ${v.message}`).join("\n") : undefined}
    >
      {block.text ? segments(block.text, spans).map((seg, i) =>
        seg.violations.length ? (
          <mark
            key={i}
            className={`hl sev-${worst(seg.violations)} ${seg.violations.some((v) => v.id === activeId) ? "active" : ""}`}
            title={seg.violations.map((v) => `${v.rule_name}: ${v.message}`).join("\n")}
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
      ) : " "}
    </Tag>
  );
}

function worst(vs: Violation[]): Severity {
  return vs.reduce<Severity>((w, v) => (SEVERITY_RANK[v.severity] > SEVERITY_RANK[w] ? v.severity : w), "info");
}

/** Split text at every violation boundary so overlapping violations render correctly. */
function segments(text: string, spans: Violation[]) {
  const cuts = new Set([0, text.length]);
  for (const v of spans) {
    cuts.add(Math.max(0, Math.min(text.length, v.start!)));
    cuts.add(Math.max(0, Math.min(text.length, v.end!)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: { text: string; violations: Violation[] }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    out.push({ text: text.slice(a, b), violations: spans.filter((v) => v.start! <= a && v.end! >= b) });
  }
  return out;
}
