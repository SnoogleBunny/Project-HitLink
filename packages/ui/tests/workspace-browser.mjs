import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const output = path.resolve("test-results/approved-ui");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const role of ["owner", "member"]) {
    const origin =
      role === "owner" ? (process.argv[2] || "http://localhost:3200") : "http://localhost:3201";
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1048, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/login`);
    await page
      .getByLabel("Email")
      .fill(
        role === "owner"
          ? "demo-owner@flowstate.local"
          : "demo-member@flowstate.local",
      );
    await page
      .getByLabel("Password", { exact: true })
      .fill(role === "owner" ? "DemoPass123!" : "MemberPass123!");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.locator(".hl-workspace-shell").waitFor();
    const routes =
      role === "owner"
        ? ["/dashboard", "/dashboard/billing", "/dashboard/members"]
        : ["/app/schedule", "/app/membership", "/app/billing"];
    for (const route of routes) {
      await page.goto(origin + route);
      await page.locator(".hl-route h1").waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const width of [1048, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["light", "dark"]) {
          const current = await page.locator("html").getAttribute("data-theme");
          if (current !== theme)
            await page
              .getByRole("button", { name: `Switch to ${theme} mode` })
              .click();
          await page.waitForFunction(
            (expected) => document.documentElement.dataset.theme === expected,
            theme,
          );
          await page.waitForFunction(
            (expected) =>
              getComputedStyle(document.querySelector(".hl-workspace-shell"))
                .backgroundColor === expected,
            theme === "dark" ? "rgb(44, 45, 50)" : "rgb(243, 243, 244)",
          );
          await page.mouse.move(0, 0);
          const measurements = await page.evaluate(() => {
            const shell = document.querySelector(".hl-workspace-shell");
            const main = document.querySelector(".hl-workspace-content");
            const title = document.querySelector(".hl-page-heading h1");
            return {
              viewport: innerWidth,
              outerWidth: document.documentElement.scrollWidth,
              theme: document.documentElement.dataset.theme,
              contentWidth: main.clientWidth,
              contentScrollWidth: main.scrollWidth,
              shellHeight: shell.getBoundingClientRect().height,
              bodyFont: getComputedStyle(document.body).fontFamily,
              titleFont: getComputedStyle(title).fontFamily,
              badges: [
                ...document.querySelectorAll(
                  ".status-pill,.member-status-pill,.hl-badge",
                ),
              ]
                .slice(0, 8)
                .map((item) => item.getBoundingClientRect().height),
            };
          });
          assert(
            measurements.outerWidth <= width,
            `${role} ${route} outer overflow at ${width}`,
          );
          assert(
            measurements.contentScrollWidth <= measurements.contentWidth + 1,
            `${role} ${route} content overflow at ${width}: ${JSON.stringify(measurements)}`,
          );
          assert.equal(measurements.shellHeight, 900);
          assert.match(measurements.bodyFont, /sourceSans/i);
          assert.match(measurements.titleFont, /barlow/i);
          results.push({ role, route, width, theme, ...measurements });
          if (route.endsWith("billing"))
            await page.screenshot({
              path: path.join(output, `${role}-billing-${width}-${theme}.png`),
            });
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    const trigger = page.getByRole("button", {
      name: "Open workspace menu",
      exact: true,
    });
    await trigger.click();
    const menu = page.getByRole("dialog", { name: "Workspace menu" });
    await menu.waitFor();
    assert(
      await menu.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      "Opening menu moves focus inside",
    );
    await page.keyboard.press("Shift+Tab");
    assert(
      await menu.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      "Native modal contains keyboard focus",
    );
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assert(
      await trigger.evaluate((element) => element === document.activeElement),
      "Escape restores trigger focus",
    );
    await trigger.click();
    await page.setViewportSize({ width: 1048, height: 900 });
    await menu.waitFor({ state: "hidden" });
    results.push({
      role,
      phoneMenuFocus: "passed",
      resizeClosesMenu: "passed",
    });

    // Theme changes must preserve an actual unfinished form and scroll position.
    if (role === "owner") {
      await page.goto(`${origin}/dashboard/members`);
      await page.locator(".hl-route h1").waitFor();
      const input = page
        .locator(
          'main input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
        )
        .first();
      await input.fill("Unsaved theme check");
      await input.evaluate((element) => {
        window.uiDraftElement = element;
        document.querySelector("main").scrollTop = 160;
      });
      const scroll = await page
        .locator("main")
        .evaluate((element) => element.scrollTop);
      await page.locator(".hl-theme-button").click();
      assert.equal(await input.inputValue(), "Unsaved theme check");
      assert(
        await input.evaluate((element) => element === window.uiDraftElement),
      );
      assert.equal(
        await page.locator("main").evaluate((element) => element.scrollTop),
        scroll,
      );
      const savedTheme = await page.locator("html").getAttribute("data-theme");
      await page.reload();
      await page.locator(".hl-route h1").waitFor();
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        savedTheme,
      );
      results.push({
        role,
        themePreservesDraftAndScroll: "passed",
        themePersistsReload: "passed",
      });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify({ checks: results.length, output }));
} finally {
  await browser.close();
}
