import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOC, violation } from "../test/fixtures";
import ReportView from "./ReportView";

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

const SPAN = violation({ id: "1-0", rule_name: "No figures", message: "Reveals range", block_id: 1, start: 23, end: 28 });
const WHOLE = violation({ id: "2-0", rule_name: "Cell rule", message: "Bad cell", block_id: 3 }, "warning");
const DOC_LEVEL = violation({ id: "3-0", rule_name: "Banner", message: "Missing banner", block_id: null, location: "Whole document" });

function setup(violations = [SPAN, WHOLE, DOC_LEVEL]) {
  const onCheck = vi.fn();
  render(<ReportView document={DOC} violations={violations} checking={false} checkedAt={null} onCheck={onCheck} />);
  return { onCheck };
}

describe("ReportView", () => {
  it("highlights the exact span of a violation", () => {
    setup();
    const mark = screen.getByText("50 km");
    expect(mark.tagName).toBe("MARK");
    expect(mark).toHaveClass("sev-error");
    expect(mark).toHaveAttribute("title", "No figures: Reveals range");
  });

  it("flags the whole block when there is no span, inside the table", () => {
    setup();
    const cell = screen.getByText("2 seconds").closest("p");
    expect(cell).toHaveClass("flagged", "sev-warning");
    expect(cell?.closest("td")).not.toBeNull();
  });

  it("scrolls to the block and marks it active when a violation is clicked", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /No figures/ }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(screen.getByText("50 km")).toHaveClass("active");
    expect(screen.getByRole("button", { name: /No figures/ })).toHaveClass("active");
  });

  it("does not scroll for document-level violations", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Banner/ }));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("clicking a highlight selects its violation", async () => {
    setup();
    await userEvent.click(screen.getByText("50 km"));
    expect(screen.getByRole("button", { name: /No figures/ })).toHaveClass("active");
  });

  it("shows severity counts and runs a re-check", async () => {
    const { onCheck } = setup();
    const toolbar = screen.getByRole("heading", { name: "spec.docx" }).parentElement as HTMLElement;
    expect(within(toolbar).getByText("2 errors")).toBeInTheDocument();
    expect(within(toolbar).getByText("1 warning")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Re-check" }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("shows the empty and unchecked states", () => {
    const { unmount } = render(
      <ReportView document={DOC} violations={[]} checking={false} checkedAt={null} onCheck={vi.fn()} />,
    );
    expect(screen.getByText(/No violations found/)).toBeInTheDocument();
    unmount();
    render(<ReportView document={DOC} violations={null} checking={false} checkedAt={null} onCheck={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Check document" })).toBeInTheDocument();
  });
});
