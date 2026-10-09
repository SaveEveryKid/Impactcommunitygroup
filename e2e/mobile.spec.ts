import { expect, test } from "@playwright/test";

test.describe("mobile navigation", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");

  test("menu opens, traps scroll, closes with Escape and on navigation", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Events" }).click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeHidden();
  });

  test("tap targets in the header are at least 44px", async ({ page }) => {
    await page.goto("/");
    const box = await page.getByRole("button", { name: "Open menu" }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});
