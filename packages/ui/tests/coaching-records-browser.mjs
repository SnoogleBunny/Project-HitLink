import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import process from "node:process";
const db = new PrismaClient({ log: [] });
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("hitlink_implementation_test")) throw new Error("Use the isolated shared QA database only.");
const browser = await chromium.launch({ headless: true });
const prefix = `coaching-browser-${randomUUID()}`, workspaceId = "demo-workspace-flowstate", results = [], errors = [];
let member, originalDob, program, enrollment, payerEnrollment, coach, payingUser, grant;
async function login(origin, email, password) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/login`); await page.getByLabel("Email").fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click(); await page.locator(".hl-workspace-shell").waitFor(); return page;
}
async function layouts(page, name) {
  for (const width of [1365, 390, 320]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 1000 });
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
    await page.evaluate(() => document.fonts.ready);
    const sizes = await page.evaluate(() => { const main = document.querySelector(".hl-workspace-content"); return { outer: document.documentElement.scrollWidth, main: main.clientWidth, scroll: main.scrollWidth }; });
    assert(sizes.outer <= width && sizes.scroll <= sizes.main + 1, `${name} overflow${width}: ${JSON.stringify(sizes)}`);
    await page.screenshot({ path: `test-results/approved-ui/coaching-${name}-${width}-${theme}.png`, fullPage: true, animations: "disabled" }); results.push({ name, width, theme });
  }
}
async function submit(page, kind, fill) {
  const form = page.locator(`form:has(input[name="kind"][value="${kind}"])`).first();
  if (fill) await fill(form);
  await form.getByRole("button").click(); await page.getByText("Saved.", { exact: true }).waitFor();
}
try {
  await mkdir("test-results/approved-ui", { recursive: true });
  const owner = await db.workspaceUser.findFirstOrThrow({ where: { workspaceId, role: "OWNER", user: { email: "demo-owner@flowstate.local" } }, include: { user: true } });
  member = await db.member.findFirstOrThrow({ where: { workspaceId, user: { email: "demo-member@flowstate.local" } } }); originalDob = member.dateOfBirth;
  await db.member.update({ where: { id: member.id }, data: { dateOfBirth: null } });
  const clientPage = await login("http://localhost:3201", "demo-member@flowstate.local", "MemberPass123!");
  await clientPage.goto("http://localhost:3201/app/coaching"); await clientPage.getByRole("heading", { name: "My coaching", exact: true }).waitFor();
  assert.equal(await clientPage.getByText("Application error", { exact: false }).count(), 0);
  await db.member.update({ where: { id: member.id }, data: { dateOfBirth: new Date("1990-01-01") } });
  coach = await db.user.create({ data: { email: `${prefix}-coach@example.test`, fullName: "QA Coach", passwordHash: owner.user.passwordHash, workspaceUsers: { create: { workspaceId, role: "COACH" } } }, include: { workspaceUsers: true } });
  payingUser = await db.user.create({ data: { email: `${prefix}-payer@example.test`, fullName: "QA Payer", passwordHash: owner.user.passwordHash, workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } } } });
  const payingMember = await db.member.create({ data: { workspaceId, userId: payingUser.id, fullName: "QA Payer", dateOfBirth: new Date("1990-01-01"), status: "ACTIVE" } });
  program = await db.coachingProgram.create({ data: { workspaceId, name: "QA structured coaching", versions: { create: { number: 1, durationDays: 28, deliveryWeekdays: [0,1,2,3,4,5,6], responseHours: 48, goals: "Review a daily practice", milestones: ["Set first goal"], appointmentUnits: 2, priceCents: 10000, currency: "cad", terms: "One upfront payment. Review unused services at closure." } } }, include: { versions: true } });
  const now = new Date(), day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now), date = new Date(`${day}T00:00:00Z`);
  const fields = { workspaceId, memberId: member.id, programVersionId: program.versions[0].id, startsOn: date, endsOn: new Date(date.getTime() + 27 * 86400000), timezone: "America/Vancouver", currentCoachWorkspaceUserId: coach.workspaceUsers[0].id, caseOwnerWorkspaceUserId: owner.id, contactVerifiedAt: now, acceptedAt: now, historyFromDate: date };
  enrollment = await db.coachingEnrollment.create({ data: { ...fields, paymentState: "PAID" } });
  const privateNote = await db.coachingPrivateNote.create({ data: { enrollmentId: enrollment.id, authorWorkspaceUserId: coach.workspaceUsers[0].id, localDate: date, body: "PRIVATE_BROWSER_SENTINEL" } });
  await db.coachingIntake.create({ data: { enrollmentId: enrollment.id, content: "Client's own intake" } });
  await db.coachingDailyNote.create({ data: { enrollmentId: enrollment.id, authorWorkspaceUserId: coach.workspaceUsers[0].id, localDate: date, draftBody: "DRAFT_BROWSER_SENTINEL", status: "PUBLISHED", publishedAt: now, revisions: { create: { number: 1, authorWorkspaceUserId: coach.workspaceUsers[0].id, body: "Published practice note" } } } });
  grant = await db.coachingRecordReviewGrant.create({ data: { workspaceId, enrollmentId: enrollment.id, privateNoteIds: [privateNote.id], reviewerWorkspaceUserId: owner.id, authorWorkspaceUserId: coach.workspaceUsers[0].id, grantedByOwnerWorkspaceUserId: owner.id, purpose: "Client-requested review of one exact record", expiresAt: new Date(Date.now() + 3600000) } });
  payerEnrollment = await db.coachingEnrollment.create({ data: { ...fields, paymentState: "UNPAID" } });
  const payerGrant = await db.coachingPayerGrant.create({ data: { workspaceId, enrollmentId: payerEnrollment.id, payerUserId: payingUser.id, payerMemberId: payingMember.id, clientUserId: member.userId, clientConsentedAt: now, acceptedTerms: { beneficiaryMemberId: member.id, programVersionId: program.versions[0].id, amountCents: 10000, currency: "cad", terms: program.versions[0].terms } } });
  await db.coachingEnrollment.update({ where: { id: payerEnrollment.id }, data: { currentPayerGrantId: payerGrant.id } });
  const ownerPage = await login("http://localhost:3200", "demo-owner@flowstate.local", "DemoPass123!");
  await ownerPage.goto(`http://localhost:3200/dashboard/coaching/${enrollment.id}`); await ownerPage.getByRole("heading", { name: "Record corrections and review" }).waitFor();
  assert(!(await ownerPage.locator("body").innerText()).includes("PRIVATE_BROWSER_SENTINEL")); await layouts(ownerPage, "owner");
  await clientPage.goto(`http://localhost:3201/app/coaching/${enrollment.id}`); await clientPage.getByRole("heading", { name: "My program records" }).waitFor();
  assert(!(await clientPage.locator("body").innerText()).includes("PRIVATE_BROWSER_SENTINEL")); await layouts(clientPage, "client");
  const [download] = await Promise.all([clientPage.waitForEvent("download"), clientPage.getByRole("link", { name: "Download my program archive" }).click()]);
  const archive = await readFile(await download.path(), "utf8"); assert(archive.includes("Client's own intake") && !archive.includes("PRIVATE_BROWSER_SENTINEL") && !archive.includes("DRAFT_BROWSER_SENTINEL"));
  await submit(clientPage, "approveRecordReview", form => form.getByRole("checkbox").check());
  const coachPage = await login("http://localhost:3200", coach.email, "DemoPass123!");
  await coachPage.goto(`http://localhost:3200/dashboard/coaching/reviews/${grant.id}`); await submit(coachPage, "approveRecordReview", form => form.getByRole("checkbox").check());
  await ownerPage.goto(`http://localhost:3200/dashboard/coaching/reviews/${grant.id}`); await layouts(ownerPage, "restricted-review");
  await ownerPage.getByRole("button", { name: "Open authorized records" }).click(); await ownerPage.getByText("PRIVATE_BROWSER_SENTINEL", { exact: true }).waitFor();
  assert.equal(await db.coachingRecordAccessEvent.count({ where: { reviewGrantId: grant.id, kind: "EXCEPTIONAL_PRIVATE_READ" } }), 1);
  await submit(ownerPage, "revokeRecordReview");
  const payerPage = await login("http://localhost:3201", payingUser.email, "DemoPass123!");
  await payerPage.goto(`http://localhost:3201/app/coaching/payments/${payerGrant.id}`); await payerPage.getByRole("heading", { name: "Coaching payment request", exact: true }).waitFor();
  await layouts(payerPage, "payer");
  await submit(payerPage, "sendPayerVerification");
  const verification = await db.notificationJob.findFirstOrThrow({ where: { workspaceId, context: { path: ["grantId"], equals: payerGrant.id } } });
  const code = verification.body.match(/request: ([a-f0-9]+)/)[1];
  await submit(payerPage, "verifyPayerContact", form => form.getByLabel("One-use email code").fill(code));
  await submit(payerPage, "acceptPayerTerms", form => form.getByRole("checkbox").check());
  await payerPage.getByRole("button", { name: "Continue to secure payment" }).waitFor();
  assert(!(await payerPage.locator("body").innerText()).includes("PRIVATE_BROWSER_SENTINEL"));
  assert.deepEqual(errors, []); await writeFile("test-results/approved-ui/coaching-records-results.json", JSON.stringify({ results, checks: ["gym-only page", "scoped archive", "triple-consent private review", "read audit", "payer verification and terms"], errors }, null, 2));
  console.log(`Coaching records and payer flows passed; ${results.length} layouts.`);
} finally {
  const enrollmentIds = [enrollment?.id, payerEnrollment?.id].filter(Boolean);
  await db.notificationJob.deleteMany({ where: { workspaceId, OR: [{ recipientEmail: { startsWith: prefix } }, { context: { path: ["enrollmentId"], array_contains: enrollmentIds } }] } });
  await db.coachingEnrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
  if (program) { await db.coachingProgramVersion.deleteMany({ where: { programId: program.id } }); await db.coachingProgram.delete({ where: { id: program.id } }); }
  if (member) await db.member.update({ where: { id: member.id }, data: { dateOfBirth: originalDob } });
  const users = [coach?.id, payingUser?.id].filter(Boolean);
  await db.member.deleteMany({ where: { workspaceId, userId: { in: users } } }); await db.workspaceUser.deleteMany({ where: { workspaceId, userId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } });
  await browser.close(); await db.$disconnect();
}
