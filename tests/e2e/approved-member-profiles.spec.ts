import { expectActionRedirect } from "./support/action-redirect";
import { loginToWorkspace } from "./support/workspace-login";
import {
  attachBrowserDiagnostics,
  expect,
  test,
  type Locator,
  type Page,
  type BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";
import { PrismaClient, type Weekday } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";
import { prepareCleanEvidence } from "./support/clean-evidence";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
)
  throw new Error(
    "Member profile proof requires an explicit disposable local test database.",
  );
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const admin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const member =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const password = "DemoPass123!";
async function fixture() {
  const key = `member-profile-${randomUUID()}`;
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const users = await Promise.all(
    ["owner", "adult", "guardian", "coach"].map((role) =>
      db.user.create({
        data: {
          email: `${key}-${role}@example.test`,
          fullName: `Profile ${role}`,
          passwordHash: seed.passwordHash,
        },
      }),
    ),
  );
  const [owner, adult, guardian, coach] = users as [
    (typeof users)[number],
    (typeof users)[number],
    (typeof users)[number],
    (typeof users)[number],
  ];
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
        create: users.map((user) => ({
          userId: user.id,
          role:
            user.id === owner.id
              ? "OWNER"
              : user.id === coach.id
                ? "COACH"
                : "CUSTOMER",
        })),
      },
      programs: { create: { name: "Training" } },
    },
    include: {
      workspaceUsers: true,
      location: { include: { rooms: true } },
      programs: true,
    },
  });
  await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
  await db.workspaceMigration.create({
    data: {
      workspaceId: workspace.id,
      stage: "COMPLETE",
      nextOwnerAction: "Fictional test complete",
      flowstateResponsibility: "Local test",
      ownerReviewAcknowledgedAt: new Date(),
      ownerReviewAcknowledgedByUserId: owner.id,
      operationallyReadyAt: new Date(),
      operationallyReadyByUserId: owner.id,
    },
  });
  await db.member.create({
    data: {
      workspaceId: workspace.id,
      userId: guardian.id,
      fullName: "Guardian account",
      dateOfBirth: new Date("1980-01-01Z"),
    },
  });
  return { workspace, owner, adult, guardian, coach, users };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(gym: Fixture) {
  await db.workspace.delete({ where: { id: gym.workspace.id } });
  await db.user.deleteMany({
    where: { id: { in: gym.users.map((user) => user.id) } },
  });
}
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
  portal = admin,
  homePath = portal === member ? "/app/schedule" : "/dashboard",
) {
  await loginToWorkspace({
    page,
    origin: portal,
    email,
    password,
    expectedRedirect: portal === member ? "/app;push" : `${homePath};push`,
    destination: {
      path: homePath,
      heading:
        portal === member
          ? "Classes"
          : homePath === "/dashboard/coach/today"
            ? "Today's classes"
            : "Today",
    },
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
async function act(page: Page, control: Locator) {
  const current = page.url();
  const request = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" &&
      candidate.url() === current &&
      !!candidate.headers()["next-action"],
  );
  await control.click();
  const response = await (await request).response();
  expect(response).not.toBeNull();
  await page.waitForLoadState("networkidle");
  return response!;
}
const profileForm = (page: Page) =>
  page.locator("form").filter({
    has: page.getByRole("button", { name: "Save member", exact: true }),
  });
async function contactFields(form: Locator, name: string) {
  await form.getByLabel("Emergency contact name", { exact: true }).fill(name);
  await form
    .getByLabel("Relationship to this member", { exact: true })
    .fill("Neighbor");
  await form.getByLabel("Emergency phone", { exact: true }).fill("555-0199");
}
test.afterAll(async () => {
  await db.$disconnect();
});

test("MF01/MF04 owner creates audited member contacts, stale edits retain their values and sign-in identity stays separate", async ({
  page,
  browserDiagnostics,
}, info) => {
  const gym = await fixture();
  try {
    await login(page, gym.owner.email, browserDiagnostics);
    await page.goto(`${admin}/dashboard/members/new`);
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Profile proof participant");
    await page
      .getByLabel("Email", { exact: true })
      .fill("member-contact@example.test");
    await page.getByLabel("Date of birth", { exact: true }).fill("1990-01-01");
    const created = await act(
      page,
      page.getByRole("button", { name: "Create member", exact: true }),
    );
    await expect(
      page.getByRole("heading", {
        name: "Profile proof participant",
        exact: true,
      }),
    ).toBeVisible();
    const person = await db.member.findFirstOrThrow({
      where: {
        workspaceId: gym.workspace.id,
        fullName: "Profile proof participant",
      },
    });
    expect(person.profileVersion).toBe(1);
    expect(
      await db.memberProfileEvent.count({
        where: { workspaceId: gym.workspace.id, memberId: person.id },
      }),
    ).toBe(1);
    await expectActionRedirect(page, created, `${admin}/dashboard/members/${person.id}`);
    if (created.status() === 200) browserDiagnostics.acknowledgeAction(
      created,
      "The exact participant heading is visible, profile version1 persists, and one attributed profile event exists.",
    );
    await expect(page).toHaveURL(`${admin}/dashboard/members/${person.id}`);
    const form = page.getByRole("form", {
      name: "Add emergency contact",
      exact: true,
    });
    await contactFields(form, "Emergency-only neighbor");
    const added = await act(
      page,
      form.getByRole("button", { name: "Add emergency contact", exact: true }),
    );
    await expect
      .poll(() =>
        db.memberEmergencyContact.count({
          where: {
            workspaceId: gym.workspace.id,
            memberId: person.id,
            retiredAt: null,
          },
        }),
      )
      .toBe(1);
    await expect(
      page.getByRole("heading", {
        name: "Emergency-only neighbor",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await db.familyLink.count({
        where: { workspaceId: gym.workspace.id, childMemberId: person.id },
      }),
    ).toBe(0);
    expect(
      await db.memberPortalGrant.count({
        where: { workspaceId: gym.workspace.id, memberId: person.id },
      }),
    ).toBe(0);
    browserDiagnostics.acknowledgeAction(
      added,
      "One emergency-only contact persists; no family link or permission was created.",
    );
    // A verified fictional account is linked as fixture setup. A contact edit
    // must leave this independent sign-in identity and password untouched.
    await db.member.update({
      where: { id: person.id },
      data: { userId: gym.adult.id },
    });
    const signIn = await db.user.findUniqueOrThrow({
      where: { id: gym.adult.id },
    });
    await page.reload();
    const stale = await page.context().newPage();
    await stale.goto(page.url());
    await expect(
      profileForm(stale).getByLabel("Full name", { exact: true }),
    ).toHaveValue("Profile proof participant");
    await profileForm(page)
      .getByLabel("Email", { exact: true })
      .fill("corrected-contact@example.test");
    await profileForm(page)
      .getByLabel("Reason for profile change", { exact: true })
      .fill("Member verified a different contact address");
    const changed = await act(
      page,
      profileForm(page).getByRole("button", {
        name: "Save member",
        exact: true,
      }),
    );
    await expect
      .poll(
        async () =>
          (await db.member.findUniqueOrThrow({ where: { id: person.id } }))
            .email,
      )
      .toBe("corrected-contact@example.test");
    expect(
      await db.user.findUniqueOrThrow({ where: { id: gym.adult.id } }),
    ).toEqual(signIn);
    await expectActionRedirect(page, changed, `${admin}/dashboard/members/${person.id}`);
    await expect(profileForm(page).getByLabel("Email", { exact: true })).toHaveValue("corrected-contact@example.test");
    if (changed.status() === 200) browserDiagnostics.acknowledgeAction(
      changed,
      "The corrected contact email is rendered and persisted while the linked sign-in identity and password remain unchanged.",
    );
    await expect(page).toHaveURL(`${admin}/dashboard/members/${person.id}`);
    await profileForm(stale)
      .getByLabel("Full name", { exact: true })
      .fill("Stale editor keeps this draft");
    await profileForm(stale)
      .getByLabel("Reason for profile change", { exact: true })
      .fill("This earlier editor should require review");
    const rejected = await act(
      stale,
      profileForm(stale).getByRole("button", {
        name: "Save member",
        exact: true,
      }),
    );
    await expect(profileForm(stale).getByRole("alert")).toContainText(
      "This member changed",
    );
    await expect(profileForm(stale).getByRole("alert")).toBeFocused();
    await expect(
      profileForm(stale).getByLabel("Full name", { exact: true }),
    ).toHaveValue("Stale editor keeps this draft");
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: person.id } }))
        .fullName,
    ).toBe("Profile proof participant");
    expect(
      await db.memberProfileEvent.count({
        where: { workspaceId: gym.workspace.id, memberId: person.id },
      }),
    ).toBe(3);
    browserDiagnostics.acknowledgeAction(
      rejected,
      "Stale edit rejected in context, draft retained and database state/history unchanged.",
    );
    await stale.close();
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Profile and emergency contact history",
        exact: true,
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await prepareCleanEvidence(page);
    await page.screenshot({
      path: info.outputPath("member-profile-phone.png"),
      fullPage: true,
    });
    browserDiagnostics.assertNoExternalRequests();
  } finally {
    await cleanup(gym);
  }
});

test("MF04 explicit guardian emergency grant is independent; assigned coach reads contacts and revoked access blocks a stale form", async ({
  page,
  browser,
  browserDiagnostics,
}) => {
  const gym = await fixture();
  const guardianContext = await browser.newContext(),
    coachContext = await browser.newContext();
  const detachGuardian = attachBrowserDiagnostics(
      guardianContext,
      browserDiagnostics,
    ),
    detachCoach = attachBrowserDiagnostics(coachContext, browserDiagnostics);
  try {
    const child = await db.member.create({
      data: {
        workspaceId: gym.workspace.id,
        fullName: "Emergency child",
        dateOfBirth: new Date("2015-01-01Z"),
        notes: "LEGACY_OWNER_ONLY_SENTINEL",
      },
    });
    const guardian = await db.guardian.create({
      data: {
        workspaceId: gym.workspace.id,
        fullName: "Verified adult",
        familyLinks: {
          create: { workspaceId: gym.workspace.id, childMemberId: child.id },
        },
      },
    });
    const grant = await db.memberPortalGrant.create({
      data: {
        workspaceId: gym.workspace.id,
        memberId: child.id,
        userId: gym.guardian.id,
        guardianId: guardian.id,
        verifiedByWorkspaceUserId: gym.workspace.workspaceUsers.find(
          (staff) => staff.userId === gym.owner.id,
        )!.id,
        verificationNote: "Fictional checked identity",
        canBook: true,
        canSign: true,
        canPay: true,
      },
    });
    const guardianPage = await guardianContext.newPage();
    await login(guardianPage, gym.guardian.email, browserDiagnostics, member);
    await guardianPage.goto(
      `${member}/app/account/emergency?memberId=${child.id}`,
    );
    await expect(
      guardianPage.getByText(
        /Ask the gym to verify your emergency contact permission/,
      ),
    ).toBeVisible();
    await expect(
      guardianPage.getByRole("form", {
        name: "Add emergency contact",
        exact: true,
      }),
    ).toHaveCount(0);
    await login(page, gym.owner.email, browserDiagnostics);
    await page.goto(`${admin}/dashboard/members/${child.id}`);
    const permissions = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Save verified permissions",
        exact: true,
      }),
    });
    await permissions
      .getByLabel("Manage emergency contacts for this child", { exact: true })
      .check();
    await permissions.getByLabel(/I verified this account holder/).check();
    await permissions
      .getByLabel("Verification or revocation note", { exact: true })
      .fill("Verified guardian emergency-contact authority");
    const granted = await act(
      page,
      permissions.getByRole("button", {
        name: "Save verified permissions",
        exact: true,
      }),
    );
    await expect
      .poll(
        async () =>
          (
            await db.memberPortalGrant.findUniqueOrThrow({
              where: { id: grant.id },
            })
          ).canManageEmergencyContacts,
      )
      .toBe(true);
    await expect(permissions.getByRole("status")).toContainText(
      "Family permissions saved.",
    );
    browserDiagnostics.acknowledgeAction(
      granted,
      "The exact guardian received a separately verified emergency-contact grant.",
    );
    await guardianPage.reload();
    const form = guardianPage.getByRole("form", {
      name: "Add emergency contact",
      exact: true,
    });
    await contactFields(form, "Guardian-provided emergency neighbor");
    const added = await act(
      guardianPage,
      form.getByRole("button", { name: "Add emergency contact", exact: true }),
    );
    await expect
      .poll(() =>
        db.memberEmergencyContact.count({
          where: { workspaceId: gym.workspace.id, memberId: child.id },
        }),
      )
      .toBe(1);
    await expect(
      guardianPage.getByRole("heading", {
        name: "Guardian-provided emergency neighbor",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await db.memberProfileEvent.findFirstOrThrow({
        where: { workspaceId: gym.workspace.id, memberId: child.id },
      }),
    ).toMatchObject({
      actorUserId: gym.guardian.id,
      actorRoleSnapshot: "CUSTOMER",
    });
    browserDiagnostics.acknowledgeAction(
      added,
      "The intended child's current emergency contact and guardian attribution persist.",
    );
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 14);
    const key = date.toISOString().slice(0, 10);
    const weekdays: Weekday[] = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];
    const template = await db.classTemplate.create({
      data: {
        workspaceId: gym.workspace.id,
        programId: gym.workspace.programs[0]!.id,
        roomId: gym.workspace.location!.rooms[0]!.id,
        coachWorkspaceUserId: gym.workspace.workspaceUsers.find(
          (staff) => staff.userId === gym.coach.id,
        )!.id,
        title: "Emergency roster",
        weekday: weekdays[date.getUTCDay()]!,
        startTimeMinutes: 600,
        endTimeMinutes: 660,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
      },
    });
    await db.classBooking.create({
      data: {
        workspaceId: gym.workspace.id,
        memberId: child.id,
        classTemplateId: template.id,
        scheduledForDate: new Date(`${key}T00:00:00Z`),
        status: "BOOKED",
      },
    });
    const coachPage = await coachContext.newPage();
    await login(coachPage, gym.coach.email, browserDiagnostics, admin, "/dashboard/coach/today");
    await coachPage.goto(
      `${admin}/dashboard/schedule/${template.id}/roster?date=${key}`,
    );
    await expect(
      coachPage.getByText("Guardian-provided emergency neighbor", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(coachPage.locator("body")).not.toContainText(
      "LEGACY_OWNER_ONLY_SENTINEL",
    );
    await expect(
      coachPage.getByRole("button", {
        name: "Save emergency contact",
        exact: true,
      }),
    ).toHaveCount(0);
    await contactFields(
      guardianPage.getByRole("form", {
        name: "Add emergency contact",
        exact: true,
      }),
      "Stale denied contact",
    );
    await page.reload();
    const currentPermissions = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Save verified permissions",
        exact: true,
      }),
    });
    await currentPermissions
      .getByLabel("Manage emergency contacts for this child", { exact: true })
      .uncheck();
    await currentPermissions
      .getByLabel(/I verified this account holder/)
      .check();
    await currentPermissions
      .getByLabel("Verification or revocation note", { exact: true })
      .fill("Emergency contact permission withdrawn");
    const revoked = await act(
      page,
      currentPermissions.getByRole("button", {
        name: "Save verified permissions",
        exact: true,
      }),
    );
    await expect
      .poll(
        async () =>
          (
            await db.memberPortalGrant.findUniqueOrThrow({
              where: { id: grant.id },
            })
          ).canManageEmergencyContacts,
      )
      .toBe(false);
    browserDiagnostics.acknowledgeAction(
      revoked,
      "Emergency permission removed while the independent booking/signing/payment grant remains.",
    );
    const denied = await act(
      guardianPage,
      guardianPage
        .getByRole("form", { name: "Add emergency contact", exact: true })
        .getByRole("button", { name: "Add emergency contact", exact: true }),
    );
    await expect(
      guardianPage
        .getByRole("alert")
        .filter({ hasText: "These emergency contacts are unavailable" }),
    ).toBeVisible();
    expect(
      await db.memberEmergencyContact.count({
        where: { workspaceId: gym.workspace.id, memberId: child.id },
      }),
    ).toBe(1);
    expect(
      await db.memberPortalGrant.findUniqueOrThrow({ where: { id: grant.id } }),
    ).toMatchObject({
      canBook: true,
      canSign: true,
      canPay: true,
      canManageEmergencyContacts: false,
    });
    browserDiagnostics.acknowledgeAction(
      denied,
      "Fresh authorization rejected the stale contact form; original contact and independent permissions persist.",
    );
    browserDiagnostics.assertNoExternalRequests();
  } finally {
    try {
      browserDiagnostics.assertNoUnexpected();
    } finally {
      detachGuardian();
      detachCoach();
      await guardianContext.close();
      await coachContext.close();
      await cleanup(gym);
    }
  }
});
