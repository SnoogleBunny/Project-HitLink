import { loginToWorkspace } from "./support/workspace-login";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Request, Response } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type BrowserDiagnosticsCollector } from "./support/browser-diagnostics";

const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
) {
  throw new Error(
    "Approved interface workflows require an explicit disposable local test database.",
  );
}
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const admin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const member =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";

async function login(
  page: Page,
  origin: string,
  email: string,
  password: string,
  diagnostics?: BrowserDiagnosticsCollector,
) {
  await loginToWorkspace({
    page,
    origin,
    email,
    password,
    expectedRedirect: origin === admin ? "/dashboard;push" : "/app;push",
    destination: {
      path: origin === admin ? "/dashboard" : "/app/schedule",
      heading: origin === admin ? "Today" : "Classes",
    },
    diagnostics,
  });
}

// Supplementary evidence only: no body-finished wait, timeout or collector change.
function observeWebsitePublication(page: Page) {
  const startedAt = Date.now();
  const requests = new Map<
    Request,
    {
      ordinal: number;
      requestMs: number;
      actionSha256: string;
      bodySha256: string | null;
      bodyBytes: number;
      responseMs: number | null;
      status: number | null;
      finishedMs: number | null;
      failedMs: number | null;
      aborted: boolean;
      selectedByHelper: boolean;
    }
  >();
  const elapsed = () => Date.now() - startedAt;
  const onRequest = (request: Request) => {
    const action = request.headers()["next-action"];
    if (
      request.method() !== "POST" ||
      !action ||
      new URL(request.url()).pathname !== "/dashboard/website"
    )
      return;
    const body = request.postDataBuffer();
    requests.set(request, {
      ordinal: requests.size + 1,
      requestMs: elapsed(),
      actionSha256: createHash("sha256").update(action).digest("hex"),
      bodySha256: body ? createHash("sha256").update(body).digest("hex") : null,
      bodyBytes: body?.length ?? 0,
      responseMs: null,
      status: null,
      finishedMs: null,
      failedMs: null,
      aborted: false,
      selectedByHelper: false,
    });
  };
  const onResponse = (response: Response) => {
    const record = requests.get(response.request());
    if (record) {
      record.responseMs = elapsed();
      record.status = response.status();
    }
  };
  const onFinished = (request: Request) => {
    const record = requests.get(request);
    if (record) record.finishedMs = elapsed();
  };
  const onFailed = (request: Request) => {
    const record = requests.get(request);
    if (record) {
      record.failedMs = elapsed();
      record.aborted = request.failure()?.errorText === "net::ERR_ABORTED";
    }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);
  let helperReturnedMs: number | null = null;
  return {
    matched(response: Response) {
      const record = requests.get(response.request());
      if (record) record.selectedByHelper = true;
      helperReturnedMs = elapsed();
    },
    snapshot: () => ({
      elapsedMs: elapsed(),
      helperReturnedMs,
      requests: [...requests.values()],
    }),
    dispose() {
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("requestfinished", onFinished);
      page.off("requestfailed", onFailed);
    },
  };
}

async function websiteAction(
  page: Page,
  button: "Save draft" | "Publish reviewed draft",
) {
  const startedAt = Date.now();
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        !!candidate.request().headers()["next-action"] &&
        new URL(candidate.url()).pathname === "/dashboard/website",
    ),
    page.getByRole("button", { name: button, exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
  await page.waitForLoadState("networkidle");
  return { response, startedAt };
}

test.afterAll(() => db.$disconnect());

test("approved navigation changes at phone, tablet and desktop boundaries without losing modal focus", async ({
  browser,
}) => {
  for (const role of ["owner", "member"] as const) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      await login(
        page,
        role === "owner" ? admin : member,
        `demo-${role}@flowstate.local`,
        role === "owner" ? "DemoPass123!" : "MemberPass123!",
      );
      for (const width of [
        320, 390, 767, 768, 820, 1023, 1024, 1180, 1440, 1536,
      ]) {
        await page.setViewportSize({ width, height: 900 });
        const rail = page.locator(".hl-workspace-sidebar");
        const trigger = page.getByRole("button", {
          name: "Open workspace menu",
          exact: true,
        });
        const bottom = page.getByRole("navigation", {
          name: "Quick navigation",
        });
        if (width >= 1024) {
          await expect(rail).toBeVisible();
          await expect(trigger).toBeHidden();
        } else {
          await expect(rail).toBeHidden();
          await expect(trigger).toBeVisible();
          await trigger.click();
          const menu = page.getByRole("dialog", { name: "Workspace menu" });
          await expect(menu).toBeVisible();
          await expect
            .poll(() =>
              menu.evaluate((element) =>
                element.contains(document.activeElement),
              ),
            )
            .toBe(true);
          await page.keyboard.press("Shift+Tab");
          await expect
            .poll(() =>
              menu.evaluate((element) =>
                element.contains(document.activeElement),
              ),
            )
            .toBe(true);
          await page.keyboard.press("Escape");
          await expect(menu).toBeHidden();
          await expect(trigger).toBeFocused();
        }
        if (width < 768) await expect(bottom).toBeVisible();
        else await expect(bottom).toBeHidden();
        await expect
          .poll(() =>
            page
              .locator(".hl-workspace-content")
              .evaluate((element) => element.scrollWidth - element.clientWidth),
          )
          .toBeLessThanOrEqual(1);
      }
      await page.setViewportSize({ width: 1023, height: 900 });
      await page
        .getByRole("button", { name: "Open workspace menu", exact: true })
        .click();
      await page.setViewportSize({ width: 1024, height: 900 });
      await expect(
        page.getByRole("dialog", { name: "Workspace menu" }),
      ).toBeHidden();
      await expect(
        page.locator('.hl-workspace-sidebar a[aria-current="page"]'),
      ).toBeFocused();
      // Real content must remain usable after the native modal is removed.
      await page
        .locator('.hl-workspace-sidebar a[aria-current="page"]')
        .click();
      await expect(page.locator(".hl-route h1")).toBeVisible();
    } finally {
      await context.close();
    }
  }
});

test("website drafts retain tab edits, publish exact reviewed terms and keep later drafts private", async ({
  page,
  browser,
  browserDiagnostics,
}) => {
  const prefix = `website-e2e-${randomUUID()}`;
  const email = `${prefix}@example.test`;
  const owner = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const userId = `${prefix}-owner`;
  const workspace = await db.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: userId,
        email,
        passwordHash: owner.passwordHash,
        fullName: "Website acceptance owner",
      },
    });
    return tx.workspace.create({
      data: {
        name: "Website acceptance gym",
        status: "ACTIVE",
        location: {
          create: { name: "Main gym", timezone: "America/Vancouver" },
        },
        workspaceUsers: { create: { userId, role: "OWNER" } },
        settings: { create: {} },
        migration: {
          create: {
            stage: "COMPLETE",
            ownerReviewAcknowledgedAt: new Date(),
            ownerReviewAcknowledgedByUserId: userId,
            operationallyReadyAt: new Date(),
            operationallyReadyByUserId: "fictional-e2e-operator",
            nextOwnerAction: "Daily operations are active.",
            flowstateResponsibility: "Fictional browser acceptance fixture.",
            expectedNextMilestone: "Daily operations.",
          },
        },
      },
    });
  });
  const visitor = await browser.newContext();
  let publicationObservation: ReturnType<
    typeof observeWebsitePublication
  > | null = null;
  let reviewedDraftVersion: number | null = null;
  let reviewedDraft: unknown;
  let workflowFailed = false;
  try {
    await db.membershipPlan.create({
      data: {
        workspaceId: workspace.id,
        name: "Weekly three",
        monthlyPriceCents: 14900,
        currency: "cad",
        weeklyClassLimit: 3,
        cancellationPolicyReference:
          "Two calendar months, next billing boundary",
      },
    });
    await login(page, admin, email, "DemoPass123!", browserDiagnostics);
    await page.goto(`${admin}/dashboard/website`);
    await page
      .getByLabel("Public plan name", { exact: true })
      .fill("Three classes a week");
    await page
      .getByLabel("Short plan description", { exact: true })
      .fill("A reviewed weekly training plan.");
    await page.getByLabel("Show on website", { exact: true }).check();
    await page
      .getByRole("tab", { name: "Search and sharing", exact: true })
      .click();
    await page.getByLabel("Website address name", { exact: true }).fill(prefix);
    await page
      .getByLabel("Public gym name", { exact: true })
      .fill("Website acceptance gym");
    await page
      .getByLabel("Short description", { exact: true })
      .fill("A fictional gym for browser acceptance.");
    await page
      .getByLabel("Main headline", { exact: true })
      .fill("Build your weekly routine");
    await page
      .getByLabel("Introduction", { exact: true })
      .fill("Train with a clear schedule and reviewed membership terms.");
    await page
      .getByLabel("Public contact email", { exact: true })
      .fill("gym@example.test");
    await page
      .getByLabel("Search title (up to 70 characters)", { exact: true })
      .fill("Website acceptance gym");
    await page
      .getByLabel("Search description (up to 170 characters)", { exact: true })
      .fill("Three weekly classes at our fictional gym.");
    await page.getByRole("tab", { name: "Pricing", exact: true }).click();
    await expect(
      page.getByLabel("Public plan name", { exact: true }),
    ).toHaveValue("Three classes a week");
    const initialSave = await websiteAction(page, "Save draft");
    await expect(
      page.getByText("Draft saved. The public website has not changed.", {
        exact: true,
      }),
    ).toBeVisible();
    const saved = await db.workspaceWebsite.findUniqueOrThrow({
      where: { workspaceId: workspace.id },
    });
    reviewedDraftVersion = saved.draftVersion;
    reviewedDraft = saved.draft;
    expect(saved.draftVersion).toBe(1);
    expect(saved.publishedVersion).toBeNull();
    expect(
      await db.websitePublication.count({
        where: { workspaceId: workspace.id },
      }),
    ).toBe(0);
    expect(saved.draft).toMatchObject({
      offers: [
        expect.objectContaining({
          name: "Three classes a week",
          weeklyClassLimit: 3,
          monthlyPriceCents: 14900,
        }),
      ],
    });
    browserDiagnostics.acknowledgeAction(
      initialSave.response,
      "The owner sees draft-save confirmation and the exact first draft is persisted without any publication record.",
    );
    await test.info().attach("website-draft-save-response.json", {
      body: Buffer.from(
        JSON.stringify({
          status: initialSave.response.status(),
          elapsedMs: Date.now() - initialSave.startedAt,
          draftVersion: saved.draftVersion,
          publishedVersion: saved.publishedVersion,
        }),
      ),
      contentType: "application/json",
    });
    await page.reload();
    await expect(
      page.getByLabel("Public plan name", { exact: true }),
    ).toHaveValue("Three classes a week");
    await page
      .getByLabel(
        "I reviewed this draft and its prices, class limits and operational cancellation terms.",
        { exact: true },
      )
      .check();
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    publicationObservation = observeWebsitePublication(page);
    const publicationAction = await websiteAction(
      page,
      "Publish reviewed draft",
    );
    publicationObservation.matched(publicationAction.response);
    await expect(
      page.getByText("Published. Visitors now see this reviewed version.", {
        exact: true,
      }),
    ).toBeVisible();
    const published = await db.workspaceWebsite.findUniqueOrThrow({
      where: { workspaceId: workspace.id },
    });
    expect(published.publishedVersion).toBe(saved.draftVersion);
    expect(published.published).toEqual(saved.draft);
    const publication = await db.websitePublication.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        websiteId: published.id,
        version: saved.draftVersion,
      },
    });
    expect(publication.snapshot).toEqual(saved.draft);
    expect(
      await db.websitePublication.count({
        where: {
          workspaceId: workspace.id,
          websiteId: published.id,
          version: saved.draftVersion,
        },
      }),
    ).toBe(1);
    browserDiagnostics.acknowledgeAction(
      publicationAction.response,
      "The owner sees publication confirmation and the exact reviewed draft version/snapshot has one immutable publication record.",
    );
    publicationObservation.dispose();
    await test.info().attach("website-publication-response.json", {
      body: Buffer.from(
        JSON.stringify({
          status: publicationAction.response.status(),
          elapsedMs: Date.now() - publicationAction.startedAt,
          reviewedVersion: saved.draftVersion,
        }),
      ),
      contentType: "application/json",
    });
    const publicPage = await visitor.newPage();
    await publicPage.goto(`${member}/gym/${prefix}/memberships`);
    await expect(
      publicPage.getByRole("heading", {
        name: "Three classes a week",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      publicPage.getByText("3 classes per week.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Public plan name", { exact: true })
      .fill("Unpublished replacement");
    const laterSave = await websiteAction(page, "Save draft");
    await expect(
      page.getByText("Draft saved. The public website has not changed.", {
        exact: true,
      }),
    ).toBeVisible();
    const laterDraft = await db.workspaceWebsite.findUniqueOrThrow({
      where: { workspaceId: workspace.id },
    });
    expect(laterDraft.draftVersion).toBe(saved.draftVersion + 1);
    expect(laterDraft.draft).toMatchObject({
      offers: [expect.objectContaining({ name: "Unpublished replacement" })],
    });
    expect(laterDraft.publishedVersion).toBe(published.publishedVersion);
    expect(laterDraft.published).toEqual(published.published);
    expect(
      await db.websitePublication.findUniqueOrThrow({
        where: { id: publication.id },
      }),
    ).toEqual(publication);
    await publicPage.reload();
    await expect(
      publicPage.getByRole("heading", {
        name: "Three classes a week",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      publicPage.getByText("Unpublished replacement", { exact: true }),
    ).toHaveCount(0);
    expect(
      await db.websitePublication.count({
        where: { workspaceId: workspace.id },
      }),
    ).toBe(1);
    browserDiagnostics.acknowledgeAction(
      laterSave.response,
      "The owner sees draft-save confirmation, the next draft version is persisted, and the public snapshot and sole publication remain unchanged.",
    );
    await test.info().attach("website-later-draft-save-response.json", {
      body: Buffer.from(
        JSON.stringify({
          status: laterSave.response.status(),
          elapsedMs: Date.now() - laterSave.startedAt,
          draftVersion: laterDraft.draftVersion,
          retainedPublishedVersion: laterDraft.publishedVersion,
        }),
      ),
      contentType: "application/json",
    });
  } catch (error) {
    workflowFailed = true;
    throw error;
  } finally {
    // Freeze request state at the failed/passed workflow boundary, then query DB.
    publicationObservation?.dispose();
    const publicationLifecycle = publicationObservation?.snapshot() ?? null;
    // Preserve non-sensitive DB evidence before deleting this fictional fixture.
    try {
      let persisted: unknown;
      try {
        const [head, publicationCount, reviewedPublications] =
          await Promise.all([
            db.workspaceWebsite.findUnique({
              where: { workspaceId: workspace.id },
              select: {
                draftVersion: true,
                publishedVersion: true,
                draft: true,
                published: true,
              },
            }),
            db.websitePublication.count({
              where: { workspaceId: workspace.id },
            }),
            db.websitePublication.findMany({
              where: {
                workspaceId: workspace.id,
                version: reviewedDraftVersion ?? -1,
              },
              select: { version: true, snapshot: true },
              take: 2,
            }),
          ]);
        persisted = {
          captured: true,
          headPresent: head !== null,
          draftVersion: head?.draftVersion ?? null,
          publishedVersion: head?.publishedVersion ?? null,
          reviewedDraftVersion,
          publicationCount,
          draftMatchesReviewed:
            !!head &&
            reviewedDraftVersion !== null &&
            isDeepStrictEqual(head.draft, reviewedDraft),
          publishedMatchesReviewed:
            !!head &&
            reviewedDraftVersion !== null &&
            isDeepStrictEqual(head.published, reviewedDraft),
          exactReviewedPublicationCount: reviewedPublications.length,
          reviewedPublicationSnapshotsMatch:
            reviewedDraftVersion !== null &&
            reviewedPublications.length > 0 &&
            reviewedPublications.every((entry) =>
              isDeepStrictEqual(entry.snapshot, reviewedDraft),
            ),
        };
      } catch {
        persisted = {
          captured: false,
          reason: "database-evidence-capture-failed",
        };
      }
      await test.info().attach("website-publication-before-cleanup.json", {
        body: Buffer.from(
          JSON.stringify({
            workflowFailed,
            lifecycle: publicationLifecycle,
            persisted,
          }),
        ),
        contentType: "application/json",
      });
    } catch {
      // An attachment failure must not replace the original workflow assertion.
      if (!workflowFailed)
        throw new Error("Website publication evidence attachment failed.");
    } finally {
      publicationObservation?.dispose();
      await visitor.close();
      await db.workspace.delete({ where: { id: workspace.id } });
      await db.user.delete({ where: { id: userId } });
    }
  }
});
