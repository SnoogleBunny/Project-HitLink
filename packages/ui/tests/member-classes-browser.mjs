import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const prisma = new PrismaClient(),
  browser = await chromium.launch({ headless: true });
const workspaceId = "demo-workspace-flowstate",
  prefix = `classes-ui-${Date.now()}`,
  memberId = `${prefix}-member`,
  guardianId = `${prefix}-guardian`,
  planId = `${prefix}-plan`,
  membershipId = `${prefix}-membership`,
  grantId = `${prefix}-grant`;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const tomorrow = new Date(`${today}T12:00:00Z`);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const date = tomorrow.toISOString().slice(0, 10),
  weekday = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ][tomorrow.getUTCDay()];
const templateIds = ["a", "b", "c", "d"].map((suffix) => `${prefix}-${suffix}`),
  results = [];
try {
  await prisma.member.create({
    data: {
      id: memberId,
      workspaceId,
      fullName: "Class Test Participant",
      status: "ACTIVE",
    },
  });
  await prisma.guardian.create({
    data: { id: guardianId, workspaceId, fullName: "Class Test Guardian" },
  });
  await prisma.familyLink.create({
    data: { workspaceId, guardianId, childMemberId: memberId },
  });
  await prisma.memberPortalGrant.create({
    data: {
      id: grantId,
      workspaceId,
      userId: "demo-user-member",
      memberId,
      guardianId,
      verifiedByWorkspaceUserId: "demo-workspace-user-owner",
      verificationNote: "Temporary browser test fixture",
      canBook: true,
      canPay: false,
      canSign: false,
    },
  });
  await prisma.membershipPlan.create({
    data: {
      id: planId,
      workspaceId,
      name: "Class test plan",
      monthlyPriceCents: 10000,
      currency: "cad",
      weeklyClassLimit: 4,
      monthlyClassLimit: 12,
    },
  });
  await prisma.memberMembership.create({
    data: {
      id: membershipId,
      workspaceId,
      memberId,
      membershipPlanId: planId,
      status: "ACTIVE",
      startedAt: new Date(`${today}T00:00:00Z`),
      allowanceAnchorDate: new Date(`${today}T00:00:00Z`),
      allowanceTimezone: "America/Vancouver",
      acceptedTerms: {
        version: 1,
        monthlyPriceCents: 10000,
        currency: "cad",
        weeklyClassLimit: 4,
        monthlyClassLimit: 12,
        allowanceCountingMode: "ATTENDANCE",
        lateCancellationConsumesClass: true,
        noShowConsumesClass: true,
        programIds: [],
        cancellationPolicyReference: null,
        freezePolicyReference: null,
        capturedAt: new Date().toISOString(),
      },
    },
  });
  for (let i = 0; i < 4; i++)
    await prisma.classTemplate.create({
      data: {
        id: templateIds[i],
        workspaceId,
        programId: "demo-program-fundamentals",
        roomId: "demo-room-main-mat",
        weekday,
        title: [
          "Test Beginner Padwork",
          "Test Advanced Muay Thai",
          "Test HIIT Bootcamp",
          "Test Full Class",
        ][i],
        startTimeMinutes: 14 * 60 + i * 120,
        endTimeMinutes: 15 * 60 + i * 120,
        bookingCutoffMinutes: 30,
        cancellationCutoffMinutes: 60,
        capacityOverride: i === 3 ? 1 : 10,
      },
    });
  await prisma.classBooking.create({
    data: {
      id: `${prefix}-full`,
      workspaceId,
      memberId: "demo-member-record",
      classTemplateId: templateIds[3],
      scheduledForDate: new Date(`${date}T00:00:00Z`),
      bookingType: "MEMBERSHIP",
      status: "BOOKED",
    },
  });
  const page = await browser.newPage({
    viewport: { width: 1365, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3201/login");
  await page.getByLabel("Email").fill("demo-member@flowstate.local");
  await page.getByLabel("Password", { exact: true }).fill("MemberPass123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.locator(".hl-route h1").waitFor();
  await page.getByRole("button", { name: /Select member, currently/ }).click();
  await page
    .getByRole("dialog", { name: "Choose a member" })
    .getByRole("button", { name: "Class Test Participant", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Select member, currently Class Test Participant",
      exact: true,
    })
    .waitFor();
  await page.goto(`http://localhost:3201/app/schedule?date=${date}`);
  await page.getByRole("heading", { name: "Find a class" }).waitFor();
  assert.match(
    await page.getByLabel("Class allowance").innerText(),
    /4 remaining/,
  );
  assert.match(
    await page.getByLabel("Class allowance").innerText(),
    /12 remaining/,
  );
  async function book(title) {
    await page
      .locator(".hl-class-row")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .getByRole("button", { name: /Book class/ })
      .click();
    const review = page.getByRole("dialog", { name: "Review booking" });
    await review.waitFor();
    assert.match(await review.innerText(), /Class Test Participant/);
    assert.match(await review.innerText(), /Coach to be confirmed/);
    await review
      .getByRole("button", { name: "Book class", exact: true })
      .click();
    await page.getByRole("dialog", { name: "Booking details" }).waitFor();
    await page
      .getByRole("dialog", { name: "Booking details" })
      .getByRole("button", { name: "Close dialog" })
      .click();
  }
  await book("Test Beginner Padwork");
  await book("Test Advanced Muay Thai");
  assert.equal(
    await prisma.classBooking.count({ where: { memberId, status: "BOOKED" } }),
    2,
  );
  results.push(
    "Two independently persisted bookings; exact participant review; unassigned coach remains bookable",
  );
  await page.reload();
  await page
    .getByRole("dialog", { name: "Booking details" })
    .getByRole("button", { name: "Close dialog" })
    .click();
  assert.match(
    await page.getByLabel("Class allowance").innerText(),
    /2 remaining/,
  );
  assert.match(
    await page.getByLabel("Class allowance").innerText(),
    /2 reserved/,
  );
  await mkdir("test-results/approved-ui", { recursive: true });
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page
          .getByRole("button", { name: `Switch to ${theme} mode` })
          .click();
      await page.waitForFunction(
        (t) => document.documentElement.dataset.theme === t,
        theme,
      );
      await page.evaluate(() => document.fonts.ready);
      assert(
        await page.evaluate(() => {
          const main = document.querySelector(".hl-workspace-content");
          return (
            document.documentElement.scrollWidth <= innerWidth &&
            main.scrollWidth <= main.clientWidth + 1
          );
        }),
      );
      assert(
        await page
          .locator(".hl-class-toolbar h2")
          .evaluate(
            (el) =>
              getComputedStyle(el).color !==
              getComputedStyle(el.closest("section")).backgroundColor,
          ),
      );
      await page.screenshot({
        path: `test-results/approved-ui/classes-${width}-${theme}.png`,
      });
    }
  }
  results.push(
    "Classes: 1365, 390 and 320 pixels, light/dark, no overflow, visible headings",
  );
  await page.setViewportSize({ width: 1365, height: 1000 });
  const first = await prisma.classBooking.findFirst({
    where: { memberId, classTemplateId: templateIds[0], status: "BOOKED" },
  });
  await page.goto(
    `http://localhost:3201/app/schedule?date=${date}&booking=${first.id}`,
  );
  let dialog = page.getByRole("dialog", { name: "Booking details" });
  await dialog
    .getByRole("button", { name: "Move booking", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Move booking" });
  await dialog.getByLabel("Move to").selectOption(`${templateIds[2]}:${date}`);
  await dialog.getByRole("button", { name: "Confirm move" }).click();
  await page.waitForURL(/notice=moved/);
  await page.getByRole("dialog", { name: "Booking details" }).waitFor();
  assert.equal(
    (await prisma.classBooking.findUnique({ where: { id: first.id } })).status,
    "CANCELLED",
  );
  assert.equal(
    await prisma.classBooking.count({ where: { memberId, status: "BOOKED" } }),
    2,
  );
  assert(
    await prisma.classBooking.findFirst({
      where: { memberId, classTemplateId: templateIds[2], status: "BOOKED" },
    }),
  );
  results.push(
    "Atomic move replaces original, keeps second reservation and allowance consistent",
  );
  dialog = page.getByRole("dialog", { name: "Booking details" });
  await dialog
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Cancel booking" })
    .getByRole("button", { name: "Confirm cancellation" })
    .click();
  await page.waitForURL(/notice=cancelled/);
  assert.equal(
    await prisma.classBooking.count({ where: { memberId, status: "BOOKED" } }),
    1,
  );
  results.push("Cancellation persists and returns to exact selected day");
  await page
    .locator(".hl-class-row")
    .filter({
      has: page.getByRole("heading", { name: "Test Full Class", exact: true }),
    })
    .getByRole("button", { name: /Join waitlist/ })
    .click();
  await page
    .getByRole("dialog", { name: "Join waitlist" })
    .getByRole("button", { name: "Join waitlist", exact: true })
    .click();
  await page.waitForURL(/notice=waitlisted/);
  assert.equal(
    await prisma.waitlistEntry.count({ where: { memberId, status: "ACTIVE" } }),
    1,
  );
  await page
    .locator(".hl-class-row")
    .filter({
      has: page.getByRole("heading", { name: "Test Full Class", exact: true }),
    })
    .getByRole("button", { name: /Manage/ })
    .click();
  await page
    .getByRole("dialog", { name: "Waitlist details" })
    .getByRole("button", { name: "Leave waitlist" })
    .click();
  await page.waitForURL(/notice=left/);
  assert.equal(
    await prisma.waitlistEntry.count({ where: { memberId, status: "ACTIVE" } }),
    0,
  );
  results.push(
    "Full-class join/leave waitlist persists without confirmation as booked",
  );
  await prisma.memberPortalGrant.update({
    where: { id: grantId },
    data: { canBook: false },
  });
  await page.reload();
  await page
    .getByText(/Booking and cancellation permissions are managed by the gym/)
    .waitFor();
  assert.match(
    await page.locator(".hl-workspace-content").innerText(),
    /Booking and cancellation permissions are managed by the gym/,
  );
  assert(
    await page
      .locator(".hl-class-row")
      .filter({
        has: page.getByRole("heading", {
          name: "Test Beginner Padwork",
          exact: true,
        }),
      })
      .getByRole("button", { name: /Book class/ })
      .isDisabled(),
  );
  results.push("View-only family permission disables new bookings");
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/approved-ui/classes-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify({ passed: results }, null, 2));
} finally {
  await browser.close();
  await prisma.waitlistEntry.deleteMany({ where: { memberId } });
  await prisma.classBookingMove.deleteMany({ where: { memberId } });
  await prisma.classBooking.deleteMany({
    where: { OR: [{ memberId }, { id: `${prefix}-full` }] },
  });
  await prisma.classTemplate.deleteMany({ where: { id: { in: templateIds } } });
  await prisma.memberMembership.deleteMany({ where: { id: membershipId } });
  await prisma.membershipPlan.deleteMany({ where: { id: planId } });
  await prisma.memberPortalGrant.deleteMany({ where: { id: grantId } });
  await prisma.familyLink.deleteMany({ where: { guardianId } });
  await prisma.guardian.deleteMany({ where: { id: guardianId } });
  await prisma.member.deleteMany({ where: { id: memberId } });
  await prisma.$disconnect();
}
