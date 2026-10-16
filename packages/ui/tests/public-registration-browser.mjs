import { Buffer } from "node:buffer";
import process from "node:process";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { websiteOfferFromPlan } from "../../db/src/website.ts";
const db = new PrismaClient(), browser = await chromium.launch({ headless: true });
const origin = "http://localhost:3201", workspaceId = "demo-workspace-flowstate", marker = `registration-ui-${randomUUID()}`, emails = [ `${marker}-trial@example.test`, `${marker}-membership@example.test`, `${marker}-guardian@example.test` ], results = [];
let originalPublished, refreshedPublished, websiteId, fixtureDocumentId;
try {
  assert(!process.env.STRIPE_SECRET_KEY, "This browser check requires offline processor credentials");
  const site = await db.workspaceWebsite.findUniqueOrThrow({ where: { workspaceId } });
  const displayed = site.published?.offers?.find(item => item.visible);
  assert(site.publishedAt && displayed, "Publish a local demo offer before this check");
  const plan = await db.membershipPlan.findUniqueOrThrow({ where: { id: displayed.membershipPlanId }, include: { programRestrictions: true } });
  const offer = websiteOfferFromPlan(plan, displayed);
  originalPublished = site.published; websiteId = site.id;
  refreshedPublished = { ...site.published, offers: site.published.offers.map(item => item.id === offer.id ? offer : item) };
  await db.workspaceWebsite.update({ where: { id: websiteId }, data: { published: refreshedPublished } });
  const doc = await db.formDocument.create({ data: { workspaceId, name: `${marker} agreement`, formType: "MEMBERSHIP_AGREEMENT" } }); fixtureDocumentId = doc.id;
  const owner = await db.workspaceUser.findFirstOrThrow({ where: { workspaceId, role: "OWNER", isActive: true } });
  const existingPdf = await db.formVersion.findFirst({ select: { fileData: true } });
  const bytes = existingPdf?.fileData ?? Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
  const version = await db.formVersion.create({ data: { workspaceId, formDocumentId: doc.id, versionNumber: 1, fileName: "browser-test-agreement.pdf", mimeType: "application/pdf", fileSizeBytes: bytes.length, fileSha256: createHash("sha256").update(bytes).digest("hex"), fileData: bytes, uploadedByWorkspaceUserId: owner.id } });
  await db.formDocument.update({ where: { id: doc.id }, data: { currentVersionId: version.id } });
  await db.requiredFormAssignment.create({ data: { workspaceId, formDocumentId: doc.id, requirementTarget: "MEMBERSHIP_ACTIVATION" } });
  for (const kind of ["trial", "membership", "guardian"]) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const email = emails[kind === "trial" ? 0 : kind === "membership" ? 1 : 2], route = `/gym/${site.slug}/${kind === "trial" ? "trial" : `join/${offer.id}`}`;
    await page.goto(origin + route); await page.locator(".registration-card h1").waitFor();
    await mkdir("test-results/approved-ui", { recursive: true });
    for (const width of [1365, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(theme => { localStorage.setItem("hitlink-theme", theme); document.documentElement.dataset.theme = theme; }, theme);
        await page.evaluate(() => document.fonts.ready);
        const measurement = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll(".registration-form button")].map(item => ({ width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height, right: item.getBoundingClientRect().right })) }));
        assert(measurement.scroll <= width, `${kind} overflow ${width}`); assert(measurement.buttons.every(item => item.height >= 44 && item.right <= width), "Button sizing");
        await page.screenshot({ path: `test-results/approved-ui/registration-${kind}-${width}-${theme}.png`, animations: "disabled" }); results.push({ kind, theme, ...measurement });
      }
    }
    if (kind === "trial") {
      const options = await page.getByLabel("Trial class", { exact: true }).locator("option").evaluateAll(items => items.filter(item => item.value).map(item => item.value));
      assert(options.length, "A trial class is available"); await page.getByLabel("Trial class", { exact: true }).selectOption(options[0]);
    }
    if (kind === "guardian") {
      await context.addCookies([{ name: "hitlink_selected_member", value: "wrong-legacy-root", domain: "localhost", path: "/" }, { name: "hitlink_selected_member", value: "wrong-legacy-app", domain: "localhost", path: "/app" }]);
      await page.getByLabel("Who is joining?", { exact: true }).selectOption("child");
      await page.getByLabel("Child’s full name", { exact: true }).fill("Public guardian browser test");
      await page.getByLabel("Child’s date of birth", { exact: true }).fill("2016-01-01");
      await page.getByLabel("Your full name", { exact: true }).fill("Verified parent browser test");
      await page.getByLabel("Your relationship to the child", { exact: true }).fill("Parent");
    } else {
      await page.getByLabel("Your full name", { exact: true }).fill(`Public ${kind} browser test`); await page.getByLabel("Your date of birth").fill("1990-01-01");
    }
    await page.getByLabel("Your email").fill(email);
    await page.getByLabel("I agree to use these details", { exact: false }).check();
    assert.equal(await page.getByLabel("Send me gym news and offers. Optional.").isChecked(), false);
    await page.getByRole("button", { name: "Verify my email", exact: true }).click(); await Promise.race([page.getByLabel("Verification code").waitFor(), page.locator(".registration-error").waitFor().then(async () => { throw new Error(await page.locator(".registration-error").innerText()); })]);
    const job = await db.notificationJob.findFirstOrThrow({ where: { workspaceId, recipientEmail: email }, orderBy: { createdAt: "desc" } });
    const code = /code is (\d{6})/.exec(job.body)?.[1]; assert(code);
    await db.notificationJob.updateMany({ where: { workspaceId, recipientEmail: email }, data: { status: "CANCELLED" } });
    await page.getByLabel("Verification code").fill(code === "000000" ? "111111" : "000000"); await page.getByRole("button", { name: "Verify email", exact: true }).click(); await page.locator(".registration-error").waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
    await page.getByLabel("Verification code").fill(code); await page.getByRole("button", { name: "Verify email", exact: true }).click(); await page.getByLabel("Password", { exact: false }).fill("BrowserFixturePass123!"); await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: `Public ${kind} browser test`, exact: true }).waitFor();
    if (kind === "guardian") {
      const record = await db.publicEnrollment.findFirstOrThrow({ where: { workspaceId, email } });
      assert.equal(await db.signatureRequest.count({ where: { workspaceId, memberId: record.memberId } }), 0, "Unverified guardian cannot issue requests");
      await page.getByLabel("I accept the displayed membership terms", { exact: false }).check();
      await page.getByRole("button", { name: "Check access again", exact: true }).click();
      await page.locator(".registration-error").waitFor();
      assert.match(await page.locator(".registration-error").innerText(), /guardian|access|verify/i);
      await db.memberPortalGrant.create({ data: { workspaceId, memberId: record.memberId, guardianId: record.participant.guardianId, userId: record.participant.accountUserId, verifiedByWorkspaceUserId: owner.id, verificationNote: "Disposable browser fixture: owner checked identity and authority", canBook: true, canSign: true, canPay: true } });
      await page.getByLabel("I accept the displayed membership terms", { exact: false }).check();
      await page.getByRole("button", { name: "Check access again", exact: true }).click();
      await page.getByRole("link", { name: "Read and sign", exact: true }).first().waitFor();
      const selection = (await context.cookies(origin + "/app/forms")).filter(cookie => cookie.name === "hitlink_member_selection");
      assert.equal(selection.length, 1); assert.equal(selection[0].path, "/app"); assert.equal(decodeURIComponent(selection[0].value), `${workspaceId}:${record.memberId}`);
      assert.equal((await context.cookies()).some(cookie => cookie.name === "hitlink_selected_member" && cookie.path === "/"), false);
    }
    if (await page.getByRole("button", { name: "Review required forms", exact: true }).count()) {
      if (kind === "membership") await page.getByLabel("I accept the displayed price", { exact: false }).check();
      await page.getByRole("button", { name: "Review required forms", exact: true }).click();
    }
    if (kind === "trial") {
      await page.getByRole("button", { name: "Book trial for Public trial browser test", exact: true }).click(); await page.getByText("Your trial is booked.", { exact: false }).waitFor();
      const enrollment = await db.publicEnrollment.findFirstOrThrow({ where: { workspaceId, email } });
      assert.equal(enrollment.status, "COMPLETE"); assert.equal(await db.classBooking.count({ where: { workspaceId, memberId: enrollment.memberId, bookingType: "TRIAL", status: "BOOKED" } }), 1);
    } else {
      const links = page.getByRole("link", { name: "Read and sign", exact: true });
      await links.first().waitFor();
      const count = await links.count(); assert(count > 0, "Membership fixture should include current required forms");
      assert.equal(await page.getByRole("button", { name: "Continue to secure payment", exact: true }).count(), 0);
      for (const href of await links.evaluateAll(items => items.map(item => item.getAttribute("href")))) {
        const signing = await context.newPage(); await signing.goto(origin + href);
        if (kind === "guardian") {
          await signing.getByRole("button", { name: "Select member, currently Public guardian browser test", exact: true }).waitFor();
          const record = await db.publicEnrollment.findFirstOrThrow({ where: { workspaceId, email } });
          assert.equal(await signing.locator('input[name="memberId"]').inputValue(), record.memberId);
          assert.equal(await signing.getByLabel("Full legal name", { exact: true }).inputValue(), "Verified parent browser test");
          const otherTab = await context.newPage();
          await otherTab.goto(origin + "/app/schedule");
          await otherTab.getByRole("button", { name: "Select member, currently Public guardian browser test", exact: true }).click();
          await otherTab.getByRole("button", { name: "Verified parent browser test", exact: true }).click();
          await otherTab.getByRole("button", { name: "Select member, currently Verified parent browser test", exact: true }).waitFor();
          await otherTab.close();
        }
        await signing.getByLabel("Full legal name", { exact: true }).fill(kind === "guardian" ? "Verified parent browser test" : "Public membership browser test"); await signing.getByLabel("I confirm I reviewed this PDF", { exact: false }).check(); await signing.getByRole("button", { name: /Sign/ }).click();
        await signing.getByText("The current form version has been signed and saved.").waitFor();
        if (kind === "guardian") {
          const record = await db.publicEnrollment.findFirstOrThrow({ where: { workspaceId, email } });
          const signed = await db.signedDocument.findFirstOrThrow({ where: { workspaceId, memberId: record.memberId } });
          assert.equal(signed.signerKind, "GUARDIAN"); assert.equal(signed.guardianId, record.participant.guardianId);
          assert.equal(await db.signedDocument.count({ where: { workspaceId, memberId: record.participant.payerMemberId } }), 0);
          await signing.screenshot({ path: "test-results/approved-ui/registration-guardian-signed.png", animations: "disabled" });
        }
        await signing.close();
      }
      await page.getByRole("button", { name: "Check signed forms", exact: true }).click(); await page.getByRole("button", { name: "Continue to secure payment", exact: true }).waitFor();
      await page.getByRole("button", { name: "Continue to secure payment", exact: true }).click(); await page.locator(".registration-error").waitFor();
      assert.match(await page.locator(".registration-error").innerText(), /configured|connect|payment|available|finish|review/i);
      const enrollment = await db.publicEnrollment.findFirstOrThrow({ where: { workspaceId, email } }); assert.notEqual(enrollment.status, "COMPLETE");
      assert.equal(await db.payment.count({ where: { workspaceId, memberId: enrollment.memberId } }), 0);
    }
    await db.notificationJob.updateMany({ where: { workspaceId, recipientEmail: email }, data: { status: "CANCELLED" } });
    assert.deepEqual(errors, []); await context.close();
  }
  await writeFile("test-results/approved-ui/public-registration-results.json", JSON.stringify(results, null, 2));
  console.log(`Public trial booking, adult/guardian membership forms, stale-tab child signature, and offline payment passed; ${results.length} layouts. No email or processor request sent.`);
} finally {
  if (websiteId && originalPublished && refreshedPublished) await db.workspaceWebsite.updateMany({ where: { id: websiteId, published: { equals: refreshedPublished } }, data: { published: originalPublished } });
  const people = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } }), ids = people.map(item => item.id);
  const registrations = await db.publicEnrollment.findMany({ where: { workspaceId, email: { in: emails } }, select: { memberId: true } });
  const members = await db.member.findMany({ where: { workspaceId, OR: [{ userId: { in: ids } }, { id: { in: registrations.map(item => item.memberId).filter(Boolean) } }] }, select: { id: true } }), memberIds = members.map(item => item.id);
  await db.memberPortalGrant.deleteMany({ where: { workspaceId, userId: { in: ids } } });
  await db.guardian.deleteMany({ where: { workspaceId, email: { in: emails } } });
  const ops = await db.financialOperation.findMany({ where: { workspaceId, beneficiaryMemberId: { in: memberIds } }, select: { id: true } }), opIds = ops.map(item => item.id);
  await db.notificationJob.deleteMany({ where: { workspaceId, recipientEmail: { in: emails } } });
  await db.financialEntitlementHold.deleteMany({ where: { operationId: { in: opIds } } }); await db.financialOperationEvent.deleteMany({ where: { operationId: { in: opIds } } }); await db.financialReviewCase.deleteMany({ where: { operationId: { in: opIds } } }); await db.financialOperation.deleteMany({ where: { id: { in: opIds } } });
  await db.publicEnrollment.deleteMany({ where: { workspaceId, email: { in: emails } } });
  await db.signedDocument.deleteMany({ where: { workspaceId, memberId: { in: memberIds } } }); await db.signatureRequest.deleteMany({ where: { workspaceId, memberId: { in: memberIds } } }); await db.classBooking.deleteMany({ where: { workspaceId, memberId: { in: memberIds } } }); await db.membershipBillingState.deleteMany({ where: { workspaceId, memberId: { in: memberIds } } }); await db.memberMembership.deleteMany({ where: { workspaceId, memberId: { in: memberIds } } }); await db.financialAccount.deleteMany({ where: { workspaceId, userId: { in: ids } } }); await db.member.deleteMany({ where: { id: { in: memberIds } } }); await db.user.deleteMany({ where: { id: { in: ids } } });
  if (fixtureDocumentId) await db.formDocument.delete({ where: { id: fixtureDocumentId } });
  await browser.close(); await db.$disconnect();
}
