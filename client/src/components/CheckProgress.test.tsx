import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { checkStatus } from "../test/fixtures";
import CheckProgress from "./CheckProgress";

describe("CheckProgress", () => {
  it("shows the current step and a proportional bar", () => {
    render(<CheckProgress progress={checkStatus({ progress_done: 3, progress_total: 4, step: "AI rules: part 2 of 3" })} onCancel={vi.fn()} />);
    expect(screen.getByText("AI rules: part 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("3 / 4")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Check progress" })).toHaveAttribute("aria-valuenow", "75");
  });

  it("shows an indeterminate bar while the total is unknown", () => {
    render(<CheckProgress progress={checkStatus({ status: "queued", progress_done: 0, progress_total: 0, step: null })} onCancel={vi.fn()} />);
    expect(screen.getByText("Waiting to start…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Check progress" })).not.toHaveAttribute("aria-valuenow");
  });

  it("cancels", async () => {
    const onCancel = vi.fn();
    render(<CheckProgress progress={checkStatus()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
