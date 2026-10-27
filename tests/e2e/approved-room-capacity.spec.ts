import { loginToWorkspace } from "./support/workspace-login";
import { expectActionRedirect } from "./support/action-redirect";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  classOccurrenceInclude,
  getWeekdayForDateString,
  resolveClassOccurrence,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";
import {
  expect,
  test,
  type Page,
  type Locator,
} from "./support/browser-diagnostics";
const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !url ||
  !/test|e2e/i.test(new URL(url).pathname) ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error(
    "Room capacity browser proof requires an explicit disposable loopback test database.",
  );
const db = new PrismaClient({ datasourceUrl: url });
const admin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
async function act(page: Page, control: Locator) {
  const current = page.url();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url() === current &&
        r.request().method() === "POST" &&
        !!r.request().headers()["next-action"],
    ),
    control.click(),
  ]);
  await settled(page);
  return response;
}
test.afterAll(() => db.$disconnect());
test("WS06 owner rejects an overbooked room-default reduction, preserves explicit class capacity, confirms a safe revision and cannot bypass review through room details", async ({
  page,
  browserDiagnostics,
}, info) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(30000);
  const key = `room-capacity-${randomUUID()}`;
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const owner = await db.user.create({
    data: {
      fullName: "Fictional room reviewer",
      email: `${key}@example.test`,
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
          rooms: { create: { name: "Reviewed default mat", capacity: 5 } },
        },
      },
      workspaceUsers: { create: { userId: owner.id, role: "OWNER" } },
      programs: { create: { name: "Training" } },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional room fixture ready",
          flowstateResponsibility: "Local transactional proof",
          ownerReviewAcknowledgedAt: new Date(),
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: new Date(),
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: {
      location: { include: { rooms: true } },
      workspaceUsers: true,
      programs: true,
    },
  });
  const room = workspace.location!.rooms[0]!;
  try {
    await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 14);
    const dateKey = date.toISOString().slice(0, 10);
    const definitions = await Promise.all(
      [
        {
          title: "Inherits room default",
          start: 600,
          end: 660,
          capacity: null,
        },
        {
          title: "Separate seven-place class",
          start: 720,
          end: 780,
          capacity: 7,
        },
      ].map((def) =>
        db.classTemplate.create({
          data: {
            workspaceId: workspace.id,
            programId: workspace.programs[0]!.id,
            roomId: room.id,
            coachWorkspaceUserId: workspace.workspaceUsers[0]!.id,
            weekday: getWeekdayForDateString(dateKey),
            title: def.title,
            startTimeMinutes: def.start,
            endTimeMinutes: def.end,
            capacityOverride: def.capacity,
            bookingCutoffMinutes: 0,
            cancellationCutoffMinutes: 0,
          },
        }),
      ),
    );
    const members = [];
    for (let i = 0; i < 6; i++)
      members.push(
        await db.member.create({
          data: {
            workspaceId: workspace.id,
            fullName: `Fictional capacity participant ${i}`,
          },
        }),
      );
    const seats = [];
    for (const [index, member] of members.slice(0, 5).entries())
      seats.push(
        await db.classBooking.create({
          data: {
            workspaceId: workspace.id,
            memberId: member.id,
            classTemplateId: definitions[index < 2 ? 0 : 1]!.id,
            scheduledForDate: new Date(`${dateKey}Z`),
            status: "BOOKED",
          },
        }),
      );
    const waiting = await db.waitlistEntry.create({
      data: {
        workspaceId: workspace.id,
        memberId: members[5]!.id,
        classTemplateId: definitions[0]!.id,
        scheduledForDate: new Date(`${dateKey}Z`),
        status: "ACTIVE",
      },
    });
    await loginToWorkspace({
      page,
      origin: admin,
      email: owner.email,
      password: "DemoPass123!",
      expectedRedirect: "/dashboard;push",
      destination: { path: "/dashboard", heading: "Today" },
      diagnostics: browserDiagnostics,
    });
    // A 303 remains subject to the collector's existing exact document-visit rule.
    await page.goto(`${admin}/dashboard/rooms/${room.id}/edit`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `Edit ${room.name}`,
        exact: true,
      }),
    ).toBeVisible();
    const form = page.getByRole("form", {
      name: "Room default capacity review",
      exact: true,
    });
    const beforeRequest = await form
      .locator('input[name="operationId"]')
      .inputValue();
    await form
      .getByRole("spinbutton", { name: "Default capacity", exact: true })
      .fill("1");
    await form
      .getByRole("textbox", {
        name: "Reason for room default change",
        exact: true,
      })
      .fill("Reviewed the default while preserving class-specific limits");
    const blocked = await act(
      page,
      form.getByRole("button", {
        name: "Preview capacity effects",
        exact: true,
      }),
    );
    const effects = form.getByRole("region", {
      name: "Room capacity effects",
      exact: true,
    });
    await expect(effects.getByRole("alert")).toContainText(
      "2 existing reservations",
    );
    await expect(effects).toContainText("Inherits room default");
    await expect(effects).toContainText(dateKey);
    await expect(effects).toContainText("1 waiting");
    await expect(
      form.getByRole("button", { name: "Confirm room default", exact: true }),
    ).toBeDisabled();
    expect(
      (await db.room.findUniqueOrThrow({ where: { id: room.id } })).capacity,
    ).toBe(5);
    expect(
      await db.workspaceDataEvent.count({
        where: {
          workspaceId: workspace.id,
          kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED",
        },
      }),
    ).toBe(0);
    expect(blocked.status()).toBe(200);
    browserDiagnostics.acknowledgeAction(
      blocked,
      "The owner sees the exact blocking date and reservation count; no capacity or seat mutation occurred.",
    );
    await form
      .getByRole("spinbutton", { name: "Default capacity", exact: true })
      .fill("2");
    const preview = await act(
      page,
      form.getByRole("button", {
        name: "Preview capacity effects",
        exact: true,
      }),
    );
    await expect(effects.getByRole("alert")).toHaveCount(0);
    await effects
      .getByText("Class-specific capacities stay unchanged", { exact: true })
      .click();
    await expect(effects).toContainText("Separate seven-place class");
    await expect(effects).toContainText("7 places");
    await expect(effects).toContainText("3 reservations");
    expect(preview.status()).toBe(200);
    browserDiagnostics.acknowledgeAction(
      preview,
      "The safe proposal separately discloses inherited commitments and an unchanged higher class-specific capacity.",
    );
    await form
      .getByRole("checkbox", {
        name: "I reviewed the capacity effects. Existing reservations, waiting places and funding remain unchanged.",
        exact: true,
      })
      .check();
    const saved = await act(
      page,
      form.getByRole("button", { name: "Confirm room default", exact: true }),
    );
    await expect(form.getByRole("status")).toContainText("review 1 confirmed");
    await expect
      .poll(
        async () =>
          (await db.room.findUniqueOrThrow({ where: { id: room.id } }))
            .capacity,
      )
      .toBe(2);
    const receipt = await db.workspaceDataEvent.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED",
      },
    });
    expect(receipt.actorUserId).toBe(owner.id);
    expect(receipt.metadata).toMatchObject({
      revision: 1,
      previousCapacity: 5,
      capacity: 2,
      affectedOccurrenceCount: 1,
      reservationCount: 2,
      queuedEntryCount: 1,
    });
    await expect(form.locator('input[name="operationId"]')).not.toHaveValue(
      beforeRequest,
    );
    expect(saved.status()).toBe(200);
    browserDiagnostics.acknowledgeAction(
      saved,
      "One attributed immutable revision persists, with visible confirmation and a new request identity.",
    );
    const actual = await db.classTemplate.findUniqueOrThrow({
      where: { id: definitions[1]!.id },
      include: classOccurrenceInclude,
    });
    expect(
      resolveClassOccurrence({ template: actual, scheduledForDate: dateKey })!
        .effectiveCapacity,
    ).toBe(7);
    for (const seat of seats)
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: seat.id } }),
      ).toEqual(seat);
    expect(
      await db.waitlistEntry.findUniqueOrThrow({ where: { id: waiting.id } }),
    ).toEqual(waiting);
    expect(
      await db.membershipAllowanceEntry.count({
        where: { workspaceId: workspace.id },
      }),
    ).toBe(0);
    expect(
      await db.punchCardEntry.count({ where: { workspaceId: workspace.id } }),
    ).toBe(0);
    await settled(page);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `Edit ${room.name}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Review 1: 5 → 2", { exact: true }),
    ).toBeVisible();
    await expect(
      form.getByRole("spinbutton", { name: "Default capacity", exact: true }),
    ).toHaveValue("2");
    // Negative boundary: only a fictional hidden field is forged; the existing
    // room-details action must ignore capacity instead of bypassing the review.
    const details = page.locator("form").filter({
      has: page.getByRole("textbox", { name: "Room name", exact: true }),
    });
    await details.evaluate((node) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "capacity";
      input.value = "1";
      node.append(input);
    });
    await details
      .getByRole("textbox", { name: "Room name", exact: true })
      .fill("Renamed reviewed mat");
    const renamed = await act(
      page,
      details.getByRole("button", { name: "Save changes", exact: true }),
    );
    await expectActionRedirect(page, renamed, `${admin}/dashboard/rooms`);
    await expect(page).toHaveURL(`${admin}/dashboard/rooms`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Room management",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await db.room.findUniqueOrThrow({ where: { id: room.id } }),
    ).toMatchObject({ name: "Renamed reviewed mat", capacity: 2 });
    expect(
      await db.workspaceDataEvent.count({
        where: {
          workspaceId: workspace.id,
          kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED",
        },
      }),
    ).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    if (renamed.status() === 200)
      browserDiagnostics.acknowledgeAction(
        renamed,
        "The room-management heading is visible and the exact renamed room retains reviewed capacity two with only one capacity revision despite the forged field.",
      );
    await settled(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await info.attach("room-default-owner-phone", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    browserDiagnostics.assertNoExternalRequests();
  } catch (error) {
    try {
      if (!page.isClosed())
        await info.attach("room-owner-accessibility", {
          body: await page.locator("main").ariaSnapshot({ timeout: 5000 }),
          contentType: "text/plain",
        });
    } catch {
      info.annotations.push({
        type: "diagnostic",
        description:
          "The page was unavailable for an accessibility snapshot after the original failure.",
      });
    }
    throw error;
  } finally {
    try {
      await page.close();
      browserDiagnostics.assertNoUnexpected();
    } finally {
      await db.classBooking.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await db.waitlistEntry.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await db.classTemplate.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await db.workspace.delete({ where: { id: workspace.id } });
      await db.user.delete({ where: { id: owner.id } });
    }
  }
});
