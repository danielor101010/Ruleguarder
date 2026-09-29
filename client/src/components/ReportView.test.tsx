import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_MS } from "../lib/motion";
import { DOC, violation } from "../test/fixtures";
import type { FailedRule, Violation } from "../types";
import ReportView from "./ReportView";

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  vi.useRealTimers();
});

const SPAN = violation({ id: "1-0", rule_id: 1, rule_name: "No figures", message: "Reveals range", block_id: 1, start: 23, end: 28 });
const WHOLE = violation({ id: "2-0", rule_id: 2, rule_name: "Cell rule", message: "Bad cell", block_id: 3 }, "medium");
const DOC_LEVEL = violation({ id: "3-0", rule_id: 3, rule_name: "Banner", message: "Missing banner", block_id: null, location: "Whole document" }, "low");

function setup(violations: Violation[] | null = [SPAN, WHOLE, DOC_LEVEL], aiRulesEnabled = 0, failedRules?: FailedRule[]) {
  const onCheck = vi.fn();
  render(
    <ReportView
      document={DOC}
      violations={violations}
      failedRules={failedRules}
      checking={false}
      checkedAt={null}
      aiRulesEnabled={aiRulesEnabled}
      onCheck={onCheck}
    />,
  );
  return { onCheck };
}

const list = () => screen.getByRole("list", { name: "Violations list" });
const card = (name: RegExp) => within(list()).getByRole("button", { name });
const block = (text: string) => screen.getByText(text).closest("[data-block-id]") as HTMLElement;

describe("ReportView", () => {
  it("highlights the exact span of a violation with its severity", () => {
    setup();
    const mark = screen.getByText("50 km");
    expect(mark.tagName).toBe("MARK");
    expect(mark).toHaveAttribute("data-severity", "high");
    // Monochrome: severity shows as shade + underline style, not hue (ADR-017)
    expect(mark).toHaveClass("bg-zinc-300", "decoration-solid");
    expect(mark).toHaveAttribute("title", "No figures: Reveals range");
  });

  it("flags the whole block when there is no span, inside the table", () => {
    setup();
    const cell = block("2 seconds");
    expect(cell).toHaveAttribute("data-severity", "medium");
    expect(cell.closest("td")).not.toBeNull();
  });

  it("lists document-level violations first, labelled Whole document", () => {
    setup();
    const cards = within(list()).getAllByRole("button");
    expect(cards[0]).toHaveTextContent("Banner");
    expect(cards[0]).toHaveTextContent("Whole document");
    expect(cards[1]).toHaveTextContent("No figures");
  });

  it("scrolls to the paragraph, flashes it for ~1.5 s and keeps it active", async () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(card(/No figures/));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    const target = block("50 km");
    expect(target).toHaveAttribute("data-flash", "true");
    expect(target).toHaveAttribute("data-active", "true");
    expect(within(target).getByTestId("flash-overlay")).toHaveClass("animate-flash");
    expect(screen.getByText("50 km")).toHaveAttribute("data-active", "true");
    expect(card(/No figures/)).toHaveAttribute("aria-current", "true");

    act(() => vi.advanceTimersByTime(FLASH_MS - 1));
    expect(target).toHaveAttribute("data-flash", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(target).not.toHaveAttribute("data-flash");
    expect(target).toHaveAttribute("data-active", "true");
  });

  it("restarts the flash when the same violation is clicked again", () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(card(/No figures/));
    const first = screen.getByTestId("flash-overlay");
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(card(/No figures/));
    const second = screen.getByTestId("flash-overlay");
    expect(second).not.toBe(first); // remounted => the CSS animation starts over
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("flash-overlay")).toBe(second); // timer was reset
  });

  it("moves the active state and flash when another violation is clicked", () => {
    setup();
    fireEvent.click(card(/No figures/));
    fireEvent.click(card(/Cell rule/));
    expect(block("2 seconds")).toHaveAttribute("data-flash", "true");
    expect(block("50 km")).not.toHaveAttribute("data-flash");
    expect(block("50 km")).not.toHaveAttribute("data-active");
    expect(card(/No figures/)).not.toHaveAttribute("aria-current");
  });

  it("does not scroll or flash for document-level violations", () => {
    setup();
    fireEvent.click(card(/Banner/));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.queryByTestId("flash-overlay")).toBeNull();
    expect(card(/Banner/)).toHaveAttribute("aria-current", "true");
  });

  it("clicking a highlight selects its violation and reveals it in the list", async () => {
    setup();
    await userEvent.click(screen.getByText("50 km"));
    expect(card(/No figures/)).toHaveAttribute("aria-current", "true");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
  });

  it("inverts the active highlight to black instead of its severity shade", async () => {
    setup();
    const mark = screen.getByText("50 km");
    await userEvent.click(mark);
    expect(mark).toHaveClass("bg-zinc-900", "text-white");
    expect(mark).not.toHaveClass("bg-zinc-300");
  });

  it("highlights are keyboard accessible", async () => {
    setup();
    screen.getByText("50 km").focus();
    await userEvent.keyboard("{Enter}");
    expect(card(/No figures/)).toHaveAttribute("aria-current", "true");
  });

  it("filters by severity with counted chips", async () => {
    setup();
    const high = screen.getByRole("button", { name: "High 1" });
    expect(screen.getByRole("button", { name: "Medium 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Low 1" })).toBeInTheDocument();

    await userEvent.click(high);
    expect(high).toHaveAttribute("aria-pressed", "false");
    expect(within(list()).queryByRole("button", { name: /No figures/ })).toBeNull();
    // The highlight disappears from the document too
    expect(screen.queryByText("50 km")).toBeNull();
    expect(screen.getByText("The detection range is 50 km.").tagName).toBe("SPAN");
  });

  it("filters by rule and updates chip counts", async () => {
    setup();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by rule" }), "Cell rule (1)");
    expect(within(list()).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "High 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Medium 1" })).toBeInTheDocument();
  });

  it("offers to clear filters when nothing matches", async () => {
    setup();
    for (const name of ["High 1", "Medium 1", "Low 1"]) await userEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByText("No violations match the filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(within(list()).getAllByRole("button")).toHaveLength(3);
  });

  it("runs a re-check and warns when AI rules will spend quota", async () => {
    const { onCheck } = setup([SPAN], 2);
    expect(screen.getByText(/2 AI rules enabled/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Re-check" }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("shows the empty and unchecked states", () => {
    setup([]);
    expect(screen.getByText(/No violations found/)).toBeInTheDocument();
    expect(screen.queryByText(/AI rule/)).toBeNull();
  });

  it("warns that the report is incomplete when rules could not be checked", () => {
    setup([SPAN], 1, [{ rule_id: 4, rule_name: "No performance figures", error: "All Gemini models are unavailable right now" }]);
    expect(screen.getByText(/1 rule could not be checked, so this report is\s+incomplete/)).toBeInTheDocument();
    const failed = screen.getByRole("list", { name: "Rules not checked" });
    expect(failed).toHaveTextContent("No performance figures: All Gemini models are unavailable right now");
    expect(card(/No figures/)).toBeInTheDocument(); // the other rules' results are still shown
  });

  it("does not claim a clean document when rules could not be checked", () => {
    setup([], 0, [{ rule_id: 4, rule_name: "AI rule", error: "quota" }]);
    expect(screen.queryByText("No violations found.")).toBeNull();
    expect(screen.getByText("No violations found by the rules that ran.")).toBeInTheDocument();
  });

  it("offers the first check when never checked", () => {
    setup(null);
    expect(screen.getByRole("button", { name: "Check document" })).toBeInTheDocument();
    expect(screen.getByText(/Not checked yet\. Click/)).toBeInTheDocument();
  });

  it("keeps dir=auto on document text for RTL documents", () => {
    setup();
    expect(block("50 km")).toHaveAttribute("dir", "auto");
  });
});
