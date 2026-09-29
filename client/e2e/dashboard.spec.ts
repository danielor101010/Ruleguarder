import { expect, test, type Page } from "@playwright/test";
import { buildDocx } from "./docx";
import { assertNoEnabledLlmRules, cleanUp, DOCX_MIME, uniqueMarker } from "./helpers";

// Non-LLM rules only (forbidden_text): these tests never reach the Gemini API.

let marker = "";

test.beforeEach(() => {
  marker = uniqueMarker();
});

test.afterEach(async ({ request }) => {
  await cleanUp(request, marker);
});

async function createForbiddenTextRule(page: Page, name: string, pattern: string) {
  await page.getByRole("button", { name: "+ New rule" }).click();
  const form = page.getByRole("form", { name: "New rule" });
  await form.getByLabel("Type").selectOption("forbidden_text");
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Pattern").fill(pattern);
  await form.getByLabel("Severity").selectOption("high");
  await form.getByRole("button", { name: "Save rule" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("list", { name: "Rules list" }).getByText(name)).toBeVisible();
}

async function uploadAndCheck(page: Page, request: Parameters<typeof assertNoEnabledLlmRules>[0]) {
  await page.getByTestId("upload-input").setInputFiles({
    name: `${marker}.docx`,
    mimeType: DOCX_MIME,
    buffer: await buildDocx(marker),
  });
  await expect(page.getByRole("heading", { name: `${marker}.docx` })).toBeVisible();
  await expect(page.getByText(`The detection range is ${marker} km`)).toBeVisible();

  await assertNoEnabledLlmRules(request);
  await page.getByRole("button", { name: "Check document" }).click();
}

test("create a rule, upload, check, then jump from a violation to its paragraph", async ({ page, request }) => {
  const ruleName = `No ${marker}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ruleguarder" })).toBeVisible();

  await createForbiddenTextRule(page, ruleName, marker);
  await uploadAndCheck(page, request);

  // The exact span is highlighted with the rule's severity
  const mark = page.locator("mark[data-violation]", { hasText: marker });
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute("data-severity", "high");
  await expect(page.getByRole("list", { name: "Violations by severity" })).toContainText("High");

  // Clicking the violation scrolls to the paragraph, flashes it (~1.5 s) and keeps it active
  const card = page.getByRole("list", { name: "Violations list" }).getByRole("button", { name: new RegExp(ruleName) });
  const paragraph = page.locator("[data-block-id]", { has: mark });
  await expect(paragraph).not.toBeInViewport(); // below the fold (filler paragraphs)
  await card.click();
  await expect(paragraph).toHaveAttribute("data-flash", "true");
  await expect(paragraph).toHaveAttribute("data-active", "true");
  await expect(paragraph).toBeInViewport();
  await expect(card).toHaveAttribute("aria-current", "true");

  await expect(paragraph).not.toHaveAttribute("data-flash", "true", { timeout: 5_000 });
  await expect(paragraph).toHaveAttribute("data-active", "true");
});

test("clicking a highlight selects its violation; severity chips filter", async ({ page, request }) => {
  const ruleName = `Flag ${marker}`;
  await page.goto("/");
  await createForbiddenTextRule(page, ruleName, marker);
  await uploadAndCheck(page, request);

  const mark = page.locator("mark[data-violation]", { hasText: marker });
  await mark.click();
  const card = page.getByRole("list", { name: "Violations list" }).getByRole("button", { name: new RegExp(ruleName) });
  await expect(card).toHaveAttribute("aria-current", "true");

  const highChip = page.getByRole("group", { name: "Filter by severity" }).getByRole("button", { name: /^High \d+$/ });
  await highChip.click();
  await expect(highChip).toHaveAttribute("aria-pressed", "false");
  await expect(card).toBeHidden();
  await expect(mark).toBeHidden();
  await highChip.click();
  await expect(card).toBeVisible();
});
