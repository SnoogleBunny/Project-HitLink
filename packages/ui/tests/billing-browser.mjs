import process from "node:process";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const db = new PrismaClient(), browser = await chromium.launch({ headless: true });
const origin = process.argv[2] || "http://localhost:4100", workspaceId = "demo-workspace-flowstate", marker = `billing-ui-${randomUUID()}`;
let account, createdAccount = false, payment, issuedOperation;
const results = [];
try {
  account = await db.financialAccount.findUnique({ where: { workspaceId_userId: { workspaceId, userId: "demo-user-member" } } });
  if (!account) { account = await db.financialAccount.create({ data: { workspaceId, userId: "demo-user-member", memberId: "demo-member-record", stripeAccountId: "acct_browser_fixture", stripeCustomerId: "cus_browser_fixture" } }); createdAccount = true; }
  payment = await db.payment.create({ data: { workspaceId, memberId: account.memberId, payerAccountId: account.id, status: "SUCCEEDED", amountCents: 12900, currency: "cad", stripePaymentIntentId: `pi_${marker}` } });
  const page = await browser.newPage({ viewport: { width: 1365, height: 950 }, reducedMotion: "reduce" });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/login`); await page.getByLabel("Email").fill("demo-owner@flowstate.local"); await page.getByLabel("Password", { exact: true }).fill("DemoPass123!"); await page.getByRole("button", { name: "Log in", exact: true }).click(); await page.locator(".hl-workspace-shell").waitFor();
  await page.goto(`${origin}/dashboard/billing/refunds/${payment.id}`); await page.getByLabel("Amount", { exact: true }).fill("25.50"); await page.getByLabel("Unused access").selectOption("RETAIN_ACCESS"); await page.getByLabel("Reason").fill(marker); await page.getByRole("button", { name: "Review refund", exact: true }).click();
  await page.getByRole("heading", { name: "Review refund", exact: true }).waitFor();
  assert.match(await page.locator(".hl-adjustment-form").innerText(), /CAD\s*25\.50/);
  assert.match(await page.locator(".hl-adjustment-form").innerText(), /remain available/);
  assert.equal(await db.refund.count({ where: { paymentId: payment.id } }), 0);
  await mkdir("test-results/approved-ui", { recursive: true });
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const theme of ["light", "dark"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
      await page.evaluate(() => document.fonts.ready);
      const sizes = await page.evaluate(() => {
        const main = document.querySelector(".hl-workspace-content");
        const money = [...document.querySelectorAll(".hl-money")].map(node => ({ text: node.textContent, display: getComputedStyle(node).display, spacing: getComputedStyle(node).letterSpacing, width: node.getBoundingClientRect().width }));
        return { outer: document.documentElement.scrollWidth, main: main.clientWidth, scroll: main.scrollWidth, money };
      });
      assert(sizes.outer <= width && sizes.scroll <= sizes.main + 1, `Billing overflow ${width}`);
      assert(sizes.money.every(item => item.text.includes("\u202f") && item.spacing === "normal" && item.width < 140));
      await page.screenshot({ path: `test-results/approved-ui/refund-${width}-${theme}.png`, animations: "disabled" });
      results.push({ width, theme, ...sizes });
    }
  }
  await page.goto(`${origin}/dashboard/billing/credits/new?account=${account.id}`);
  await page.getByLabel("Amount", { exact: true }).fill("30.00"); await page.getByLabel("Reason").fill(marker); await page.getByRole("button", { name: "Review credit", exact: true }).click(); await page.getByRole("heading", { name: "Review credit", exact: true }).waitFor();
  await page.getByRole("button", { name: "Confirm credit", exact: true }).click(); await page.waitForURL(/\/billing\/operations\//);
  issuedOperation = await db.financialOperation.findUniqueOrThrow({ where: { id: page.url().split("/operations/")[1] } });
  assert.equal(issuedOperation.status, "SUCCEEDED");
  assert.equal((await db.accountCredit.findUniqueOrThrow({ where: { id: issuedOperation.targetId } })).remainingAmountCents, 3000);
  assert.match(await page.locator("main").innerText(), /no expiry/);
  await page.getByRole("link", { name: "Apply to next membership invoice" }).click(); await page.locator(".hl-page-heading h1").waitFor();
  assert.equal(await db.financialOperation.count({ where: { workspaceId, targetId: issuedOperation.targetId, kind: "APPLY_CREDIT" } }), 0);
  await page.goto(`${origin}/dashboard/billing?error=Payment%20retry%20needs%20attention`); await page.getByRole("alert").getByText("Payment retry needs attention").waitFor();
  assert.deepEqual(errors, []);
  await writeFile("test-results/approved-ui/billing-results.json", JSON.stringify(results, null, 2));
  console.log(`Billing review and credit issue passed; ${results.length} layouts, no processor requests.`);
} finally {
  if (issuedOperation) { await db.financialOperationEvent.deleteMany({ where: { operationId: issuedOperation.id } }); await db.financialOperation.delete({ where: { id: issuedOperation.id } }); await db.accountCredit.delete({ where: { id: issuedOperation.targetId } }); }
  if (payment) await db.payment.delete({ where: { id: payment.id } });
  if (createdAccount) await db.financialAccount.delete({ where: { id: account.id } });
  await browser.close(); await db.$disconnect();
}
