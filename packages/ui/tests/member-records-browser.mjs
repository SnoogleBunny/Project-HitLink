import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PrismaClient(), browser = await chromium.launch({ headless: true });
const workspaceId = "demo-workspace-flowstate", exportIds = [], results = [], errors = [];
let createdAccount;
async function login(origin, email, password) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 950 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.locator(".hl-workspace-shell").waitFor();
  return page;
}
async function verifyDownload(page, panel, expectedScope) {
  const id = await panel.locator('input[name="requestId"]').inputValue(); exportIds.push(id);
  await panel.getByRole("button", { name: `Prepare ${expectedScope.toLowerCase()} archive`, exact: true }).click();
  await panel.getByRole("link", { name: "Download archive", exact: true }).waitFor();
  const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("link", { name: "Download archive", exact: true }).click()]);
  const bytes = await readFile(await download.path());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const source = JSON.parse(gunzipSync(bytes).toString("utf8"));
  assert.equal(source.manifest.scope, expectedScope);
  assert.equal(source.manifest.workspaceId, workspaceId);
  assert(source.dictionary && source.csv && source.tables && source.files);
  assert(!Object.keys(source.tables).some(name => name.startsWith("Coaching")));
  assert.equal(await panel.locator("code").innerText(), checksum);
  for (const file of source.files) assert.equal(createHash("sha256").update(Buffer.from(file.base64, "base64")).digest("hex"), file.sha256);
  await panel.getByLabel("Archive SHA-256", { exact: true }).fill(checksum);
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Confirm receipt", exact: true }).click();
  await panel.getByText("Receipt confirmed. Keep your downloaded copy in a secure place.").waitFor();
  assert((await db.memberDataExport.findUniqueOrThrow({ where: { id } })).receiptConfirmedAt);
}
async function layouts(page, screen) {
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const theme of ["light", "dark"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".hl-workspace-content").evaluate(node => { node.scrollTop = 0; });
      const sizes = await page.evaluate(() => {
        const main = document.querySelector(".hl-workspace-content");
        return { outer: document.documentElement.scrollWidth, main: main.clientWidth, scroll: main.scrollWidth };
      });
      assert(sizes.outer <= width && sizes.scroll <= sizes.main + 1, `${screen} overflow ${width}: ${JSON.stringify(sizes)}`);
      await page.screenshot({ path: `test-results/approved-ui/records-${screen}-${width}-${theme}.png`, animations: "disabled", fullPage: true });
      results.push({ screen, width, theme, ...sizes });
    }
  }
}
try {
  const existing = await db.financialAccount.findUnique({ where: { workspaceId_userId: { workspaceId, userId: "demo-user-member" } } });
  if (!existing) createdAccount = await db.financialAccount.create({ data: { workspaceId, userId: "demo-user-member", memberId: "demo-member-record" } });
  await mkdir("test-results/approved-ui", { recursive: true });
  const member = await login("http://localhost:3201", "demo-member@flowstate.local", "MemberPass123!");
  await member.goto("http://localhost:3201/app/account/records");
  await member.getByRole("heading", { name: "Your records", exact: true }).waitFor();
  const memberPanel = member.locator("section.member-card").filter({ has: member.getByRole("button", { name: "Prepare member archive", exact: true }) });
  const payerPanel = member.locator("section.member-card").filter({ has: member.getByRole("button", { name: "Prepare payer archive", exact: true }) });
  await verifyDownload(member, memberPanel, "MEMBER");
  await verifyDownload(member, payerPanel, "PAYER");
  await layouts(member, "member");
  const owner = await login("http://localhost:3200", "demo-owner@flowstate.local", "DemoPass123!");
  await owner.goto("http://localhost:3200/dashboard/members/demo-member-record/records");
  await owner.getByRole("button", { name: "Prepare member archive", exact: true }).waitFor();
  assert.equal(await owner.getByText("Receipt confirmed. Keep your downloaded copy in a secure place.").count(), 2);
  await layouts(owner, "owner");
  assert.deepEqual(errors, []);
  await writeFile("test-results/approved-ui/records-results.json", JSON.stringify({ results, downloadScopes: ["MEMBER", "PAYER"], errors }, null, 2));
  console.log(`Member/payer downloads and receipts passed; ${results.length} layouts, no browser errors.`);
} finally {
  await db.workspaceDataEvent.deleteMany({ where: { workspaceId, OR: exportIds.map(id => ({ metadata: { path: ["exportId"], equals: id } })) } });
  await db.memberDataExport.deleteMany({ where: { id: { in: exportIds } } });
  if (createdAccount) await db.financialAccount.delete({ where: { id: createdAccount.id } });
  await browser.close(); await db.$disconnect();
}
