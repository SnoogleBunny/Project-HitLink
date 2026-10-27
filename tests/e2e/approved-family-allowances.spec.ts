import { loginToWorkspace } from "./support/workspace-login";
import { captureAction, expectActionRedirect } from "./support/action-redirect";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Weekday } from "@prisma/client";
import {
  expect,
  test,
  type Page,
  type BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";

const url = process.env.DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  !/test|e2e/i.test(new URL(url).pathname)
) {
  throw new Error(
    "Family allowance acceptance requires an explicit disposable local test database.",
  );
}
const db = new PrismaClient({ datasourceUrl: url });
const origin =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const date = (offset = 0) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const asDate = (value: string) => new Date(`${value}T00:00:00Z`);
const weekdays: Weekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function choose(
  page: Page,
  member: { id: string; fullName: string },
  workspaceId: string,
  parentId: string,
  diagnostics: BrowserDiagnosticsCollector,
) {
  await page.getByRole("button", { name: /^Select member, currently/ }).click();
  const actionUrl = page.url();
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url() === actionUrl &&
        candidate.request().method() === "POST" &&
        !!candidate.request().headers()["next-action"],
    ),
    page
      .getByRole("dialog", { name: "Choose a member" })
      .getByRole("button", { name: member.fullName, exact: true })
      .click(),
  ]);
  expect(response.status()).toBe(200);
  expect(response.request().postData()).toContain(member.id);
  await expect(page).toHaveURL(`${origin}/app/schedule`);
  await expect(
    page.getByRole("heading", { name: "Classes", exact: true }),
  ).toBeVisible();
  await settled(page);
  await expect(
    page.getByRole("button", {
      name: `Select member, currently ${member.fullName}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
  const selected = (
    await page.context().cookies(`${origin}/app/schedule`)
  ).find((cookie) => cookie.name === "hitlink_member_selection");
  expect(selected).toBeDefined();
  expect(decodeURIComponent(selected!.value)).toBe(
    `${workspaceId}:${member.id}`,
  );
  expect(
    await db.memberPortalGrant.count({
      where: {
        workspaceId,
        userId: parentId,
        memberId: member.id,
        canBook: true,
        revokedAt: null,
      },
    }),
  ).toBe(1);
  diagnostics.acknowledgeAction(
    response,
    "The exact selected child is rendered on the settled Classes route, has the scoped selection cookie and retains the current fictional guardian booking grant.",
  );
}

test.afterAll(() => db.$disconnect());
test("CF22 guardian siblings hold separate capped allowances and cancellation restores only its beneficiary", async ({
  page,
  browserDiagnostics,
}) => {
  test.setTimeout(90_000);
  const prefix = `family-allowance-${randomUUID()}`;
  const parentId = `${prefix}-parent`,
    ownerId = `${prefix}-owner`;
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-member@flowstate.local" },
    select: { passwordHash: true },
  });
  const workspace = await db.$transaction(async (tx) => {
    await tx.user.createMany({
      data: [
        {
          id: parentId,
          email: `${prefix}@example.test`,
          fullName: "Acceptance Parent",
          passwordHash: seed.passwordHash,
        },
        {
          id: ownerId,
          email: `${prefix}-owner@example.test`,
          fullName: "Acceptance Owner",
        },
      ],
    });
    return tx.workspace.create({
      data: {
        name: "Family allowance acceptance",
        status: "ACTIVE",
        location: { create: { name: "Family gym", timezone: "UTC" } },
        settings: { create: {} },
        workspaceUsers: {
          create: [
            { userId: parentId, role: "CUSTOMER" },
            { id: `${prefix}-owner-role`, userId: ownerId, role: "OWNER" },
          ],
        },
        migration: {
          create: {
            stage: "COMPLETE",
            nextOwnerAction: "Daily operations",
            flowstateResponsibility: "Fictional acceptance fixture",
            ownerReviewAcknowledgedAt: new Date(),
            ownerReviewAcknowledgedByUserId: ownerId,
            operationallyReadyAt: new Date(),
            operationallyReadyByUserId: "fictional-e2e-operator",
          },
        },
      },
    });
  });
  await createFixtureClassSchedulingPolicy(db, workspace.id, ownerId);
  try {
    const [adult, first, second, unrelated] = await Promise.all([
      db.member.create({
        data: {
          workspaceId: workspace.id,
          userId: parentId,
          fullName: "Acceptance Parent",
          status: "ACTIVE",
          dateOfBirth: new Date("1990-01-01"),
        },
      }),
      db.member.create({
        data: {
          workspaceId: workspace.id,
          fullName: "First Child",
          status: "ACTIVE",
          dateOfBirth: new Date("2017-01-01"),
        },
      }),
      db.member.create({
        data: {
          workspaceId: workspace.id,
          fullName: "Second Child",
          status: "ACTIVE",
          dateOfBirth: new Date("2019-01-01"),
        },
      }),
      db.member.create({
        data: {
          workspaceId: workspace.id,
          fullName: "Unrelated Child",
          status: "ACTIVE",
          dateOfBirth: new Date("2018-01-01"),
        },
      }),
    ]);
    const guardian = await db.guardian.create({
      data: {
        workspaceId: workspace.id,
        fullName: "Acceptance Parent",
        email: `${prefix}@example.test`,
      },
    });
    const grants = [];
    for (const child of [first, second]) {
      await db.familyLink.create({
        data: {
          workspaceId: workspace.id,
          guardianId: guardian.id,
          childMemberId: child.id,
          relationshipLabel: "Parent",
        },
      });
      grants.push(
        await db.memberPortalGrant.create({
          data: {
            workspaceId: workspace.id,
            userId: parentId,
            guardianId: guardian.id,
            memberId: child.id,
            verifiedAt: new Date(),
            verifiedByWorkspaceUserId: `${prefix}-owner-role`,
            verificationNote:
              "Fictional guardian authority reviewed for browser acceptance.",
            canBook: true,
            canSign: false,
            canPay: false,
          },
        }),
      );
    }
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId: workspace.id,
        name: "Fictional capped contract",
        monthlyPriceCents: 10000,
        currency: "cad",
        weeklyClassLimit: 1,
        monthlyClassLimit: 2,
      },
    });
    for (const child of [first, second])
      await db.memberMembership.create({
        data: {
          workspaceId: workspace.id,
          memberId: child.id,
          membershipPlanId: plan.id,
          status: "ACTIVE",
          startedAt: asDate(date()),
          allowanceAnchorDate: asDate(date()),
          allowanceTimezone: "UTC",
          acceptedTerms: {
            version: 1,
            monthlyPriceCents: 10000,
            currency: "cad",
            weeklyClassLimit: 1,
            monthlyClassLimit: 2,
            allowanceCountingMode: "RESERVATION",
            lateCancellationConsumesClass: true,
            noShowConsumesClass: true,
            programIds: [],
            cancellationPolicyReference:
              "Fictional accepted cancellation terms",
            freezePolicyReference: null,
            capturedAt: new Date().toISOString(),
          },
        },
      });
    const program = await db.program.create({
      data: { workspaceId: workspace.id, name: "Junior training" },
    });
    const room = await db.room.create({
      data: {
        locationId: (
          await db.location.findUniqueOrThrow({
            where: { workspaceId: workspace.id },
          })
        ).id,
        name: "Junior mat",
        capacity: 10,
      },
    });
    const target = date(1);
    const lesson = await db.classTemplate.create({
      data: {
        workspaceId: workspace.id,
        programId: program.id,
        roomId: room.id,
        title: "Family capped class",
        weekday: weekdays[asDate(target).getUTCDay()],
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        capacityOverride: 10,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
      },
    });
    await loginToWorkspace({
      page,
      origin,
      email: `${prefix}@example.test`,
      password: "MemberPass123!",
      expectedRedirect: "/app;push",
      destination: { path: "/app/schedule", heading: "Classes" },
      diagnostics: browserDiagnostics,
    });
    await page
      .getByRole("button", { name: /^Select member, currently/ })
      .click();
    await expect(
      page.getByRole("dialog").getByText(unrelated.fullName),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    const bookings = [];
    for (const child of [first, second]) {
      await choose(page, child, workspace.id, parentId, browserDiagnostics);
      await page.goto(`${origin}/app/schedule?date=${target}`);
      const allowance = page.getByRole("region", { name: "Class allowance" });
      await expect(allowance).toContainText("Weekly: 1 remaining");
      await expect(allowance).toContainText("Billing month: 2 remaining");
      const row = page.locator(".hl-class-row").filter({
        has: page.getByRole("heading", { name: lesson.title!, exact: true }),
      });
      await row.getByRole("button", { name: /^Book class/ }).click();
      const review = page.getByRole("dialog", { name: "Review booking" });
      await expect(review).toContainText(child.fullName);
      const booked = await captureAction(page, () =>
        review.getByRole("button", { name: "Book class", exact: true }).click(),
      );
      await expect(page.getByRole("status")).toContainText(
        "Your place is booked.",
      );
      const booking = await db.classBooking.findFirstOrThrow({
        where: {
          workspaceId: workspace.id,
          memberId: child.id,
          classTemplateId: lesson.id,
          status: "BOOKED",
        },
      });
      bookings.push(booking);
      expect(booking.guardianId).toBe(guardian.id);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: {
            workspaceId: workspace.id,
            memberId: child.id,
            state: "RESERVED",
          },
        }),
      ).toBe(2);
      await expectActionRedirect(
        page,
        booked,
        `${origin}/app/schedule?${new URLSearchParams({
          date: target,
          booking: booking.id,
          notice: "booked",
        })}`,
      );
      if (booked.status() === 200)
        browserDiagnostics.acknowledgeAction(
          booked,
          "The named child sees a booked-place confirmation; its exact booking retains the verified guardian and two separate reserved allowance allocations.",
        );
      await page.reload();
      await expect(
        page.getByRole("region", { name: "Class allowance" }),
      ).toContainText("Weekly: 0 remaining");
      await page.goto(`${origin}/app/billing`);
      await expect(
        page.getByText("Your account", { exact: true }),
      ).toBeVisible();
      expect(
        await db.classBooking.count({
          where: { workspaceId: workspace.id, memberId: unrelated.id },
        }),
      ).toBe(0);
      await page.goto(`${origin}/app/schedule?date=${target}`);
    }
    await choose(page, first, workspace.id, parentId, browserDiagnostics);
    await page.goto(
      `${origin}/app/schedule?date=${target}&booking=${bookings[0]!.id}`,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel booking", exact: true })
      .click();
    const cancelled = await captureAction(page, () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm cancellation", exact: true })
        .click(),
    );
    await expect(page.getByRole("status")).toContainText("Booking cancelled.");
    expect(
      await db.membershipAllowanceAllocation.count({
        where: {
          workspaceId: workspace.id,
          memberId: first.id,
          state: "RESERVED",
        },
      }),
    ).toBe(0);
    expect(
      await db.membershipAllowanceAllocation.count({
        where: {
          workspaceId: workspace.id,
          memberId: second.id,
          state: "RESERVED",
        },
      }),
    ).toBe(2);
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: bookings[1]!.id },
        })
      ).status,
    ).toBe("BOOKED");
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: bookings[0]!.id },
        })
      ).status,
    ).toBe("CANCELLED");
    await expectActionRedirect(
      page,
      cancelled,
      `${origin}/app/schedule?${new URLSearchParams({
        notice: "cancelled",
        date: target,
      })}`,
    );
    if (cancelled.status() === 200)
      browserDiagnostics.acknowledgeAction(
        cancelled,
        "Cancellation is visible for the selected child and its exact booking is cancelled with no reserved allowance; the sibling remains booked with both allocations reserved.",
      );
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Class allowance" }),
    ).toContainText("Weekly: 1 remaining");
    await db.memberPortalGrant.update({
      where: { id: grants[0]!.id },
      data: { revokedAt: new Date() },
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Classes", exact: true }),
    ).toBeVisible();
    await settled(page);
    await expect(
      page.getByRole("button", {
        name: `Select member, currently ${adult.fullName}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `Select member, currently ${first.fullName}`,
      }),
    ).toHaveCount(0);
    expect(
      await db.classBooking.count({
        where: { workspaceId: workspace.id, memberId: adult.id },
      }),
    ).toBe(0);
  } finally {
    await db.classBookingMove.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await db.classBooking.deleteMany({ where: { workspaceId: workspace.id } });
    await db.classTemplate.deleteMany({ where: { workspaceId: workspace.id } });
    await db.memberPortalGrant.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.deleteMany({ where: { id: { in: [parentId, ownerId] } } });
  }
});
