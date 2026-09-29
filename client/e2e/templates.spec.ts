import { expect, test } from "@playwright/test";
import { assertNoEnabledLlmRules, escapeRegExp, templatesAvailable } from "./helpers";

interface ApiTemplate {
  id: string;
  label: string;
  rule: { name: string; type: string };
}

// No test here ever clicks "Check document", so no LLM call is possible.

test.describe("with the template endpoints", () => {
  test.beforeEach(async ({ request }) => {
    const { ok, status } = await templatesAvailable(request);
    test.skip(!ok, `GET /api/rules/templates returned ${status}: template endpoints not on this server`);
  });

  test("Add from template prefills the new-rule form", async ({ page, request }) => {
    const templates = (await (await request.get("/api/rules/templates")).json()) as ApiTemplate[];
    const pick = templates.find((t) => t.rule.type !== "llm");
    test.skip(!pick, "no non-LLM template to pick");
    if (!pick) return;

    await page.goto("/");
    await page.getByRole("button", { name: "Add from template" }).click();
    await page.getByRole("group", { name: "Rule templates" }).getByRole("button", { name: new RegExp(escapeRegExp(pick.label)) }).click();
    const form = page.getByRole("form", { name: "New rule" });
    await expect(form.getByText(`From template: ${pick.label}`)).toBeVisible();
    await expect(form.getByLabel("Name")).toHaveValue(pick.rule.name);
    await expect(form.getByLabel("Type")).toHaveValue(pick.rule.type);
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toBeHidden();
  });

  test("Load Sample Rules reports what was added and keeps AI rules disabled", async ({ page, request }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Load Sample Rules" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sample rules:" })).toHaveText(
      /Sample rules: \d+ added, \d+ already present/,
    );
    // Contract: the sample AI rule is created disabled
    await assertNoEnabledLlmRules(request);
  });
});

// Runs on any server: the browser's template requests are answered by the test, so the picker
// and the sample-load message are exercised even before the server ships the endpoints.
test("template picker and sample loading with mocked endpoints", async ({ page }) => {
  const template = {
    id: "e2e-markings",
    label: "E2E classification markings",
    description: "Flags classification markings",
    category: "security",
    in_sample_set: true,
    rule: {
      name: "E2E no markings",
      type: "forbidden_text",
      params: { pattern: "CONFIDENTIAL", is_regex: false, case_sensitive: true },
      severity: "medium",
      enabled: true,
    },
  };
  await page.route("**/api/rules/templates", (route) => route.fulfill({ json: [template] }));
  await page.route("**/api/rules/samples", (route) =>
    route.fulfill({ status: 201, json: { created: [], skipped: ["PII", "Acronyms"] } }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Add from template" }).click();
  await page.getByRole("group", { name: "Rule templates" }).getByRole("button", { name: /E2E classification markings/ }).click();
  const form = page.getByRole("form", { name: "New rule" });
  await expect(form.getByLabel("Name")).toHaveValue("E2E no markings");
  await expect(form.getByLabel("Pattern")).toHaveValue("CONFIDENTIAL");
  await expect(form.getByLabel("Severity")).toHaveValue("medium");
  await form.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Load Sample Rules" }).click();
  await expect(page.getByText("Sample rules: 0 added, 2 already present")).toBeVisible();
});

test("without the template endpoints the UI hides the template features", async ({ page, request }) => {
  const { ok, status } = await templatesAvailable(request);
  test.skip(ok, "template endpoints exist on this server");
  expect([404, 405]).toContain(status);

  await page.goto("/");
  await expect(page.getByText("Rule templates and sample rules are not available on this server.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add from template" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load Sample Rules" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ New rule" })).toBeEnabled();
});
