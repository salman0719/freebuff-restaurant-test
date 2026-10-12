import { expect, test } from "@playwright/test";

test("homepage renders the starter heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /to get started/i })).toBeVisible();
});
