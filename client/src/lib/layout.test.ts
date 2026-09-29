import { describe, expect, it } from "vitest";
import { block, DOC } from "../test/fixtures";
import { layoutBlocks } from "./layout";

describe("layoutBlocks", () => {
  it("keeps paragraphs in order and groups table cells", () => {
    const items = layoutBlocks(DOC.blocks);
    expect(items.map((i) => i.kind)).toEqual(["block", "block", "table"]);
    const table = items[2];
    if (table.kind !== "table") throw new Error("expected table");
    expect([table.rows, table.cols]).toEqual([1, 2]);
    expect(table.cells[0].map((cell) => cell.map((b) => b.text))).toEqual([["Parameter"], ["2 seconds"]]);
  });

  it("leaves empty grid positions for merged / missing cells", () => {
    const items = layoutBlocks([
      block({ id: 0, text: "A", table_index: 1, row: 1, col: 1 }),
      block({ id: 1, text: "C", table_index: 1, row: 1, col: 3 }),
    ]);
    const table = items[0];
    if (table.kind !== "table") throw new Error("expected table");
    expect(table.cells[0].map((cell) => cell.length)).toEqual([1, 0, 1]);
  });

  it("separates two tables that follow each other", () => {
    const items = layoutBlocks([
      block({ id: 0, text: "A", table_index: 1, row: 1, col: 1 }),
      block({ id: 1, text: "B", table_index: 2, row: 1, col: 1 }),
    ]);
    expect(items.map((i) => (i.kind === "table" ? i.tableIndex : -1))).toEqual([1, 2]);
  });

  it("handles an empty document", () => {
    expect(layoutBlocks([])).toEqual([]);
  });
});
