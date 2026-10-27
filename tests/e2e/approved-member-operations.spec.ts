import { loginToWorkspace } from "./support/workspace-login";
import { PrismaClient, type Weekday } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import {
  classOccurrenceInclude,
  prerequisiteFingerprint,
  resolveClassOccurrence,
} from "@flowstate/db";
import {
  attachBrowserDiagnostics,
  expect,
  test,
  type Page,
  type Locator,
  type BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";

const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !url ||
  !/test|e2e/i.test(new URL(url).pathname) ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error(
    "Member operations browser proof requires an explicit local test database.",
  );
const db = new PrismaClient({ datasourceUrl: url });
const admin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const password = "DemoPass123!";
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
async function login(
  page: Page,
  email: string,
  diagnostics: BrowserDiagnosticsCollector,
  coach = false,
) {
  await loginToWorkspace({
    page,
    origin: admin,
    email,
    password,
    expectedRedirect: coach ? "/dashboard/coach/today;push" : "/dashboard;push",
    destination: {
      path: coach ? "/dashboard/coach/today" : "/dashboard",
      heading: coach ? "Today's classes" : "Today",
    },
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
async function act(page: Page, control: Locator) {
  const invalidFields = await control.evaluate((element) =>
    Array.from((element as HTMLButtonElement).form?.elements ?? [])
      .filter(
        (
          field,
        ): field is
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement =>
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement,
      )
      .filter((field) => !field.validity.valid)
      .map((field) => field.name),
  );
  expect(invalidFields).toEqual([]);
  const current = page.url();
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === current &&
        response.request().method() === "POST" &&
        !!response.request().headers()["next-action"],
      { timeout: 30000 },
    ),
    control.click(),
  ]);
  await settled(page);
  return response;
}
async function fixture() {
  const key = `member-ops-${randomUUID()}`;
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const users = await Promise.all(
    ["owner", "coach"].map((role) =>
      db.user.create({
        data: {
          fullName: `Operations ${role}`,
          email: `${key}-${role}@example.test`,
          passwordHash: seed.passwordHash,
        },
      }),
    ),
  );
  const owner = users[0]!,
    coach = users[1]!;
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
      workspaceUsers: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: coach.id, role: "COACH" },
        ],
      },
      programs: { create: { name: "Training" } },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional fixture ready",
          flowstateResponsibility: "Local proof",
          ownerReviewAcknowledgedAt: new Date(),
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: new Date(),
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: {
      workspaceUsers: true,
      programs: true,
      location: { include: { rooms: true } },
    },
  });
  await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
  const member = await db.member.create({
    data: {
      workspaceId: workspace.id,
      fullName: "Operations proof participant",
      notes: "UNREVIEWED_LEGACY_NOTE_SENTINEL",
      tags: ["Unclassified legacy label"],
    },
  });
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 14);
  const day: Weekday[] = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  const dateKey = date.toISOString().slice(0, 10);
  const template = await db.classTemplate.create({
    data: {
      workspaceId: workspace.id,
      programId: workspace.programs[0]!.id,
      roomId: workspace.location!.rooms[0]!.id,
      coachWorkspaceUserId: workspace.workspaceUsers.find(
        (row) => row.userId === coach.id,
      )!.id,
      title: "Operations roster",
      weekday: day[date.getUTCDay()]!,
      startTimeMinutes: 600,
      endTimeMinutes: 660,
      bookingCutoffMinutes: 0,
      cancellationCutoffMinutes: 0,
    },
  });
  await db.classBooking.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      classTemplateId: template.id,
      scheduledForDate: new Date(`${dateKey}T00:00:00Z`),
      status: "BOOKED",
    },
  });
  return { owner, coach, users, workspace, member, template, dateKey };
}
test.afterAll(() => db.$disconnect());
test("MF06 attributed operational correction rejects a stale edit and an assigned roster excludes legacy/owner-only text", async ({
  page,
  browser,
  browserDiagnostics,
}, info) => {
  test.setTimeout(120000);
  const gym = await fixture();
  const coachContext = await browser.newContext();
  const detachCoach = attachBrowserDiagnostics(
    coachContext,
    browserDiagnostics,
  );
  const stale = await page.context().newPage();
  try {
    await login(page, gym.owner.email, browserDiagnostics);
    const profile = `${admin}/dashboard/members/${gym.member.id}`;
    await page.goto(profile);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: gym.member.fullName,
        exact: true,
      }),
    ).toBeVisible();
    const add = page.getByRole("form", {
      name: "Add operational note",
      exact: true,
    });
    await add
      .getByRole("textbox", { name: "Operational note", exact: true })
      .fill("OWNER_ONLY_OPERATIONS_SENTINEL");
    await add
      .getByRole("combobox", { name: "Visibility", exact: true })
      .selectOption("OWNER_ONLY");
    const firstOperationId = await add
      .locator('input[name="operationId"]')
      .inputValue();
    const firstRecordKey = await add
      .locator('input[name="recordKey"]')
      .inputValue();
    const privateSaved = await act(
      page,
      add.getByRole("button", { name: "Add note", exact: true }),
    );
    await expect
      .poll(() =>
        db.memberOperationalRevision.count({
          where: {
            workspaceId: gym.workspace.id,
            memberId: gym.member.id,
            noteBody: "OWNER_ONLY_OPERATIONS_SENTINEL",
            visibility: "OWNER_ONLY",
          },
        }),
      )
      .toBe(1);
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: /^OWNER_ONLY_OPERATIONS_SENTINEL$/ }),
    ).toBeVisible();
    expect(privateSaved.status()).toBe(200);
    await expect(
      page
        .getByRole("region", { name: "Internal operations", exact: true })
        .getByRole("status"),
    ).toContainText("Operational change saved with its author and history.");
    await expect(
      add.getByRole("textbox", { name: "Operational note", exact: true }),
    ).toHaveValue("");
    await expect(add.locator('input[name="operationId"]')).not.toHaveValue(
      firstOperationId,
    );
    await expect(add.locator('input[name="recordKey"]')).not.toHaveValue(
      firstRecordKey,
    );
    browserDiagnostics.acknowledgeAction(
      privateSaved,
      "One owner-only operational revision persists with the current actor.",
    );

    await add
      .getByRole("textbox", { name: "Operational note", exact: true })
      .fill("Use the entrance beside reception");
    await add
      .getByRole("combobox", { name: "Visibility", exact: true })
      .selectOption("ASSIGNED_OPERATIONS");
    const sharedSaved = await act(
      page,
      add.getByRole("button", { name: "Add note", exact: true }),
    );
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: /^Use the entrance beside reception$/ }),
    ).toBeVisible();
    const row = await db.memberOperationalRevision.findFirstOrThrow({
      where: {
        workspaceId: gym.workspace.id,
        memberId: gym.member.id,
        noteBody: "Use the entrance beside reception",
      },
    });
    expect(row).toMatchObject({
      version: 1,
      actorUserId: gym.owner.id,
      visibility: "ASSIGNED_OPERATIONS",
      action: "ADD",
    });
    browserDiagnostics.acknowledgeAction(
      sharedSaved,
      "The shared operational record has one attributed version and explicit visibility.",
    );
    await settled(page);
    await stale.goto(profile);
    await expect(
      stale.getByRole("heading", {
        level: 1,
        name: gym.member.fullName,
        exact: true,
      }),
    ).toBeVisible();
    const edit = (target: Page) =>
      target
        .getByRole("form", { name: "Edit operational note", exact: true })
        .filter({
          has: target.locator(
            `input[name="recordKey"][value="${row.recordKey}"]`,
          ),
        });
    await edit(stale)
      .getByRole("textbox", { name: "Operational note", exact: true })
      .fill("Stale draft should stay in this form");
    await edit(stale)
      .getByRole("textbox", {
        name: "Reason for operational change",
        exact: true,
      })
      .fill("This earlier form needs another review");
    await edit(page)
      .getByRole("textbox", { name: "Operational note", exact: true })
      .fill("Use the entrance opposite reception");
    await edit(page)
      .getByRole("textbox", {
        name: "Reason for operational change",
        exact: true,
      })
      .fill("Corrected the entrance location");
    const corrected = await act(
      page,
      edit(page).getByRole("button", { name: "Save note", exact: true }),
    );
    await expect
      .poll(() =>
        db.memberOperationalRevision.count({
          where: { workspaceId: gym.workspace.id, recordKey: row.recordKey },
        }),
      )
      .toBe(2);
    expect(
      (
        await db.memberOperationalRevision.findFirstOrThrow({
          where: { workspaceId: gym.workspace.id, recordKey: row.recordKey },
          orderBy: { version: "desc" },
        })
      ).noteBody,
    ).toBe("Use the entrance opposite reception");
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: /^Use the entrance opposite reception$/ }),
    ).toBeVisible();
    browserDiagnostics.acknowledgeAction(
      corrected,
      "Correction appended version2 while retaining original actor/body history.",
    );
    // An unrelated action refreshes the server props while this draft is dirty.
    const unrelated = stale.getByRole("form", {
      name: "Add operational note",
      exact: true,
    });
    await unrelated
      .getByRole("textbox", { name: "Operational note", exact: true })
      .fill("Separate owner note while the earlier correction remains open");
    const refreshed = await act(
      stale,
      unrelated.getByRole("button", { name: "Add note", exact: true }),
    );
    await expect(
      edit(stale).locator('input[name="expectedVersion"]'),
    ).toHaveValue("1");
    await expect(
      edit(stale).getByRole("textbox", {
        name: "Operational note",
        exact: true,
      }),
    ).toHaveValue("Stale draft should stay in this form");
    await expect(
      edit(stale).getByText(/A newer version of this record is available/),
    ).toBeVisible();
    browserDiagnostics.acknowledgeAction(
      refreshed,
      "Unrelated save refreshes current props while retaining the dirty draft and version1 guard.",
    );
    const rejected = await act(
      stale,
      edit(stale).getByRole("button", { name: "Save note", exact: true }),
    );
    await expect(edit(stale).getByRole("alert")).toContainText("changed");
    await expect(edit(stale).getByRole("alert")).toBeFocused();
    await expect(
      edit(stale).getByRole("textbox", {
        name: "Operational note",
        exact: true,
      }),
    ).toHaveValue("Stale draft should stay in this form");
    expect(
      await db.memberOperationalRevision.count({
        where: { workspaceId: gym.workspace.id, recordKey: row.recordKey },
      }),
    ).toBe(2);
    browserDiagnostics.acknowledgeAction(
      rejected,
      "Stale expectedVersion rejected without another revision; draft remains visible.",
    );

    const coachPage = await coachContext.newPage();
    await login(coachPage, gym.coach.email, browserDiagnostics, true);
    const rosterResponse = await coachPage.goto(
      `${admin}/dashboard/schedule/${gym.template.id}/roster?date=${gym.dateKey}`,
    );
    await expect(
      coachPage.getByText("Use the entrance opposite reception", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(coachPage.locator("body")).not.toContainText(
      "OWNER_ONLY_OPERATIONS_SENTINEL",
    );
    await expect(coachPage.locator("body")).not.toContainText(
      "UNREVIEWED_LEGACY_NOTE_SENTINEL",
    );
    await expect(coachPage.locator("body")).not.toContainText(
      "Unclassified legacy label",
    );
    expect(await rosterResponse!.text()).not.toMatch(
      /OWNER_ONLY_OPERATIONS_SENTINEL|UNREVIEWED_LEGACY_NOTE_SENTINEL|Unclassified legacy label/,
    );
    await settled(coachPage);
    const scopedResponse = await coachPage.goto(
      `${admin}/dashboard/members/${gym.member.id}/operations?classTemplateId=${gym.template.id}&date=${gym.dateKey}`,
    );
    await expect(
      coachPage.getByRole("heading", {
        level: 1,
        name: `Operations · ${gym.member.fullName}`,
        exact: true,
      }),
    ).toBeVisible();
    expect(await scopedResponse!.text()).not.toMatch(
      /OWNER_ONLY_OPERATIONS_SENTINEL|UNREVIEWED_LEGACY_NOTE_SENTINEL|Unclassified legacy label/,
    );
    await settled(coachPage);
    await page.setViewportSize({ width: 390, height: 844 });
    await settled(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await info.attach("member-operations-phone", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    browserDiagnostics.assertNoExternalRequests();
  } finally {
    try {
      await coachContext.close();
      await stale.close();
      await page.close();
    } finally {
      detachCoach();
      await db.workspace.delete({ where: { id: gym.workspace.id } });
      await db.user.deleteMany({
        where: { id: { in: gym.users.map((user) => user.id) } },
      });
    }
  }
});

test("MF06 operational labels never grant eligibility and a committed class blocks eligibility-tag removal until its exact exception is reviewed", async ({
  page,
  browser,
  browserDiagnostics,
}) => {
  test.setTimeout(120000);
  const gym = await fixture(),
    coachContext = await browser.newContext();
  const detachCoach = attachBrowserDiagnostics(
    coachContext,
    browserDiagnostics,
  );
  const coachPage = await coachContext.newPage();
  const label = "Reviewed training group";
  try {
    await db.classTemplate.update({
      where: { id: gym.template.id },
      data: {
        prerequisites: {
          minimumRankKey: null,
          minimumStripes: 0,
          allowUnranked: true,
          minimumAge: null,
          maximumAge: null,
          cohortTag: label,
        },
      },
    });
    const booking = await db.classBooking.findFirstOrThrow({
      where: {
        workspaceId: gym.workspace.id,
        memberId: gym.member.id,
        classTemplateId: gym.template.id,
      },
    });
    await login(coachPage, gym.coach.email, browserDiagnostics, true);
    await coachPage.goto(
      `${admin}/dashboard/members/${gym.member.id}/operations?classTemplateId=${gym.template.id}&date=${gym.dateKey}`,
    );
    await expect(
      coachPage.getByRole("heading", {
        level: 1,
        name: `Operations · ${gym.member.fullName}`,
        exact: true,
      }),
    ).toBeVisible();
    const coachAdd = coachPage.getByRole("form", {
      name: "Add internal label",
      exact: true,
    });
    await expect(
      coachAdd.getByRole("combobox", { name: "Label type", exact: true }),
    ).toHaveCount(0);
    await coachAdd.getByLabel("Label", { exact: true }).fill(label);
    const operationalSaved = await act(
      coachPage,
      coachAdd.getByRole("button", { name: "Add label", exact: true }),
    );
    const key = (purpose: string) =>
      `tag:${purpose}:${createHash("sha256").update(label).digest("hex")}`;
    await expect
      .poll(() =>
        db.memberOperationalRevision.count({
          where: {
            workspaceId: gym.workspace.id,
            recordKey: key("OPERATIONAL"),
            actorUserId: gym.coach.id,
            visibility: "ASSIGNED_OPERATIONS",
          },
        }),
      )
      .toBe(1);
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: gym.member.id } }))
        .tags,
    ).toEqual(["Unclassified legacy label"]);
    await expect(
      coachPage.getByText(label, { exact: true }).first(),
    ).toBeVisible();
    expect(operationalSaved.status()).toBe(200);
    browserDiagnostics.acknowledgeAction(
      operationalSaved,
      "One coach operational label persists while the canonical eligibility projection remains unchanged.",
    );

    await login(page, gym.owner.email, browserDiagnostics);
    const profile = `${admin}/dashboard/members/${gym.member.id}`;
    await page.goto(profile);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: gym.member.fullName,
        exact: true,
      }),
    ).toBeVisible();
    const add = page.getByRole("form", {
      name: "Add internal label",
      exact: true,
    });
    await add.getByLabel("Label", { exact: true }).fill(label);
    await add
      .getByRole("combobox", { name: "Label type", exact: true })
      .selectOption("COHORT_ELIGIBILITY");
    await add
      .getByRole("combobox", { name: "Visibility", exact: true })
      .selectOption("ASSIGNED_OPERATIONS");
    const cohortSaved = await act(
      page,
      add.getByRole("button", { name: "Add label", exact: true }),
    );
    await expect
      .poll(
        async () =>
          (await db.member.findUniqueOrThrow({ where: { id: gym.member.id } }))
            .tags,
      )
      .toEqual(["Unclassified legacy label", label]);
    expect(
      await db.memberOperationalRevision.count({
        where: {
          workspaceId: gym.workspace.id,
          recordKey: key("COHORT_ELIGIBILITY"),
          actorUserId: gym.owner.id,
        },
      }),
    ).toBe(1);
    expect(cohortSaved.status()).toBe(200);
    browserDiagnostics.acknowledgeAction(
      cohortSaved,
      "Only the owner's explicit eligibility-tag command updates canonical cohort access.",
    );
    const edit = page
      .getByRole("form", { name: `Edit label ${label}`, exact: true })
      .filter({
        has: page.locator(
          'input[name="tagPurpose"][value="COHORT_ELIGIBILITY"]',
        ),
      });
    await edit
      .getByRole("textbox", {
        name: "Reason for operational change",
        exact: true,
      })
      .fill("Remove this eligibility tag after reviewing the booked class");
    const blocked = await act(
      page,
      edit.getByRole("button", { name: "Retract label", exact: true }),
    );
    await expect(edit.getByRole("alert")).toContainText(
      `booked class on ${gym.dateKey}`,
    );
    await expect(edit.getByRole("alert")).toBeFocused();
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: gym.member.id } }))
        .tags,
    ).toContain(label);
    expect(
      await db.memberOperationalRevision.count({
        where: {
          workspaceId: gym.workspace.id,
          recordKey: key("COHORT_ELIGIBILITY"),
        },
      }),
    ).toBe(1);
    expect(
      await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toEqual(booking);
    expect(blocked.status()).toBe(200);
    browserDiagnostics.acknowledgeAction(
      blocked,
      "A booked-seat prerequisite rejects removal with unchanged tag, immutable history and seat.",
    );

    // The exact exception is fictional setup for the permitted retry, not proof
    // of the separately maintained owner prerequisite-exception UI workflow.
    const template = await db.classTemplate.findUniqueOrThrow({
      where: { id: gym.template.id },
      include: classOccurrenceInclude,
    });
    const occurrence = resolveClassOccurrence({
      template,
      scheduledForDate: gym.dateKey,
    })!;
    await db.classPrerequisiteException.create({
      data: {
        workspaceId: gym.workspace.id,
        memberId: gym.member.id,
        classTemplateId: gym.template.id,
        scheduledForDate: booking.scheduledForDate,
        actorWorkspaceUserId: gym.workspace.workspaceUsers.find(
          (row) => row.userId === gym.owner.id,
        )!.id,
        policyFingerprint: prerequisiteFingerprint(
          occurrence.program.rankPolicy,
          occurrence.prerequisites,
        ),
        reason: "Fictional exact dated exception setup for removal retry",
      },
    });
    const removed = await act(
      page,
      edit.getByRole("button", { name: "Retract label", exact: true }),
    );
    await expect
      .poll(
        async () =>
          (await db.member.findUniqueOrThrow({ where: { id: gym.member.id } }))
            .tags,
      )
      .toEqual(["Unclassified legacy label"]);
    expect(
      await db.memberOperationalRevision.count({
        where: {
          workspaceId: gym.workspace.id,
          recordKey: key("COHORT_ELIGIBILITY"),
        },
      }),
    ).toBe(2);
    expect(
      await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toEqual(booking);
    await expect(
      page.getByRole("form", { name: `Edit label ${label}`, exact: true }),
    ).toHaveCount(1);
    expect(removed.status()).toBe(200);
    await expect(
      page
        .getByRole("region", { name: "Internal operations", exact: true })
        .getByRole("status"),
    ).toContainText("Operational change saved with its author and history.");
    browserDiagnostics.acknowledgeAction(
      removed,
      "The exact reviewed exception permits a single retraction; operational label and committed seat remain intact.",
    );
    await settled(coachPage);
    await coachPage.reload();
    await expect(
      coachPage.getByRole("form", { name: `Edit label ${label}`, exact: true }),
    ).toHaveCount(1);
    await settled(coachPage);
    await add.getByRole("textbox", { name: "Label", exact: true }).fill(label);
    await add
      .getByRole("combobox", { name: "Label type", exact: true })
      .selectOption("COHORT_ELIGIBILITY");
    await add
      .getByRole("combobox", { name: "Visibility", exact: true })
      .selectOption("ASSIGNED_OPERATIONS");
    const reapplied = await act(
      page,
      add.getByRole("button", { name: "Add label", exact: true }),
    );
    await expect
      .poll(
        async () =>
          (await db.member.findUniqueOrThrow({ where: { id: gym.member.id } }))
            .tags,
      )
      .toEqual(["Unclassified legacy label", label]);
    const reappliedHead = await db.memberOperationalRevision.findFirstOrThrow({
      where: {
        workspaceId: gym.workspace.id,
        recordKey: key("COHORT_ELIGIBILITY"),
      },
      orderBy: { version: "desc" },
    });
    expect(reappliedHead).toMatchObject({
      version: 3,
      action: "ADD",
      actorUserId: gym.owner.id,
      tagPurpose: "COHORT_ELIGIBILITY",
    });
    expect(
      await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toEqual(booking);
    await expect(
      page
        .getByRole("region", { name: "Internal operations", exact: true })
        .getByRole("status"),
    ).toContainText("Operational change saved with its author and history.");
    browserDiagnostics.acknowledgeAction(
      reapplied,
      "An explicit fresh label add appends version3 after retraction without changing the committed seat or operational label.",
    );
  } finally {
    try {
      await coachContext.close();
      await page.close();
      browserDiagnostics.assertNoExternalRequests();
      browserDiagnostics.assertNoUnexpected();
    } finally {
      detachCoach();
      await db.workspace.delete({ where: { id: gym.workspace.id } });
      await db.user.deleteMany({
        where: { id: { in: gym.users.map((user) => user.id) } },
      });
    }
  }
});
