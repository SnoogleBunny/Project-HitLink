import { expectActionRedirect } from "./support/action-redirect";
import { loginToWorkspace } from "./support/workspace-login";
import { randomUUID } from "node:crypto";
import type { Request, Route } from "@playwright/test";
import {
  PrismaClient,
  addDays,
  getWeekdayForDateString,
  getWorkspaceDateString,
  lockClassSchedule,
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
} from "../../packages/db/src/index";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../packages/db/src/retention-inventory";
import {
  expect,
  test,
  type BrowserDiagnosticsCollector,
  type Page,
  type Locator,
} from "./support/browser-diagnostics";
const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
  !/test|e2e/i.test(new URL(url).pathname)
)
  throw new Error(
    "Direct funding browser proof requires a dedicated local test database.",
  );
const db = new PrismaClient({ datasourceUrl: url });
const origin =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
async function action(page: Page, button: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        !!r.request().headers()["next-action"],
    ),
    button.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  return response;
}
type HeldScheduleResponse = {
  url: string;
  status: number;
  contentType: string;
};
type HeldScheduleReady =
  | { ok: true; response: HeldScheduleResponse }
  | { ok: false; error: unknown };
type HeldScheduleOutcome = { ok: true } | { ok: false; error: unknown };

// Fetch the real local RSC response, but do not deliver it until the assertion
// finishes. This controls the refresh race without replacing server data.
async function withHeldScheduleRefresh(
  page: Page,
  date: string,
  refreshButton: Locator,
  whileHeld: (response: HeldScheduleResponse) => Promise<void>,
) {
  const localOrigin = new URL(origin);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(localOrigin.hostname)) {
    throw new Error(
      "The held refresh control requires the actual local member app.",
    );
  }
  const matchesUrl = (url: URL) =>
    url.origin === localOrigin.origin &&
    url.pathname === "/app/schedule" &&
    url.searchParams.get("date") === date;
  const isRefresh = (request: Request) => {
    const headers = request.headers();
    return (
      matchesUrl(new URL(request.url())) &&
      request.method() === "GET" &&
      headers["rsc"] === "1" &&
      !headers["next-router-prefetch"] &&
      !headers["next-router-segment-prefetch"] &&
      headers["purpose"] !== "prefetch" &&
      !headers["sec-purpose"]?.includes("prefetch")
    );
  };
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ready!: (result: HeldScheduleReady) => void;
  const responseHeld = new Promise<HeldScheduleReady>((resolve) => {
    ready = resolve;
  });
  const routes: {
    claimed: boolean;
    outcomes: Promise<HeldScheduleOutcome>[];
  } = { claimed: false, outcomes: [] };
  const handler = (route: Route): Promise<void> => {
    const selected = !routes.claimed && isRefresh(route.request());
    if (selected) routes.claimed = true;
    const outcome = (async (): Promise<HeldScheduleOutcome> => {
      try {
        if (!selected) {
          await route.fallback();
          return { ok: true };
        }
        const response = await route.fetch({ maxRedirects: 0 });
        const contentType = response.headers()["content-type"] ?? "";
        if (
          response.status() !== 200 ||
          !contentType.includes("text/x-component")
        ) {
          throw new Error(
            "The held refresh did not return a successful real RSC response.",
          );
        }
        ready({
          ok: true,
          response: {
            url: response.url(),
            status: response.status(),
            contentType,
          },
        });
        await released;
        await route.fulfill({ response });
        return { ok: true };
      } catch (error) {
        if (selected) {
          ready({ ok: false, error });
          // A failed fetch/fulfill is a test failure, never a collector allowance.
          // Abort only to drain the unresolved route; retain the primary error.
          try {
            await route.abort();
          } catch {
            test.info().annotations.push({
              type: "refresh-route-cleanup",
              description:
                "Aborting an already failed refresh route also failed.",
            });
          }
        }
        return { ok: false, error };
      }
    })();
    routes.outcomes.push(outcome);
    return outcome.then(() => undefined);
  };
  await page.route(matchesUrl, handler);
  let primaryFailure = false;
  try {
    // Both observers are drained even if clicking fails. Existing Playwright
    // defaults bound request/fetch waits; this adds no sleeps or timeout budget.
    const request = page.waitForRequest(isRefresh);
    const started = await Promise.allSettled([request, refreshButton.click()]);
    for (const result of started) {
      if (result.status === "rejected") throw result.reason;
    }
    const held = await responseHeld;
    if (!held.ok) throw held.error;
    await whileHeld(held.response);
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    release();
    let cleanup: HeldScheduleOutcome = { ok: true };
    // Keep interception installed until the released real response is fulfilled.
    // Playwright continues an in-flight route when its interceptor is removed.
    // Outcomes are checked below, including handlers registered during unroute.
    await Promise.allSettled(routes.outcomes);
    try {
      await page.unroute(matchesUrl, handler);
    } catch (error) {
      cleanup = { ok: false, error };
    }
    for (let index = 0; index < routes.outcomes.length; index += 1) {
      const outcome = await routes.outcomes[index].then(
        (value) => value,
        (error: unknown): HeldScheduleOutcome => ({ ok: false, error }),
      );
      if (!outcome.ok) {
        if (cleanup.ok) cleanup = outcome;
        else
          test.info().annotations.push({
            type: "refresh-route-cleanup",
            description:
              "Another refresh route cleanup failed after the first cleanup failure.",
          });
      }
    }
    if (!cleanup.ok) {
      if (!primaryFailure) throw cleanup.error;
      test.info().annotations.push({
        type: "refresh-route-cleanup",
        description:
          "The refresh route also failed; the primary failure is preserved.",
      });
    }
  }
}
async function login(page: Page, email: string, diagnostics: BrowserDiagnosticsCollector) {
  await loginToWorkspace({
    page,
    origin,
    email,
    password: "DemoPass123!",
    expectedRedirect: "/app;push",
    destination: { path: "/app/schedule", heading: "Classes" },
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
test.afterAll(() => db.$disconnect());
test("CF01 direct membership review cannot silently spend a paid pack after a hold; fresh exact pack consent persists", async ({
  page,
  context,
  browserDiagnostics,
}) => {
  test.setTimeout(120000);
  const now = new Date(),
    date = addDays(getWorkspaceDateString(now, "UTC"), 7),
    key = randomUUID();
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const owner = await db.user.create({
    data: { email: `${key}-owner@funding.example.test` },
  });
  const account = await db.user.create({
    data: {
      email: `${key}-person@funding.example.test`,
      fullName: "Fictional funding participant",
      passwordHash: seed.passwordHash,
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: `Fictional funding ${key}`,
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
          { userId: account.id, role: "CUSTOMER" },
        ],
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional review complete",
          flowstateResponsibility: "Local proof only",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: { location: { include: { rooms: true } } },
  });
  let other: Page | undefined;
  try {
    await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
    const member = await db.member.create({
      data: {
        workspaceId: workspace.id,
        userId: account.id,
        email: account.email,
        fullName: account.fullName!,
        dateOfBirth: new Date("1990-01-01Z"),
        status: "ACTIVE",
      },
    });
    const program = await db.program.create({
      data: { workspaceId: workspace.id, name: "Funding padwork" },
    });
    const template = await db.classTemplate.create({
      data: {
        workspaceId: workspace.id,
        programId: program.id,
        roomId: workspace.location!.rooms[0]!.id,
        title: "Fictional reviewed funding",
        weekday: getWeekdayForDateString(date),
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 120,
      },
    });
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId: workspace.id,
        name: "Reviewed monthly membership",
        monthlyPriceCents: 10000,
        currency: "cad",
        weeklyClassLimit: 3,
      },
    });
    const membership = await db.memberMembership.create({
      data: {
        workspaceId: workspace.id,
        memberId: member.id,
        membershipPlanId: plan.id,
        startedAt: new Date(+now - 30 * 86400000),
        allowanceTimezone: "UTC",
        allowanceAnchorDate: new Date(
          `${getWorkspaceDateString(now, "UTC")}T00:00:00Z`,
        ),
        acceptedTerms: JSON.parse(
          JSON.stringify(snapshotMembershipTerms(plan, now)),
        ),
      },
    });
    const product = await db.punchCardProduct.create({
      data: {
        workspaceId: workspace.id,
        name: "Explicit three-class pack",
        punchesIncluded: 3,
        priceCents: 3000,
        currency: "cad",
      },
    });
    const pack = await db.memberPunchCard.create({
      data: {
        workspaceId: workspace.id,
        memberId: member.id,
        punchCardProductId: product.id,
        originalPunches: 3,
        remainingPunches: 3,
        purchasePriceCents: 3000,
        purchaseCurrency: "cad",
        acceptedTerms: JSON.parse(
          JSON.stringify(snapshotPunchCardTerms(product, now)),
        ),
      },
    });
    await login(page, account.email, browserDiagnostics);
    await page.goto(`${origin}/app/schedule?date=${date}`);
    await page
      .getByRole("button", { name: /Book class — Fictional reviewed funding/ })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Review booking",
      exact: true,
    });
    await expect(
      dialog.getByText(/This booking uses Reviewed monthly membership/),
    ).toBeVisible();
    const operation = await db.financialOperation.create({
      data: {
        workspaceId: workspace.id,
        operationKey: randomUUID(),
        requestHash: "fictional-browser-review-hold",
        kind: "REFUND",
        providerIdempotencyKey: randomUUID(),
        payload: {},
      },
    });
    const hold = await db.financialEntitlementHold.create({
      data: {
        workspaceId: workspace.id,
        operationId: operation.id,
        targetKind: "MEMBERSHIP",
        targetId: membership.id,
      },
    });
    const denied = await action(
      page,
      dialog.getByRole("button", { name: "Book class", exact: true }),
    );
    await expect(dialog.getByRole("alert")).toContainText(
      "Refresh booking choices",
    );
    browserDiagnostics.acknowledgeAction(
      denied,
      "The stale membership review requires a fresh explicit funding choice.",
    );
    expect(
      await db.classBooking.count({ where: { workspaceId: workspace.id } }),
    ).toBe(0);
    expect(
      await db.membershipAllowanceAllocation.count({
        where: { workspaceId: workspace.id },
      }),
    ).toBe(0);
    expect(
      await db.punchCardEntry.count({ where: { workspaceId: workspace.id } }),
    ).toBe(0);
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: pack.id } }))
        .remainingPunches,
    ).toBe(3);
    expect(
      await db.financialOperation.count({
        where: { workspaceId: workspace.id, kind: "CHECKOUT" },
      }),
    ).toBe(0);
    const expectNoBookingSpend = async () => {
      expect(
        await db.classBooking.count({ where: { workspaceId: workspace.id } }),
      ).toBe(0);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId: workspace.id },
        }),
      ).toBe(0);
      expect(
        await db.punchCardEntry.count({ where: { workspaceId: workspace.id } }),
      ).toBe(0);
      expect(
        (await db.memberPunchCard.findUniqueOrThrow({ where: { id: pack.id } }))
          .remainingPunches,
      ).toBe(3);
      expect(
        await db.financialOperation.count({
          where: { workspaceId: workspace.id, kind: "CHECKOUT" },
        }),
      ).toBe(0);
      expect(
        (
          await db.financialEntitlementHold.findUniqueOrThrow({
            where: { id: hold.id },
          })
        ).activeSlot,
      ).toBe("ACTIVE");
    };
    // includeHidden observes the retained occurrence while the shared loading
    // state hides it. Hiding alone must not leave a stale enabled action behind.
    const bookingChoice = page.getByRole("button", {
      name: /Book class — Fictional reviewed funding/,
      includeHidden: true,
    });
    await withHeldScheduleRefresh(
      page,
      date,
      dialog.getByRole("button", {
        name: "Refresh booking choices",
        exact: true,
      }),
      async (held) => {
        expect(held.status).toBe(200);
        expect(new URL(held.url).origin).toBe(new URL(origin).origin);
        expect(held.contentType).toContain("text/x-component");
        // Intended RED on the old UI: the real new response is held, and the
        // old occurrence's booking action is still enabled there.
        await expect(bookingChoice).toBeDisabled();
        await expect(page.locator("#workspace-content")).toHaveAttribute(
          "aria-busy",
          "true",
        );
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: "Loading member records" }),
        ).toBeVisible();
        await expect(dialog).not.toBeVisible();
        await expectNoBookingSpend();
      },
    );
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#workspace-content")).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(bookingChoice).toBeEnabled();
    await expect(bookingChoice).toBeVisible();
    await expect(dialog).not.toBeVisible();
    await bookingChoice.click();
    await expect(
      dialog.getByText(
        "This booking uses one unit from Explicit three-class pack. Your gym’s cancellation rules apply.",
        { exact: true },
      ),
    ).toBeVisible();
    const freshReview = JSON.parse(
      await dialog.locator('input[name="reviewedFunding"]').inputValue(),
    );
    expect(freshReview).toMatchObject({
      schemaVersion: 1,
      workspaceId: workspace.id,
      memberId: member.id,
      classTemplateId: template.id,
      scheduledForDate: date,
      funding: { kind: "PUNCH_CARD", id: pack.id, units: 1 },
    });
    await expectNoBookingSpend();
    const booked = await action(
      page,
      dialog.getByRole("button", { name: "Book class", exact: true }),
    );
    await expect(
      page.getByText("Your place is booked.", { exact: true }),
    ).toBeVisible();
    const committedBooking = await db.classBooking.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        memberId: member.id,
        classTemplateId: template.id,
      },
    });
    expect(committedBooking).toMatchObject({
      status: "BOOKED",
      bookingType: "PUNCH_CARD",
      memberPunchCardId: pack.id,
      fundingMembershipId: null,
    });
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: pack.id } }))
        .remainingPunches,
    ).toBe(2);
    expect(
      await db.punchCardEntry.count({
        where: { workspaceId: workspace.id, delta: -1 },
      }),
    ).toBe(1);
    expect(
      (
        await db.financialEntitlementHold.findUniqueOrThrow({
          where: { id: hold.id },
        })
      ).activeSlot,
    ).toBe("ACTIVE");
    const committedBookingPath = `/app/schedule?${new URLSearchParams({
      date,
      booking: committedBooking.id,
      notice: "booked",
    })}`;
    await expectActionRedirect(page, booked, `${origin}${committedBookingPath}`);
    if (booked.status() === 200) browserDiagnostics.acknowledgeAction(
      booked,
      "The exact reviewed pack booking is visible, one pack debit persists, remaining punches are2, and the unrelated membership hold remains active.",
    );
    expect(booked.headers()["content-type"]).toContain("text/x-component");
    expect(booked.headers()["x-action-redirect"]).toBe(
      `${committedBookingPath};push`,
    );
    await expect(page).toHaveURL(`${origin}${committedBookingPath}`);
    await page.close();
    await context.clearCookies();
    other = await context.newPage();
    await login(other, account.email, browserDiagnostics);
    await other.goto(`${origin}/app/schedule?date=${date}`);
    await expect(
      other.getByRole("button", {
        name: /Manage — Fictional reviewed funding/,
      }),
    ).toBeVisible();
    expect(
      await db.classBooking.count({
        where: { workspaceId: workspace.id, status: "BOOKED" },
      }),
    ).toBe(1);
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: pack.id } }))
        .remainingPunches,
    ).toBe(2);
  } finally {
    if (!page.isClosed()) await page.close();
    if (other && !other.isClosed()) await other.close();
    await db.$transaction(
      async (tx) => {
        await lockClassSchedule(tx, workspace.id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspace.id}`}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${workspace.id}`}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention:${workspace.id}`}))`;
        const inventory = await inspectRetentionInventory(tx, workspace.id);
        await deleteReviewedWorkspaceRecords(
          tx,
          workspace.id,
          inventory.fingerprint,
        );
      },
      { isolationLevel: "Serializable", timeout: 120000 },
    );
    await db.user.deleteMany({ where: { id: { in: [owner.id, account.id] } } });
  }
});
