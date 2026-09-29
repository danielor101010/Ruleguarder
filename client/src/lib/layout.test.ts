import { describe, expect, it } from "vitest";
import { block, DOC } from "../test/fixtures";
import { layoutBlocks, splitParts } from "./layout";

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

describe("splitParts", () => {
  it("routes blocks to their page region and keeps text boxes in the body", () => {
    const parts = splitParts([
      block({ id: 0, text: "Body" }),
      block({ id: 1, text: "Box", part: "textbox" }),
      block({ id: 2, text: "Head", part: "header" }),
      block({ id: 3, text: "Foot", part: "footer" }),
      block({ id: 4, text: "Note", part: "footnote" }),
      block({ id: 5, text: "End", part: "endnote" }),
      block({ id: 6, text: "Old" }), // parsed before parts existed: no `part`
    ]);
    expect(parts.body.map((b) => b.text)).toEqual(["Body", "Box", "Old"]);
    expect(parts.headers.map((b) => b.text)).toEqual(["Head"]);
    expect(parts.footers.map((b) => b.text)).toEqual(["Foot"]);
    expect(parts.footnotes.map((b) => b.text)).toEqual(["Note"]);
    expect(parts.endnotes.map((b) => b.text)).toEqual(["End"]);
  });
});
