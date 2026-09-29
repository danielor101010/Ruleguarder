import type { Block } from "../types";

export interface TableLayout {
  kind: "table";
  tableIndex: number;
  rows: number;
  cols: number;
  /** cells[row][col] -> blocks in that cell (0-based) */
  cells: Block[][][];
}

export type LayoutItem = { kind: "block"; block: Block } | TableLayout;

/** Paragraphs/headings stay in order; consecutive table-cell blocks are grouped back into tables. */
export function layoutBlocks(blocks: readonly Block[]): LayoutItem[] {
  const items: LayoutItem[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const tableIndex = block.table_index;
    if (tableIndex === null) {
      items.push({ kind: "block", block });
      i++;
      continue;
    }
    const tableBlocks: Block[] = [];
    while (i < blocks.length && blocks[i].table_index === tableIndex) tableBlocks.push(blocks[i++]);
    items.push(buildTable(tableIndex, tableBlocks));
  }
  return items;
}

function buildTable(tableIndex: number, blocks: Block[]): TableLayout {
  const rows = Math.max(1, ...blocks.map((b) => b.row ?? 1));
  const cols = Math.max(1, ...blocks.map((b) => b.col ?? 1));
  const cells: Block[][][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));
  for (const b of blocks) cells[(b.row ?? 1) - 1][(b.col ?? 1) - 1].push(b);
  return { kind: "table", tableIndex, rows, cols, cells };
}
