// Dev helper: full-page screenshots at desktop + phone widths, flags horizontal overflow.
// Usage: PW_CHROMIUM_PATH=... node scripts/screenshot.mjs http://localhost:3000 / /events
import { mkdirSync } from "node:fs"; mkdirSync("screenshots", { recursive: true });
import { chromium } from "@playwright/test";
const [,, base, ...paths] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
for (const [w,h,tag] of [[1366,900,"d"],[390,844,"m"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    const name = (p === "/" ? "home" : p.replace(/\W+/g, "_")) + "_" + tag;
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) console.log("HORIZONTAL OVERFLOW", p, tag);
  }
  await page.close();
}
await browser.close();
