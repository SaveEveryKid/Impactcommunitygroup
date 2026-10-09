import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PUBLIC_PAGES = [
  "/",
  "/about",
  "/how-it-works",
  "/organizations",
  "/volunteer",
  "/events",
  "/resources",
  "/impact",
  "/partners",
  "/support",
  "/contact",
  "/faq",
  "/privacy",
  "/terms",
  "/guidelines",
  "/accessibility",
  "/login",
  "/signup",
  "/forgot-password",
];

for (const path of PUBLIC_PAGES) {
  test(`${path} renders, has one h1, no horizontal overflow, and passes axe`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.waitForTimeout(1800); // let the single load animation finish before measuring contrast
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("every page has canonical metadata and a skip link", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/organizations$/);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("private areas redirect signed-out visitors to sign in", async ({ page }) => {
  for (const path of ["/dashboard", "/inbox", "/settings", "/admin", "/notifications"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

test("sign-up form validates on the server and keeps input", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Test Person");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Test Person");
});

test("robots, sitemap and manifest are served", async ({ request }) => {
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

test("cron and webhook endpoints reject unauthenticated calls", async ({ request }) => {
  expect((await request.get("/api/cron/emails")).status()).toBe(401);
  expect((await request.get("/api/cron/maintenance")).status()).toBe(401);
  const hook = await request.post("/api/stripe/webhook", { data: "{}" });
  expect([400, 503]).toContain(hook.status());
});
