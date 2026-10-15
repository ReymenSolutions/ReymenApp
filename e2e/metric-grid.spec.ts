import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Exercise the shipped container-query rules without a database or a fixture route.
const css = readFileSync(resolve("src/app/globals.css"), "utf8").split("/* Use the section width,")[1];
for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`metric rows fill solitary cells at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const grids = [2, 3, 4, 5, 6].flatMap(columns => [1, 3, 5, 7, 11].map(count =>
      `<div class="metric-grid-container"><div class="metric-grid" data-columns="${columns}">${Array.from({ length: count }, () => '<div>Metric</div>').join("")}</div></div>`
    )).join("");
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:16px}/* Use the section width,${css}</style>${grids}`);
    const layout = await page.locator(".metric-grid").evaluateAll(grids => grids.map(grid => {
      const children = [...grid.children];
      const last = children.at(-1)!.getBoundingClientRect();
      const alone = children.filter(child => Math.abs(child.getBoundingClientRect().top - last.top) < 1).length === 1;
      const width = grid.getBoundingClientRect().width;
      return { alone, fills: Math.abs(last.width - width) < 1, overflow: grid.scrollWidth > width + 1 };
    }));
    expect(layout.every(row => !row.overflow && (!row.alone || row.fills))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
test("action cards stay full-width in a narrow section even on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`<style>/* Use the section width,${css}</style><div class="metric-grid-container" style="width:320px"><div class="metric-grid" data-columns="2" data-density="comfortable"><div>Card</div><div>Card</div><div>Card</div></div></div>`);
  const widths = await page.locator('.metric-grid > div').evaluateAll(items => items.map(el => el.getBoundingClientRect().width));
  expect(widths).toEqual([320, 320, 320]);
});
