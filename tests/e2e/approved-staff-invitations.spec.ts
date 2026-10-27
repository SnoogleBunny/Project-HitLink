import { loginToWorkspace } from "./support/workspace-login";
import { expectActionRedirect } from "./support/action-redirect";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  attachBrowserDiagnostics,
  expect,
  test,
  type Locator,
  type Page,
} from "./support/browser-diagnostics";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
)
  throw new Error(
    "Staff invitation workflows require an explicit disposable local test database.",
  );
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const admin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const password = "DemoPass123!";
const fixtureId = `staff-invite-e2e-${randomUUID()}`;
let ownerId = "",
  coachId = "",
  workspaceId = "",
  email = "",
  revokedEmail = "",
  oldToken = "";

test.beforeAll(async () => {
  const source = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const owner = await db.user.create({
    data: {
      email: `${fixtureId}-owner@example.test`,
      fullName: "Fictional Invitation Owner",
      passwordHash: source.passwordHash,
    },
  });
  ownerId = owner.id;
  email = `${fixtureId}-coach@example.test`;
  revokedEmail = `${fixtureId}-unused@example.test`;
  const coach = await db.user.create({
    data: {
      email,
      fullName: "Fictional Invited Coach",
      passwordHash: source.passwordHash,
    },
  });
  coachId = coach.id;
  const workspace = await db.workspace.create({
    data: {
      name: fixtureId,
      status: "ACTIVE",
      location: { create: { name: "Fictional Gym", timezone: "UTC" } },
      workspaceUsers: { create: { userId: ownerId, role: "OWNER" } },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional local browser fixture ready",
          flowstateResponsibility: "Fictional invitation acceptance proof",
          ownerReviewAcknowledgedAt: new Date(),
          ownerReviewAcknowledgedByUserId: ownerId,
          operationallyReadyAt: new Date(),
          operationallyReadyByUserId: ownerId,
        },
      },
    },
  });
  workspaceId = workspace.id;
  oldToken = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: {
      userId: coachId,
      tokenHash: createHash("sha256").update(oldToken).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
});
test.afterAll(async () => {
  if (workspaceId)
    await db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT set_config('hitlink.reviewed_retention_workspace', $1, true)",
        workspaceId,
      );
      await tx.workspace.deleteMany({ where: { id: workspaceId } });
    });
  await db.user.deleteMany({
    where: { id: { in: [ownerId, coachId].filter(Boolean) } },
  });
  await db.$disconnect();
});
async function submit(page: Page, button: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        !!candidate.request().headers()["next-action"],
    ),
    button.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  return response;
}
async function queuedLink(inviteId: string) {
  const job = await db.notificationJob.findFirstOrThrow({
    where: {
      workspaceId,
      status: "PENDING",
      context: { path: ["inviteId"], equals: inviteId },
    },
    orderBy: { createdAt: "desc" },
  });
  const link = job.body.match(/https?:\/\/[^\s]+/)?.[0];
  expect(link).toBeTruthy();
  const parsed = new URL(link!);
  expect(parsed.origin).toBe(new URL(admin).origin);
  expect(parsed.pathname).toBe("/staff-invite");
  expect(parsed.search).toBe("");
  expect(new URLSearchParams(parsed.hash.slice(1)).get("token")).toBeTruthy();
  return { job, link: parsed.href };
}
async function fillInvitation(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByLabel("Invited email", { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.getByLabel("Invited email", { exact: true }).fill(email);
  await page.getByLabel("Account password", { exact: true }).fill(password);
  await page.waitForLoadState("networkidle");
}

test("owner rotates a coach invite, exact account accepts once, and invitation history and session revocation remain attributable", async ({
  page,
  browser,
  browserDiagnostics,
}, info) => {
  const coachContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const oldContext = await browser.newContext();
  const detachCoach = attachBrowserDiagnostics(
    coachContext,
    browserDiagnostics,
  );
  const detachOld = attachBrowserDiagnostics(oldContext, browserDiagnostics);
  try {
    await loginToWorkspace({
      page,
      origin: admin,
      email: `${fixtureId}-owner@example.test`,
      password,
      expectedRedirect: "/dashboard;push",
      destination: { path: "/dashboard", heading: "Today" },
      diagnostics: browserDiagnostics,
    });

    await page.goto(`${admin}/dashboard/staff-invites`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Coach email", { exact: true }).fill(email);
    const created = await submit(
      page,
      page.getByRole("button", { name: "Invite coach", exact: true }),
    );
    const row = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: email, exact: true }) })
      .filter({
        has: page.getByRole("button", { name: "Resend", exact: true }),
      });
    await expect(row).toBeVisible();
    const invite = await db.staffInvite.findFirstOrThrow({
      where: { workspaceId, email, status: "PENDING" },
    });
    const initial = await queuedLink(invite.id);
    expect(initial.job.providerMessageId).toBeNull();
    await page.waitForLoadState("networkidle");
    await expectActionRedirect(
      page,
      created,
      `${admin}/dashboard/staff-invites`,
    );
    if (created.status() === 200)
      browserDiagnostics.acknowledgeAction(
        created,
        "The exact coach invitation is visible and pending in the workspace with its locally queued, unsent invitation message.",
      );

    const resent = await submit(
      page,
      row.getByRole("button", { name: "Resend", exact: true }),
    );
    await expect
      .poll(
        async () =>
          (await db.staffInvite.findUniqueOrThrow({ where: { id: invite.id } }))
            .token,
      )
      .not.toBe(invite.token);
    const replacement = await queuedLink(invite.id);
    expect(replacement.link).not.toBe(initial.link);
    expect(
      (
        await db.notificationJob.findUniqueOrThrow({
          where: { id: initial.job.id },
        })
      ).body,
    ).toBe("");
    await page.waitForLoadState("networkidle");
    await expectActionRedirect(
      page,
      resent,
      `${admin}/dashboard/staff-invites`,
    );
    await expect(row).toBeVisible();
    if (resent.status() === 200)
      browserDiagnostics.acknowledgeAction(
        resent,
        "The invitation remains visible, its exact persisted token and queued link rotate, and the old bearer body is cleared.",
      );
    const obsolete = await coachContext.newPage();
    await fillInvitation(obsolete, initial.link);
    const rejected = await submit(
      obsolete,
      obsolete.getByRole("button", {
        name: "Accept coach invitation",
        exact: true,
      }),
    );
    await expect(obsolete.locator("form").getByRole("alert")).toContainText(
      "This invitation cannot be accepted.",
    );
    await obsolete.waitForLoadState("networkidle");
    browserDiagnostics.acknowledgeAction(
      rejected,
      "The rotated-out link was rejected without creating workspace access.",
    );
    expect(await db.workspaceUser.count({ where: { userId: coachId } })).toBe(
      0,
    );

    const accepting = await coachContext.newPage();
    await fillInvitation(accepting, replacement.link);
    await expect
      .poll(() =>
        accepting
          .locator("body")
          .evaluate((element) => element.scrollWidth - element.clientWidth),
      )
      .toBeLessThanOrEqual(1);
    await info.attach("coach invitation phone", {
      body: await accepting.screenshot(),
      contentType: "image/png",
    });
    const accepted = await submit(
      accepting,
      accepting.getByRole("button", {
        name: "Accept coach invitation",
        exact: true,
      }),
    );
    await expect(accepting).toHaveURL(`${admin}/dashboard/coach/today`);
    await expect(
      accepting.getByRole("heading", {
        name: "Today's classes",
        exact: true,
      }),
    ).toBeVisible();
    await accepting.waitForLoadState("networkidle");
    expect(
      await db.workspaceUser.findMany({ where: { userId: coachId } }),
    ).toEqual([
      expect.objectContaining({ workspaceId, role: "COACH", isActive: true }),
    ]);
    expect(
      await db.authSession.findUnique({
        where: {
          tokenHash: createHash("sha256").update(oldToken).digest("hex"),
        },
      }),
    ).toBeNull();
    expect(
      await db.workspaceDataEvent.count({
        where: {
          workspaceId,
          kind: "STAFF_INVITE_ACCEPTED",
          actorUserId: coachId,
        },
      }),
    ).toBe(1);
    await expectActionRedirect(
      accepting,
      accepted,
      `${admin}/dashboard/coach/today`,
    );
    if (accepted.status() === 200)
      browserDiagnostics.acknowledgeAction(
        accepted,
        "The coach page is visible for the exact active workspace membership, its prior session is revoked, and one attributed acceptance event persists.",
      );

    await oldContext.addCookies([
      { name: "flowstate_admin_session", value: oldToken, url: admin },
    ]);
    const oldPage = await oldContext.newPage();
    await oldPage.goto(`${admin}/dashboard/coach/today`);
    await expect(oldPage).toHaveURL(`${admin}/login`);
    await oldPage.waitForLoadState("networkidle");
    const replay = await coachContext.newPage();
    await fillInvitation(replay, replacement.link);
    const reused = await submit(
      replay,
      replay.getByRole("button", {
        name: "Accept coach invitation",
        exact: true,
      }),
    );
    await expect(replay.locator("form").getByRole("alert")).toContainText(
      "This invitation cannot be accepted.",
    );
    await replay.waitForLoadState("networkidle");
    browserDiagnostics.acknowledgeAction(
      reused,
      "A fresh document replay of the accepted link was rejected with the same generic result.",
    );

    await page.getByLabel("Coach email", { exact: true }).fill(revokedEmail);
    const unusedCreate = await submit(
      page,
      page.getByRole("button", { name: "Invite coach", exact: true }),
    );
    const unusedRow = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: revokedEmail, exact: true }),
      })
      .filter({
        has: page.getByRole("button", { name: "Revoke", exact: true }),
      });
    await expect(unusedRow).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectActionRedirect(
      page,
      unusedCreate,
      `${admin}/dashboard/staff-invites`,
    );
    expect(
      await db.staffInvite.findFirstOrThrow({
        where: { workspaceId, email: revokedEmail, status: "PENDING" },
      }),
    ).toMatchObject({ workspaceId, email: revokedEmail, status: "PENDING" });
    if (unusedCreate.status() === 200)
      browserDiagnostics.acknowledgeAction(
        unusedCreate,
        "The separately named unused invitation is visible and persisted as pending in this exact workspace before revocation.",
      );
    const revoked = await submit(
      page,
      unusedRow.getByRole("button", { name: "Revoke", exact: true }),
    );
    await expect(unusedRow).toBeHidden();
    expect(
      await db.workspaceDataEvent.count({
        where: {
          workspaceId,
          kind: "STAFF_INVITE_REVOKED",
          actorUserId: ownerId,
        },
      }),
    ).toBe(1);
    await expect(
      page.getByRole("heading", { name: "Invitation history", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(coachId, { exact: false })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectActionRedirect(
      page,
      revoked,
      `${admin}/dashboard/staff-invites`,
    );
    if (revoked.status() === 200)
      browserDiagnostics.acknowledgeAction(
        revoked,
        "The unused invitation disappears, invitation history remains visible, and one owner-attributed revocation event persists.",
      );
  } finally {
    detachCoach();
    detachOld();
    await coachContext.close();
    await oldContext.close();
  }
});
