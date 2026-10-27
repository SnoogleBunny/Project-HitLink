import { loginToWorkspace } from "./support/workspace-login";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createAccessBackedBooking,
  getWeekdayForDateString,
  snapshotMembershipTerms,
} from "../../packages/db/src/index.js";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";
import {
  expect,
  test,
  type Locator,
  type Page,
} from "./support/browser-diagnostics";
const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  !/test|e2e/i.test(new URL(url).pathname)
)
  throw new Error(
    "Class-rule acceptance requires a dedicated local test database.",
  );
const db = new PrismaClient({ datasourceUrl: url });
const origin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
async function action(page: Page, button: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        !!response.request().headers()["next-action"],
    ),
    button.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  return response;
}
test.afterAll(() => db.$disconnect());
test("WS06 owner previews retained commitments and confirms versioned class rules enforced on new claims", async ({
  page,
  browserDiagnostics,
}, info) => {
  test.setTimeout(120000);
  const key = `booking-rules-${randomUUID()}`;
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const owner = await db.user.create({
    data: {
      email: `${key}@example.test`,
      fullName: "Class rules owner",
      passwordHash: seed.passwordHash,
    },
  });
  const now = new Date(),
    day = new Date(now);
  day.setUTCDate(day.getUTCDate() + 3);
  const date = day.toISOString().slice(0, 10),
    weekday = getWeekdayForDateString(date);
  const workspace = await db.workspace.create({
    data: {
      name: key,
      status: "ACTIVE",
      location: { create: { name: "Fictional mat", timezone: "UTC" } },
      settings: { create: { locale: "en-CA", currency: "cad" } },
      workspaceUsers: { create: { userId: owner.id, role: "OWNER" } },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional handoff complete",
          flowstateResponsibility: "Local class-rule acceptance",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: { location: true },
  });
  try {
    await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
    const program = await db.program.create({
      data: { workspaceId: workspace.id, name: "Rule review program" },
    });
    const room = await db.room.create({
      data: {
        locationId: workspace.location!.id,
        name: "Rule review mat",
        capacity: 4,
      },
    });
    const template = await db.classTemplate.create({
      data: {
        workspaceId: workspace.id,
        programId: program.id,
        roomId: room.id,
        title: "Retained evening class",
        weekday,
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: 120,
      },
    });
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId: workspace.id,
        name: "Two weekly",
        monthlyPriceCents: 12000,
        weeklyClassLimit: 2,
      },
    });
    const members = await Promise.all(
      ["Existing participant", "Later participant"].map((fullName) =>
        db.member.create({
          data: {
            workspaceId: workspace.id,
            fullName,
            status: "ACTIVE",
            dateOfBirth: new Date("1990-01-01"),
          },
        }),
      ),
    );
    for (const member of members)
      await db.memberMembership.create({
        data: {
          workspaceId: workspace.id,
          memberId: member.id,
          membershipPlanId: plan.id,
          status: "ACTIVE",
          startedAt: new Date(now.getTime() - 86400000),
          allowanceAnchorDate: new Date(
            `${now.toISOString().slice(0, 10)}T00:00:00Z`,
          ),
          allowanceTimezone: "UTC",
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotMembershipTerms(plan)),
          ),
        },
      });
    const claimArgs = {
      workspaceId: workspace.id,
      memberId: members[0]!.id,
      classTemplateId: template.id,
      scheduledForDate: date,
      timezone: "UTC",
      source: "ADMIN" as const,
      db: db as never,
      now,
    };
    const created = await createAccessBackedBooking(claimArgs);
    if (created.status === "error") throw Error(created.message);
    const before = await db.classBooking.findUniqueOrThrow({
      where: { id: created.bookingId },
    });
    const allocations = await db.membershipAllowanceAllocation.findMany({
      where: { bookingId: before.id },
      orderBy: { id: "asc" },
    });
    expect(allocations).toHaveLength(1);
    await loginToWorkspace({
      page,
      origin,
      email: owner.email,
      password: "DemoPass123!",
      expectedRedirect: "/dashboard;push",
      destination: { path: "/dashboard", heading: "Today" },
      diagnostics: browserDiagnostics,
    });
    // A 303 remains subject to the collector's existing exact document-visit rule.
    await page.goto(`${origin}/dashboard/settings`);
    await page
      .getByRole("link", { name: "Class booking rules", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Class booking rules", exact: true }),
    ).toBeVisible();
    const label = weekday[0] + weekday.slice(1).toLowerCase();
    await page
      .getByLabel(`${label} opening time 1`, { exact: true })
      .fill("09:00");
    await page
      .getByRole("combobox", { name: new RegExp(`^${label} closing time 1`) })
      .selectOption("time");
    await page
      .getByLabel(`${label} closing clock time 1`, { exact: true })
      .fill("17:00");
    await page
      .getByLabel("Rolling booking horizon (days)", { exact: true })
      .fill("14");
    await page
      .getByLabel("Minimum booking notice (minutes)", { exact: true })
      .fill("90");
    await page
      .getByLabel("Reason for these rules", { exact: true })
      .fill("Reviewed daytime hours; retain the existing evening commitment.");
    const previewResponse = await action(
      page,
      page.getByRole("button", { name: "Preview booking rules", exact: true }),
    );
    const review = page.getByRole("region", {
      name: "Booking rules review",
      exact: true,
    });
    await expect(review).toContainText(
      "1 existing bookings keep their seats and funding",
    );
    await expect(review).toContainText("Retained evening class");
    await expect(review).toContainText(date);
    await expect(review).toContainText(
      "outside the configured class opening hours",
    );
    browserDiagnostics.acknowledgeAction(
      previewResponse,
      "Owner preview visibly lists the existing dated booking and retention rules.",
    );
    await page
      .getByRole("checkbox", {
        name: "I reviewed these commitments and confirm the rules for new requests.",
        exact: true,
      })
      .check();
    const confirmResponse = await action(
      page,
      page.getByRole("button", {
        name: "Confirm class booking rules",
        exact: true,
      }),
    );
    await expect(page.getByRole("status")).toContainText("version 2 confirmed");
    browserDiagnostics.acknowledgeAction(
      confirmResponse,
      "Owner confirmation visibly reports version 2; existing commitment retained.",
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Version 2", exact: true }),
    ).toBeVisible();
    const after = await db.classBooking.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.status).toBe("BOOKED");
    expect(after.schedulingPolicySnapshot).toEqual(
      before.schedulingPolicySnapshot,
    );
    expect(after.acceptedPolicy).toEqual(before.acceptedPolicy);
    expect(
      await db.membershipAllowanceAllocation.findMany({
        where: { bookingId: before.id },
        orderBy: { id: "asc" },
      }),
    ).toEqual(allocations);
    expect(
      await createAccessBackedBooking({
        ...claimArgs,
        memberId: members[1]!.id,
        now: new Date(),
      }),
    ).toMatchObject({
      status: "error",
      message: expect.stringContaining("opening hours"),
    });
    expect(
      await db.classBooking.count({ where: { workspaceId: workspace.id } }),
    ).toBe(1);
    expect(
      await db.workspaceDataEvent.count({
        where: { workspaceId: workspace.id, kind: "SCHEDULING_POLICY_APPLIED" },
      }),
    ).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("class-booking-rules-phone.png"),
      fullPage: true,
    });
  } finally {
    const where = { workspaceId: workspace.id };
    await db.membershipAllowanceAllocation.deleteMany({ where });
    await db.classBooking.deleteMany({ where });
    await db.classTemplate.deleteMany({ where });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
