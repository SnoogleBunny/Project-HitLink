import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const fixture = JSON.parse(await readFile("test-results/retention-browser-fixture.json", "utf8"));
const browser = await chromium.launch({ headless: true }), errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 950 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(20000); page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3200/login"); await page.getByLabel("Email").fill(fixture.email); await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
  await page.goto(`http://localhost:3200/records/${fixture.caseId}`); await page.getByRole("heading", { name: "Retained records", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Remove this gym’s database records" }).count(), 0);
  const hold = page.locator("form").filter({ has: page.getByRole("button", { name: "Place records on hold", exact: true }) });
  await hold.getByLabel("Hold reason", { exact: true }).fill("Browser check: temporary review hold on disposable records fixture.");
  await hold.getByRole("checkbox").check(); await hold.getByRole("button", { name: "Place records on hold", exact: true }).click();
  await page.getByText("On hold: Browser check: temporary review hold on disposable records fixture.", { exact: true }).waitFor();
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; localStorage.setItem("hitlink-theme", theme); }, theme);
      await page.evaluate(() => document.fonts.ready);
      const sizes = await page.evaluate(() => ({ outer: document.documentElement.scrollWidth, width: innerWidth, form: [...document.querySelectorAll("form")].map(node => ({ width: node.clientWidth, scroll: node.scrollWidth })) }));
      await page.screenshot({ path: `test-results/approved-ui/retention-${width}-${theme}.png`, animations: "disabled", fullPage: true });
      results.push({ width, theme, ...sizes });
    }
  }
  assert.deepEqual(errors, []);
  await writeFile("test-results/approved-ui/retention-results.json", JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }));
} finally { await browser.close(); }
