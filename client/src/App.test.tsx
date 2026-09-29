import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import App from "./App";
import { DOC, report, rule, RULE_TYPES, summary, template, violation } from "./test/fixtures";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, "rules").mockResolvedValue([rule({ id: 1, name: "No figures" })]);
  vi.spyOn(api, "ruleTypes").mockResolvedValue(RULE_TYPES);
  vi.spyOn(api, "documents").mockResolvedValue([summary(1, "spec.docx")]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("works without the template endpoints (405 from an older server)", async () => {
    vi.spyOn(api, "ruleTemplates").mockRejectedValue(new ApiError(405, "Method Not Allowed"));
    render(<App />);
    expect(await screen.findByText("No figures")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/not available on this server/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Add from template" })).toBeNull();
  });

  it("shows clear errors when the server is unreachable", async () => {
    const offline = new TypeError("Failed to fetch");
    vi.spyOn(api, "rules").mockRejectedValue(offline);
    vi.spyOn(api, "documents").mockRejectedValue(offline);
    vi.spyOn(api, "ruleTemplates").mockRejectedValue(offline);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(3));
    for (const alert of screen.getAllByRole("alert")) expect(alert).toHaveTextContent(/Network error/);
  });

  it("loads sample rules and refreshes the rules list", async () => {
    vi.spyOn(api, "ruleTemplates").mockResolvedValue([template({ id: "t" })]);
    vi.spyOn(api, "loadSampleRules").mockResolvedValue({ created: [rule({ id: 7, name: "PII" })], skipped: [] });
    render(<App />);
    await screen.findByText("No figures");
    vi.spyOn(api, "rules").mockResolvedValue([rule({ id: 1, name: "No figures" }), rule({ id: 7, name: "PII" })]);
    await userEvent.click(await screen.findByRole("button", { name: "Load Sample Rules" }));
    expect(await screen.findByText("Sample rules: 1 added, 0 already present")).toBeInTheDocument();
    expect(await screen.findByText("PII")).toBeInTheDocument();
  });

  it("selects a document, checks it and shows counts in the top bar", async () => {
    vi.spyOn(api, "ruleTemplates").mockResolvedValue([]);
    vi.spyOn(api, "latestReport").mockRejectedValue(new ApiError(404, "never checked"));
    vi.spyOn(api, "document").mockResolvedValue(DOC);
    const v = violation({ id: "1-0", rule_name: "No figures", block_id: 1, start: 23, end: 28 });
    vi.spyOn(api, "check").mockResolvedValue(report([v]));
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /^spec\.docx/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Check document" }));
    const counters = await screen.findByRole("list", { name: "Violations by severity" });
    expect(within(counters).getByText(/High/)).toHaveTextContent("High 1");
    expect(screen.getByText("50 km").tagName).toBe("MARK");
  });
});
