import { loginToWorkspace } from "./support/workspace-login";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
  lockClassSchedule,
  changeMemberOperations,
} from "@flowstate/db";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../packages/db/src/retention-inventory.js";
import { expect, test, type Page } from "./support/browser-diagnostics";
const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !url ||
  !/test|e2e/i.test(new URL(url).pathname) ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
)
  throw new Error(
    "Directory browser proof requires a dedicated local test database.",
  );
const db = new PrismaClient({ datasourceUrl: url });
const origin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
test.afterAll(() => db.$disconnect());
test("MF05/MF08 owner filters before pagination and sees independent frozen membership, paid pack and active coaching", async ({
  page,
  browserDiagnostics,
}, info) => {
  test.setTimeout(120000);
  const key = `member-directory-${randomUUID()}`,
    now = new Date(),
    date = now.toISOString().slice(0, 10);
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const owner = await db.user.create({
    data: {
      email: `${key}@example.test`,
      fullName: "Directory owner",
      passwordHash: seed.passwordHash,
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: key,
      status: "ACTIVE",
      location: {
        create: {
          name: "Gym",
          timezone: "UTC",
          rooms: { create: { name: "Mat", capacity: 10 } },
        },
      },
      workspaceUsers: { create: { userId: owner.id, role: "OWNER" } },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional verified test",
          flowstateResponsibility: "Local only",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: { workspaceUsers: true, location: { include: { rooms: true } } },
  });
  try {
    const person = await db.member.create({
      data: {
        workspaceId: workspace.id,
        fullName: "ZZZ independent service participant",
        phone: "fictional-778-directory",
        dateOfBirth: new Date("1990-01-01Z"),
        status: "ACTIVE",
        tags: ["Competition"],
      },
    });
    const operationalTag = "Review on arrival";
    await changeMemberOperations({ workspaceId: workspace.id, userId: owner.id }, {
      memberId: person.id, recordKind: "TAG", recordKey: `tag:OPERATIONAL:${createHash("sha256").update(operationalTag).digest("hex")}`,
      tagLabel: operationalTag, tagPurpose: "OPERATIONAL", action: "ADD", expectedVersion: 0, operationId: randomUUID(), visibility: "OWNER_ONLY",
    }, { db, now });
    await db.member.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        workspaceId: workspace.id,
        fullName: `AAA unrelated ${index}`,
        status: "ACTIVE",
        tags: ["Competition"],
      })),
    });
    const program = await db.program.create({
      data: { workspaceId: workspace.id, name: "Directory padwork" },
    });
    const template = await db.classTemplate.create({
      data: {
        workspaceId: workspace.id,
        programId: program.id,
        roomId: workspace.location!.rooms[0]!.id,
        weekday: "MONDAY",
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 120,
      },
    });
    await db.classBooking.create({
      data: {
        workspaceId: workspace.id,
        memberId: person.id,
        classTemplateId: template.id,
        scheduledForDate: new Date(date),
        bookingType: "TRIAL",
        status: "BOOKED",
      },
    });
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId: workspace.id,
        name: "Frozen membership record",
        monthlyPriceCents: 10000,
        weeklyClassLimit: 2,
      },
    });
    const membership = await db.memberMembership.create({
      data: {
        workspaceId: workspace.id,
        memberId: person.id,
        membershipPlanId: plan.id,
        status: "FROZEN",
        startedAt: new Date(+now - 30 * 86400000),
        frozenFrom: new Date(+new Date(date) - 86400000),
        frozenUntil: new Date(+new Date(date) + 7 * 86400000),
        allowanceTimezone: "UTC",
        acceptedTerms: JSON.parse(
          JSON.stringify(snapshotMembershipTerms(plan, now)),
        ),
      },
    });
    await db.membershipBillingState.create({
      data: {
        workspaceId: workspace.id,
        memberId: person.id,
        memberMembershipId: membership.id,
        status: "ACTIVE",
      },
    });
    const product = await db.punchCardProduct.create({
      data: {
        workspaceId: workspace.id,
        name: "Independent paid pack",
        punchesIncluded: 5,
        priceCents: 5000,
      },
    });
    const pack = await db.memberPunchCard.create({
      data: {
        workspaceId: workspace.id,
        memberId: person.id,
        punchCardProductId: product.id,
        originalPunches: 5,
        remainingPunches: 4,
        purchasePriceCents: 5000,
        acceptedTerms: JSON.parse(
          JSON.stringify(snapshotPunchCardTerms(product, now)),
        ),
      },
    });
    const coaching = await db.coachingProgram.create({
      data: { workspaceId: workspace.id, name: "Independent coaching" },
    });
    const version = await db.coachingProgramVersion.create({
      data: {
        programId: coaching.id,
        number: 1,
        durationDays: 30,
        deliveryWeekdays: [1],
        responseHours: 24,
        goals: "PRIVATE_DIRECTORY_SENTINEL",
        milestones: [],
        priceCents: 5000,
        currency: "cad",
        terms: "Accepted fictional terms",
      },
    });
    await db.coachingEnrollment.create({
      data: {
        workspaceId: workspace.id,
        memberId: person.id,
        programVersionId: version.id,
        status: "ONBOARDING",
        startsOn: new Date(date),
        endsOn: new Date(+new Date(date) + 30 * 86400000),
        timezone: "UTC",
        acceptedAt: now,
        contactVerifiedAt: now,
        currentCoachWorkspaceUserId: workspace.workspaceUsers[0]!.id,
        paymentState: "PAID",
        caseOwnerWorkspaceUserId: workspace.workspaceUsers[0]!.id,
      },
    });
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
    await page.goto(`${origin}/dashboard/members`);
    await settled(page);
    // Operational tag filtering alone must find the later row before the first 50 names are selected.
    await page.getByLabel("Exact current operational tag", { exact: true }).fill(operationalTag);
    await page.getByRole("button", { name: "Search members", exact: true }).click();
    await settled(page);
    await expect(page.getByRole("heading", { name: person.fullName, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^AAA unrelated/ })).toHaveCount(0);
    await page
      .getByLabel("Class program participation", { exact: true })
      .fill("padwork");
    await page
      .getByLabel("Exact saved cohort / legacy label", { exact: true })
      .fill("Competition");
    await page
      .getByRole("combobox", { name: /^Operational condition/ })
      .selectOption("CLASS_BOOKED");
    await page
      .getByRole("button", { name: "Search members", exact: true })
      .click();
    await settled(page);
    const row = page.locator("article").filter({
      has: page.getByRole("heading", { name: person.fullName, exact: true }),
    });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Contract: frozen · Payment: active");
    await expect(row).toContainText("Independent paid pack: 4 recorded units");
    await expect(row).toContainText(
      "Independent coaching: active · Payment: paid",
    );
    await expect(
      page.getByRole("link", { name: "Next 50 matching members", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "PRIVATE_DIRECTORY_SENTINEL",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await settled(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await info.attach("member-directory-phone", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await row.getByRole("link", { name: "View profile", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Independent services", exact: true }),
    ).toBeVisible();
    await settled(page);
    await expect(page.locator("body")).toContainText(
      "Contract: frozen · Payment: active",
    );
    await expect(page.locator("body")).not.toContainText(
      "PRIVATE_DIRECTORY_SENTINEL",
    );
    expect(
      (
        await db.memberMembership.findUniqueOrThrow({
          where: { id: membership.id },
        })
      ).status,
    ).toBe("FROZEN");
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: pack.id } }))
        .remainingPunches,
    ).toBe(4);
    browserDiagnostics.assertNoExternalRequests();
    browserDiagnostics.assertNoUnexpected();
  } finally {
    await db.$transaction(
      async (tx) => {
        await lockClassSchedule(tx, workspace.id);
        const inventory = await inspectRetentionInventory(tx, workspace.id);
        await deleteReviewedWorkspaceRecords(
          tx,
          workspace.id,
          inventory.fingerprint,
        );
      },
      { timeout: 120000 },
    );
    await db.user.delete({ where: { id: owner.id } });
  }
});
