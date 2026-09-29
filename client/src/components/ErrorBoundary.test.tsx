import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

afterEach(() => {
  vi.restoreAllMocks();
});

function Broken(): never {
  throw new Error("Cannot read properties of undefined");
}

describe("ErrorBoundary", () => {
  it("renders its children when nothing fails", () => {
    render(
      <ErrorBoundary>
        <p>App content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("App content")).toBeInTheDocument();
  });

  it("shows a message and a reload button instead of a blank page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); // React logs the caught error
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload });
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("Cannot read properties of undefined")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reload page" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
