import process from "node:process";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { hashPassword } from "../../auth/src/password.js";
const db = new PrismaClient(), browser = await chromium.launch({ headless: true }), tag = `handover-ui-${randomUUID()}`, users = [], errors = [], results = [];
let workspaceId;
const password = "Local-handover-fixture-123!";
async function login(user) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 950 }, reducedMotion: "reduce" }), page = await context.newPage();
  page.setDefaultTimeout(25000); page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3200/login"); await page.getByLabel("Email").fill(user.email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Log in", exact: true }).click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
  return page;
}
async function layouts(page, screen, shell) {
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const theme of ["light", "dark"]) {
      if (shell) { if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click(); }
      else await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { window.scrollTo(0, 0); const main = document.querySelector(".hl-workspace-content"); if (main) main.scrollTop = 0; });
      const sizes = await page.evaluate(() => { const main = document.querySelector(".hl-workspace-content") ?? document.querySelector("main"); return { outer: document.documentElement.scrollWidth, main: main.clientWidth, scroll: main.scrollWidth }; });
      assert(sizes.outer <= width && sizes.scroll <= sizes.main + 1, `${screen} overflow at ${width}: ${JSON.stringify(sizes)}`);
      await page.screenshot({ path: `test-results/approved-ui/handover-${screen}-${width}-${theme}.png`, animations: "disabled", fullPage: true }); results.push({ screen, width, theme, ...sizes });
    }
  }
}
try {
  assert(!process.env.STRIPE_SECRET_KEY, "This check requires offline processor credentials.");
  const passwordHash = await hashPassword(password);
  for (const role of ["owner", "receiver"]) users.push(await db.user.create({ data: { email: `${tag}-${role}@example.test`, fullName: role === "owner" ? "Handover owner" : "Receiving operator", passwordHash } }));
  const now = new Date(), end = new Date(+now + 86400000);
  workspaceId = (await db.workspace.create({ data: { name: "Handover browser gym", status: "ACTIVE", location: { create: { name: "Gym", timezone: "America/Vancouver" } }, stripeSettings: { create: { stripeAccountId: `acct_${tag}` } }, migration: { create: { stage: "COMPLETE", nextOwnerAction: "Ready", flowstateResponsibility: "Ready", ownerReviewAcknowledgedAt: now, ownerReviewAcknowledgedByUserId: users[0].id, operationallyReadyAt: now, operationallyReadyByUserId: users[0].id } } } })).id;
  await db.workspaceUser.create({ data: { workspaceId, userId: users[0].id, role: "OWNER" } });
  const member = await db.member.create({ data: { workspaceId, userId: users[1].id, fullName: "Fixture member" } });
  const payer = await db.financialAccount.create({ data: { workspaceId, userId: users[1].id, memberId: member.id, stripeAccountId: `acct_${tag}`, stripeCustomerId: `cus_${tag}` } });
  const product = await db.punchCardProduct.create({ data: { workspaceId, name: "Accepted ten classes", punchesIncluded: 10, priceCents: 10000 } });
  await db.memberPunchCard.create({ data: { workspaceId, memberId: member.id, punchCardProductId: product.id, originalPunches: 10, remainingPunches: 4, purchasePriceCents: 10000, acceptedTerms: { version: 1, priceCents: 10000, currency: "cad", originalPunches: 10, restrictionMode: "GENERAL", programIds: [], lateCancellationConsumesPunch: true, noShowConsumesPunch: true, capturedAt: now.toISOString() } } });
  await db.accountCredit.create({ data: { workspaceId, memberId: member.id, payerAccountId: payer.id, originalAmountCents: 1800, remainingAmountCents: 1800, currency: "cad" } });
  await db.workspaceOffboarding.create({ data: { workspaceId, requestedByUserId: users[0].id, accessEndsAt: end, retentionUntil: new Date(+end + 365 * 86400000), retentionReason: "Fixture retention plan", recordsContact: "Fixture owner" } });
  await mkdir("test-results/approved-ui", { recursive: true });
  const owner = await login(users[0]); await owner.goto("http://localhost:3200/dashboard/settings/data/handover");
  await owner.getByLabel("Receiving gym or service", { exact: true }).fill("Receiving gym service"); await owner.getByLabel("Named receiving account ID", { exact: true }).fill(users[1].id); await owner.getByLabel("Signed handover agreement reference", { exact: true }).fill("Fixture signed agreement"); await owner.getByLabel("Payer authority evidence reference", { exact: true }).fill("Fixture payer reauthorization agreement");
  await owner.getByRole("checkbox").check(); await owner.getByRole("button", { name: "Prepare handover", exact: true }).click();
  await owner.getByRole("link", { name: "Open the receiving account’s review", exact: true }).waitFor();
  const handover = await db.workspaceBillingHandover.findFirstOrThrow({ where: { workspaceId } }); assert.equal(handover.state, "DRAFT");
  await layouts(owner, "owner", true);
  const receiver = await login(users[1]); await receiver.goto(`http://localhost:3200/billing-handover/${handover.id}`); await receiver.getByRole("heading", { name: "Billing handover review", exact: true }).waitFor();
  assert.match(await receiver.locator("main").innerText(), /CAD\s*18\.00/); assert.match(await receiver.locator("main").innerText(), /4 classes remaining/);
  await receiver.getByLabel("My acceptance receipt or agreement reference", { exact: true }).fill("Fixture receiver acknowledgement"); await receiver.getByRole("checkbox").check(); await receiver.getByRole("button", { name: "Accept this handover", exact: true }).click();
  await receiver.getByText(/The named receiver accepted this snapshot/).waitFor();
  assert((await db.workspaceBillingHandover.findUniqueOrThrow({ where: { id: handover.id } })).receiverAcceptedAt);
  await layouts(receiver, "receiver", false);
  assert.deepEqual(errors, []); await writeFile("test-results/approved-ui/handover-results.json", JSON.stringify({ results, errors }, null, 2));
  console.log(`Owner prepare and named receiver acceptance passed; ${results.length} layouts, no browser errors or provider calls.`);
} finally {
  if (workspaceId) {
    await db.workspaceOffboarding.deleteMany({ where: { workspaceId } }); await db.memberPunchCard.deleteMany({ where: { workspaceId } }); await db.accountCredit.deleteMany({ where: { workspaceId } }); await db.financialAccount.deleteMany({ where: { workspaceId } }); await db.workspace.delete({ where: { id: workspaceId } });
  }
  await db.authSession.deleteMany({ where: { userId: { in: users.map(user => user.id) } } }); await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  await browser.close(); await db.$disconnect();
}
