import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { hashPassword } from "../../auth/src/password.js";
const db = new PrismaClient(),
  browser = await chromium.launch({ headless: true }),
  tag = `staff-leave-ui-${randomUUID()}`,
  results = [],
  errors = [];
let workspaceId, user;
const password = "Local-leave-fixture-123!";
try {
  user = await db.user.create({
    data: {
      email: `${tag}@example.test`,
      fullName: "Leave fixture coach",
      passwordHash: await hashPassword(password),
    },
  });
  const now = new Date();
  const workspace = await db.workspace.create({
    data: {
      name: "Leave browser gym",
      status: "ACTIVE",
      location: { create: { name: "Gym", timezone: "UTC" } },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Ready",
          flowstateResponsibility: "Ready",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: user.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: user.id,
        },
      },
    },
    include: { location: true },
  });
  workspaceId = workspace.id;
  const staff = await db.workspaceUser.create({
    data: { workspaceId, userId: user.id, role: "OWNER" },
  });
  const room = await db.room.create({
      data: {
        locationId: workspace.location.id,
        name: "Main mat",
        capacity: 20,
      },
    }),
    program = await db.program.create({
      data: { workspaceId, name: "Muay Thai" },
    });
  await db.classTemplate.create({
    data: {
      workspaceId,
      coachWorkspaceUserId: staff.id,
      roomId: room.id,
      programId: program.id,
      title: "Evening Muay Thai",
      weekday: "MONDAY",
      startTimeMinutes: 1080,
      endTimeMinutes: 1140,
      bookingCutoffMinutes: 0,
      cancellationCutoffMinutes: 0,
    },
  });
  const context = await browser.newContext({
      viewport: { width: 1365, height: 950 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3200/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("http://localhost:3200/dashboard/staff");
  await page
    .getByRole("heading", { name: "Coaches and staff", exact: true })
    .waitFor();
  await page.getByLabel("Coach or owner").selectOption(staff.id);
  await page.getByLabel("Leave starts").fill("2030-01-07T17:00");
  await page.getByLabel("Leave ends").fill("2030-01-07T20:00");
  await page.getByLabel("Reason", { exact: true }).fill("Annual leave");
  await page.getByRole("button", { name: "Record leave", exact: true }).click();
  await page.getByRole("list", { name: "Leave conflicts" }).waitFor();
  assert.equal(await db.staffTimeOff.count({ where: { workspaceId } }), 0);
  assert.equal(
    await page.getByLabel("Leave starts").inputValue(),
    "2030-01-07T17:00",
  );
  assert.equal(await page.getByLabel("Coach or owner").inputValue(), staff.id);
  const conflictLink = page.getByRole("link", {
    name: "Evening Muay Thai",
    exact: true,
  });
  assert.match(
    await conflictLink.getAttribute("href"),
    /^\/dashboard\/schedule\?date=2030-01-07$/,
  );
  await mkdir("test-results/approved-ui", { recursive: true });
  async function layouts(screen) {
    for (const width of [1365, 390, 320])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 950 });
        if ((await page.locator("html").getAttribute("data-theme")) !== theme)
          await page
            .getByRole("button", { name: `Switch to ${theme} mode` })
            .click();
        await page.evaluate(() => document.fonts.ready);
        const size = await page.evaluate(() => {
          const main = document.querySelector(".hl-workspace-content");
          return {
            outer: document.documentElement.scrollWidth,
            width: main.clientWidth,
            scroll: main.scrollWidth,
          };
        });
        assert(
          size.outer <= width && size.scroll <= size.width + 1,
          `Overflow ${screen} ${width}: ${JSON.stringify(size)}`,
        );
        await page
          .getByRole("heading", {
            name: screen === "conflicts" ? "Record leave" : "Leave records",
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `test-results/approved-ui/staff-leave-${screen}-${width}-${theme}.png`,
          fullPage: true,
          animations: "disabled",
        });
        results.push({ screen, width, theme, ...size });
      }
  }
  await layouts("conflicts");
  await page.getByLabel("Coach or owner").selectOption(staff.id);
  await page.getByLabel("Leave starts").fill("2030-01-08T09:00");
  await page.getByLabel("Leave ends").fill("2030-01-08T17:00");
  await page.getByLabel("Reason", { exact: true }).fill("Annual leave");
  await page.getByRole("button", { name: "Record leave", exact: true }).click();
  await page
    .getByText(
      "Leave recorded. This coach cannot be assigned during this period.",
      { exact: true },
    )
    .waitFor();
  const leave = await db.staffTimeOff.findFirstOrThrow({
    where: { workspaceId },
  });
  assert.equal(leave.coachWorkspaceUserId, staff.id);
  await layouts("saved");
  await page.locator("summary").filter({ hasText: "Withdraw leave" }).click();
  await page
    .getByLabel("Reason for withdrawing", { exact: true })
    .fill("Travel plans changed");
  await page
    .getByRole("button", { name: "Withdraw leave", exact: true })
    .click();
  await page.getByText("Withdrawn", { exact: true }).waitFor();
  assert(
    (await db.staffTimeOff.findUniqueOrThrow({ where: { id: leave.id } }))
      .revokedAt,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/approved-ui/staff-leave-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    `Staff leave conflict, save and withdrawal passed; ${results.length} layouts without overflow or browser errors.`,
  );
} finally {
  if (workspaceId) {
    await db.staffTimeOff.deleteMany({ where: { workspaceId } });
    await db.classTemplate.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
  }
  if (user) {
    await db.authSession.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
  await browser.close();
  await db.$disconnect();
}
