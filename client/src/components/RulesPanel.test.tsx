import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { rule, RULE_TYPES, template } from "../test/fixtures";
import RulesPanel from "./RulesPanel";

type Props = ComponentProps<typeof RulesPanel>;

const TEMPLATES = [
  template({ id: "markings", label: "Classification markings", category: "security" }),
  template({
    id: "ai-perf",
    label: "No performance figures",
    category: "ai",
    rule: { name: "No performance figures", type: "llm", params: { instruction: "No numbers" }, enabled: false },
  }),
];

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    rules: [],
    types: RULE_TYPES,
    loading: false,
    error: null,
    onDismissError: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    templates: { templates: TEMPLATES, status: "ready", error: null, onRetry: vi.fn() },
    samples: { loading: false, message: null, error: null, onLoad: vi.fn(), onDismiss: vi.fn() },
    ...overrides,
  };
  render(<RulesPanel {...props} />);
  return props;
}

describe("RulesPanel", () => {
  it("prefills the new-rule form from a template and creates the (edited) rule", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add from template" }));
    const picker = screen.getByRole("group", { name: "Rule templates" });
    expect(within(picker).getByText("Security")).toBeInTheDocument();
    await userEvent.click(within(picker).getByRole("button", { name: /Classification markings/ }));

    const form = screen.getByRole("form", { name: "New rule" });
    expect(within(form).getByText("From template: Classification markings")).toBeInTheDocument();
    expect(within(form).getByLabelText("Type")).toHaveValue("forbidden_text");
    expect(within(form).getByLabelText("Name")).toHaveValue("No classification markings");
    expect(within(form).getByLabelText("Pattern")).toHaveValue("\\b(TOP SECRET|CONFIDENTIAL)\\b");
    expect(within(form).getByLabelText("Is Regex")).toBeChecked();
    expect(within(form).getByLabelText("Severity")).toHaveValue("medium");

    await userEvent.clear(within(form).getByLabelText("Name"));
    await userEvent.type(within(form).getByLabelText("Name"), "Markings");
    await userEvent.click(within(form).getByRole("button", { name: "Save rule" }));
    expect(props.onCreate).toHaveBeenCalledWith({
      name: "Markings",
      description: "",
      type: "forbidden_text",
      params: { pattern: "\\b(TOP SECRET|CONFIDENTIAL)\\b", is_regex: true, case_sensitive: true },
      severity: "medium",
      enabled: true,
    });
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("keeps AI templates disabled and marks them as using quota", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add from template" }));
    const option = screen.getByRole("button", { name: /No performance figures/ });
    expect(within(option).getByText("AI · uses quota")).toBeInTheDocument();
    await userEvent.click(option);
    const form = screen.getByRole("form", { name: "New rule" });
    expect(within(form).getByLabelText("Enabled")).not.toBeChecked();
    expect(within(form).getByLabelText("Instruction")).toHaveValue("No numbers");
    await userEvent.click(within(form).getByRole("button", { name: "Save rule" }));
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ type: "llm", enabled: false }));
  });

  it("starts a blank rule on a deterministic type even when the AI type is listed first", async () => {
    const llmFirst = [...RULE_TYPES].sort((a) => (a.key === "llm" ? -1 : 1));
    expect(llmFirst[0].key).toBe("llm");
    setup({ types: llmFirst });
    await userEvent.click(screen.getByRole("button", { name: "+ New rule" }));
    expect(within(screen.getByRole("form", { name: "New rule" })).getByLabelText("Type")).not.toHaveValue("llm");
  });

  it("shows the server's validation error and keeps the form open", async () => {
    setup({ onCreate: vi.fn().mockRejectedValue(new Error("Invalid regular expression")) });
    await userEvent.click(screen.getByRole("button", { name: "+ New rule" }));
    const form = screen.getByRole("form", { name: "New rule" });
    await userEvent.type(within(form).getByLabelText("Name"), "Bad");
    await userEvent.type(within(form).getByLabelText("Pattern"), "(");
    await userEvent.click(within(form).getByRole("button", { name: "Save rule" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Invalid regular expression");
  });

  it("hides the template features when the server doesn't have them (404)", () => {
    setup({ templates: { templates: [], status: "unavailable", error: null, onRetry: vi.fn() } });
    expect(screen.queryByRole("button", { name: "Add from template" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Load Sample Rules" })).toBeNull();
    expect(screen.getByText(/not available on this server/)).toBeInTheDocument();
    // Creating rules by hand still works
    expect(screen.getByRole("button", { name: "+ New rule" })).toBeEnabled();
  });

  it("shows a template load error with retry", async () => {
    const onRetry = vi.fn();
    setup({ templates: { templates: [], status: "error", error: "Network error: offline", onRetry } });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load rule templates: Network error: offline");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("loads the sample rules and shows the result", async () => {
    const onLoad = vi.fn();
    setup({ samples: { loading: false, message: "4 added, 2 already present", error: null, onLoad, onDismiss: vi.fn() } });
    await userEvent.click(screen.getByRole("button", { name: "Load Sample Rules" }));
    expect(onLoad).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Sample rules: 4 added, 2 already present");
  });

  it("shows a sample-load error", () => {
    setup({ samples: { loading: false, message: null, error: "Sample rules are not available on this server.", onLoad: vi.fn(), onDismiss: vi.fn() } });
    expect(screen.getByRole("alert")).toHaveTextContent("Sample rules are not available");
  });

  it("lists rules with AI badge, toggle, edit and delete", async () => {
    const ai = rule({ id: 1, name: "AI check", type: "llm", params: { instruction: "No numbers" }, enabled: false });
    const plain = rule({ id: 2, name: "Plain" });
    const props = setup({ rules: [ai, plain] });

    const list = screen.getByRole("list", { name: "Rules list" });
    const [aiRow, plainRow] = within(list).getAllByRole("listitem");
    expect(within(aiRow).getByText("AI · uses quota")).toBeInTheDocument();
    expect(within(plainRow).queryByText("AI · uses quota")).toBeNull();

    await userEvent.click(screen.getByRole("switch", { name: "Enable Plain" }));
    expect(props.onToggle).toHaveBeenCalledWith(plain);
    await userEvent.click(screen.getByRole("button", { name: "Delete Plain" }));
    expect(props.onDelete).toHaveBeenCalledWith(plain);

    await userEvent.click(screen.getByRole("button", { name: "Edit Plain" }));
    const form = screen.getByRole("form", { name: "Edit rule Plain" });
    expect(within(form).getByLabelText("Type")).toBeDisabled();
    await userEvent.click(within(form).getByRole("button", { name: "Save rule" }));
    expect(props.onUpdate).toHaveBeenCalledWith(2, expect.objectContaining({ name: "Plain", severity: "high" }));
  });
});
