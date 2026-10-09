// Renders PNG app icons and the social preview image from SVG using Chromium.
// Usage: node scripts/render-icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage();
const icon = readFileSync("public/icons/icon.svg", "utf8");
const maskable = readFileSync("public/icons/icon-maskable.svg", "utf8");
async function shot(svg, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: false });
}
await shot(icon, 192, "public/icons/icon-192.png");
await shot(icon, 512, "public/icons/icon-512.png");
await shot(icon, 180, "public/icons/apple-touch-icon.png");
await shot(maskable, 512, "public/icons/icon-maskable-512.png");

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Kindred Commons";
await page.setViewportSize({ width: 1200, height: 630 });
const fontCss = readFileSync("node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2").toString("base64");
await page.setContent(`<html><head><style>
@font-face{font-family:B;src:url(data:font/woff2;base64,${fontCss}) format('woff2');font-weight:200 800}
body{margin:0;width:1200px;height:630px;background:#13233a;color:#fff;font-family:B;display:flex;flex-direction:column;justify-content:space-between;padding:72px;box-sizing:border-box}
h1{font-size:84px;line-height:1.02;margin:0;font-weight:700;letter-spacing:-0.02em;max-width:900px}
.row{display:flex;align-items:center;gap:20px;font-size:40px;font-weight:700}
</style></head><body><div class="row">${icon.replace("<svg ", '<svg width="72" height="72" ')}<span>${brand}</span></div><h1>Help gets further when it's connected.</h1></body></html>`);
await page.screenshot({ path: "public/og.png" });
await browser.close();
console.log("icons rendered");
