import { loginToWorkspace } from "./support/workspace-login";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@flowstate/auth";
import {
  Prisma,
  PrismaClient,
  addDays,
  getWeekdayForDateString,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  lockClassSchedule,
  normalizeAuthoritySerializationError,
  createAccessBackedBooking,
  processMembershipGraceDisposition,
  reconcileMembershipInvoice,
  membershipGraceReleaseMessage,
  snapshotMembershipTerms,
  type InvoiceEvidence,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";
import {
  deleteReviewedWorkspaceRecords,
  inspectRetentionInventory,
} from "../../packages/db/src/retention-inventory.js";
import {
  expect,
  test,
  type Locator,
  type BrowserDiagnosticsCollector,
  type Page,
} from "./support/browser-diagnostics";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "Membership-grace browser proof needs an explicit disposable database.",
  );
const target = new URL(databaseUrl);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
  [...target.searchParams.keys()].some((key) => key.toLowerCase() === "host") ||
  !/^[A-Za-z0-9_]+_test$/.test(decodeURIComponent(target.pathname.slice(1))) ||
  (process.env.TEST_DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== databaseUrl)
)
  throw new Error(
    "Membership-grace browser proof requires one loopback *_test database; DATABASE_URL and TEST_DATABASE_URL must agree when both are set.",
  );

const db = new PrismaClient({ datasourceUrl: databaseUrl });
const adminBase =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const memberBase =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const password = "ExplicitGraceFixture123!";
const workspaces: string[] = [];
const users: string[] = [];
const privateSentinel = "GRACE_PRIVATE_NOTES_SENTINEL";

type Fixture = {
  workspaceId: string;
  ownerEmail: string;
  memberEmail: string;
  memberId: string;
  membershipId: string;
  classTemplateId: string;
  date: string;
  startsAt: Date;
  title: string;
  bookingId: string;
  evidence: InvoiceEvidence;
};

async function fixture(): Promise<Fixture> {
  const key = `grace-browser-${randomUUID()}`;
  const now = new Date();
  const beforeGrace = new Date(+now - 8 * 86400000);
  const date = addDays(getWorkspaceDateString(now, "UTC"), 7);
  const passwordHash = await hashPassword(password);
  const owner = await db.user.create({
    data: {
      email: `${key}-owner@example.test`,
      fullName: "Fictional Grace Owner",
      passwordHash,
    },
  });
  users.push(owner.id);
  const account = await db.user.create({
    data: {
      email: `${key}-member@example.test`,
      fullName: "Fictional Grace Participant",
      passwordHash,
    },
  });
  users.push(account.id);
  const workspace = await db.workspace.create({
    data: {
      name: key,
      status: "ACTIVE",
      stripeSettings: {
        create: {
          stripeAccountId: `acct_${key}`,
          failedPaymentGracePeriodDays: 7,
        },
      },
      location: {
        create: {
          name: "Fictional grace gym",
          timezone: "UTC",
          addressLine1: "42 Fictional Way",
          city: "Example City",
          countryCode: "CA",
          rooms: { create: { name: "Grace mat", capacity: 8 } },
        },
      },
      workspaceUsers: {
        create: [
          { userId: owner.id, role: "OWNER", isActive: true },
          { userId: account.id, role: "CUSTOMER", isActive: true },
        ],
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional browser handoff complete",
          flowstateResponsibility: "Isolated membership grace proof",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: { location: { include: { rooms: true } } },
  });
  // Register immediately: a later setup failure still uses canonical scoped cleanup.
  workspaces.push(workspace.id);
  await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
  const member = await db.member.create({
    data: {
      workspaceId: workspace.id,
      userId: account.id,
      email: account.email,
      fullName: "Fictional Grace Participant",
      notes: privateSentinel,
      dateOfBirth: new Date("1990-01-01T00:00:00Z"),
      status: "ACTIVE",
    },
  });
  const program = await db.program.create({
    data: { workspaceId: workspace.id, name: "Fictional grace training" },
  });
  const title = `Fictional grace padwork ${key.slice(-8)}`;
  const template = await db.classTemplate.create({
    data: {
      workspaceId: workspace.id,
      programId: program.id,
      roomId: workspace.location!.rooms[0]!.id,
      title,
      weekday: getWeekdayForDateString(date),
      startTimeMinutes: 1080,
      endTimeMinutes: 1140,
      bookingCutoffMinutes: 60,
      cancellationCutoffMinutes: 21600,
    },
  });
  const plan = await db.membershipPlan.create({
    data: {
      workspaceId: workspace.id,
      name: "Fictional grace membership",
      monthlyPriceCents: 10000,
      currency: "cad",
      weeklyClassLimit: 3,
      monthlyClassLimit: 8,
      allowanceCountingMode: "RESERVATION",
      lateCancellationConsumesClass: true,
      noShowConsumesClass: true,
    },
  });
  const payer = await db.financialAccount.create({
    data: {
      workspaceId: workspace.id,
      userId: account.id,
      memberId: member.id,
      stripeAccountId: `acct_${key}`,
      stripeCustomerId: `cus_${key}`,
    },
  });
  const membership = await db.memberMembership.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      membershipPlanId: plan.id,
      payerAccountId: payer.id,
      stripeSubscriptionId: `sub_${key}`,
      status: "ACTIVE",
      startedAt: new Date(+now - 30 * 86400000),
      allowanceAnchorDate: new Date(
        `${getWorkspaceDateString(now, "UTC")}T00:00:00Z`,
      ),
      allowanceTimezone: "UTC",
      acceptedTerms: JSON.parse(
        JSON.stringify(snapshotMembershipTerms(plan, beforeGrace)),
      ),
    },
  });
  // The persisted booking is made through the real booking API before the
  // fictional first failure. No provider is contacted or payment fabricated.
  const booked = await createAccessBackedBooking({
    workspaceId: workspace.id,
    memberId: member.id,
    classTemplateId: template.id,
    scheduledForDate: date,
    timezone: "UTC",
    source: "ADMIN",
    db: db as never,
    now: beforeGrace,
  });
  expect(booked.status).toBe("created");
  if (booked.status === "error") throw Error(booked.message);
  const evidence: InvoiceEvidence = {
    id: `in_${key}`,
    accountId: `acct_${key}`,
    subscriptionId: membership.stripeSubscriptionId,
    customerId: `cus_${key}`,
    status: "OPEN",
    number: "FICTIONAL-GRACE-1",
    currency: "cad",
    subtotalCents: 10000,
    taxCents: 0,
    totalCents: 10000,
    amountPaidCents: 0,
    amountDueCents: 10000,
    issuedAt: beforeGrace,
    dueAt: beforeGrace,
    paidAt: null,
    voidedAt: null,
    firstFailedAt: beforeGrace,
    failureCode: "card_declined",
    failureMessage: "Payment needs attention",
    payments: [],
  };
  await reconcileMembershipInvoice({
    workspaceId: workspace.id,
    evidence,
    eventId: `evt_${randomUUID()}`,
    db,
    now: beforeGrace,
    graceClock: () => beforeGrace,
  });
  expect(
    (
      await db.classBooking.findUniqueOrThrow({
        where: { id: booked.bookingId },
      })
    ).status,
  ).toBe("BOOKED");
  return {
    workspaceId: workspace.id,
    ownerEmail: owner.email,
    memberEmail: account.email,
    memberId: member.id,
    membershipId: membership.id,
    classTemplateId: template.id,
    date,
    startsAt: getZonedDateTimeAsUtc({
      dateString: date,
      minutes: 1080,
      timezone: "UTC",
    }),
    title,
    bookingId: booked.bookingId,
    evidence,
  };
}

async function cleanup() {
  while (workspaces.length) {
    const workspaceId = workspaces[0]!;
    for (let attempt = 0; ; attempt++) {
      try {
        await db.$transaction(
          async (tx) => {
            await lockClassSchedule(tx, workspaceId);
            for (const prefix of ["family-access", "financial", "retention"])
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${workspaceId}`}))::text`;
            const inventory = await inspectRetentionInventory(tx, workspaceId);
            await deleteReviewedWorkspaceRecords(
              tx,
              workspaceId,
              inventory.fingerprint,
            );
          },
          { isolationLevel: "Serializable", timeout: 120000 },
        );
        workspaces.shift(); // Drain only after successful canonical purge.
        break;
      } catch (caught) {
        const error = normalizeAuthoritySerializationError(caught);
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" ||
          attempt >= 3
        )
          throw error;
      }
    }
  }
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  users.splice(0, users.length);
}

async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
async function action(page: Page, control: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        !!candidate.request().headers()["next-action"],
    ),
    control.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  await settled(page);
  return response;
}
async function login(page: Page, origin: string, email: string, diagnostics: BrowserDiagnosticsCollector) {
  await loginToWorkspace({
    page,
    origin,
    email,
    password,
    expectedRedirect: origin === adminBase ? "/dashboard;push" : "/app;push",
    destination: {
      path: origin === adminBase ? "/dashboard" : "/app/schedule",
      heading: origin === adminBase ? "Today" : "Classes",
    },
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}

// These cases exercise rendered owner/member pages around direct domain calls.
// They do not certify the HTTP scheduler, a provider webhook or live payments.
test.describe("MP13 member and owner visibility after expired payment grace", () => {
  test.setTimeout(120000);
  test.afterEach(cleanup);
  test.afterAll(() => db.$disconnect());

  test("shows penalty-free release and its owner receipt; later settlement requires a fresh member booking", async ({
    page,
    context,
    browserDiagnostics,
  }, info) => {
    const f = await fixture();
    const booking = await db.classBooking.findUniqueOrThrow({
      where: { id: f.bookingId },
    });
    const original = await db.membershipAllowanceAllocation.findMany({
      where: { bookingId: f.bookingId, bookingRevision: 1 },
      orderBy: { id: "asc" },
    });
    expect(original).toHaveLength(2);
    expect(original.every((row) => row.state === "RESERVED")).toBe(true);
    const debt = await db.invoice.findFirstOrThrow({
      where: { workspaceId: f.workspaceId },
    });
    expect(debt).toMatchObject({ status: "OPEN", amountDueCents: 10000 });
    expect(+debt.gracePeriodEndsAt!).toBeLessThan(Date.now());
    const memberPage = await context.newPage();
    try {
      await login(memberPage, memberBase, f.memberEmail, browserDiagnostics);
      await memberPage.goto(
        `${memberBase}/app/schedule?date=${f.date}&booking=${f.bookingId}`,
      );
      await settled(memberPage);
      const before = memberPage.getByRole("dialog", {
        name: "Booking details",
        exact: true,
      });
      await expect(before).toContainText(f.title);
      await expect(before).not.toContainText(membershipGraceReleaseMessage);
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.bookingId },
          })
        ).status,
      ).toBe("BOOKED");

      const minutesUntilClass = (+f.startsAt - Date.now()) / 60000;
      expect(minutesUntilClass).toBeGreaterThan(0);
      expect(minutesUntilClass).toBeLessThan(21600);
      const released =
        await test.step("Direct bounded maintenance domain call on the expired canonical invoice", () =>
          processMembershipGraceDisposition({
            workspaceId: f.workspaceId,
            db,
          }));
      expect(released).toMatchObject({
        cancelled: 1,
        nextBookingId: null,
        workspaceNotReady: false,
      });
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.bookingId },
          })
        ).status,
      ).toBe("CANCELLED");
      const allocations = await db.membershipAllowanceAllocation.findMany({
        where: { bookingId: f.bookingId, bookingRevision: 1 },
        orderBy: { id: "asc" },
      });
      expect(
        allocations.map((row) => [
          row.id,
          row.periodStart,
          row.periodEnd,
          row.state,
        ]),
      ).toEqual(
        original.map((row) => [
          row.id,
          row.periodStart,
          row.periodEnd,
          "RELEASED",
        ]),
      );
      expect(
        await db.membershipAllowanceEntry.count({
          where: { workspaceId: f.workspaceId, usedDelta: 1 },
        }),
      ).toBe(0);
      expect(
        await db.invoice.findUniqueOrThrow({ where: { id: debt.id } }),
      ).toEqual(debt);
      expect(
        await db.payment.count({ where: { workspaceId: f.workspaceId } }),
      ).toBe(0);
      expect(
        await db.financialOperation.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
      expect(
        await db.attendanceRecord.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
      const receipt = await db.workspaceDataEvent.findFirstOrThrow({
        where: {
          workspaceId: f.workspaceId,
          kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED",
        },
      });
      expect(receipt.metadata).toMatchObject({
        bookingId: f.bookingId,
        fundingRevision: 1,
        from: "BOOKED",
        to: "CANCELLED",
        basis: "FIXED_GRACE_EXPIRED",
        noShowPenalty: false,
        allowanceAllocationIds: original.map((row) => row.id).sort(),
      });
      const notice = await db.notificationJob.findFirstOrThrow({
        where: {
          workspaceId: f.workspaceId,
          dedupeKey: { startsWith: `membership-grace:${f.bookingId}:1:` },
        },
      });
      expect(notice).toMatchObject({
        status: "PENDING",
        recipientEmail: f.memberEmail.toLowerCase(),
        providerMessageId: null,
      });
      expect(notice.body).toContain(
        "without a late-cancellation or no-show penalty",
      );
      expect(notice.body).toContain("Payment does not restore this seat");
      expect(
        JSON.stringify({ body: notice.body, context: notice.context }),
      ).not.toContain(privateSentinel);

      await memberPage.reload();
      await settled(memberPage);
      const details = memberPage.getByRole("dialog", {
        name: "Booking details",
        exact: true,
      });
      await expect(details).toContainText(membershipGraceReleaseMessage);
      await expect(details).not.toContainText(debt.id);
      await expect(details).not.toContainText(f.evidence.id);
      await expect(details).not.toContainText(privateSentinel);
      await memberPage.keyboard.press("Escape");
      await memberPage
        .getByText("Attendance and booking history", { exact: false })
        .click();
      const history = memberPage
        .locator("details.hl-class-history")
        .getByRole("article")
        .filter({
          has: memberPage.getByRole("heading", { name: f.title, exact: true }),
        });
      await expect(history).toContainText("Cancelled");
      await expect(history).toContainText(membershipGraceReleaseMessage);
      await memberPage.setViewportSize({ width: 390, height: 844 });
      expect(
        await memberPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);

      await login(page, adminBase, f.ownerEmail, browserDiagnostics);
      await page.goto(
        `${adminBase}/dashboard/settings/audit?kind=MEMBERSHIP_GRACE_BOOKING_RELEASED`,
      );
      await settled(page);
      const audit = page
        .getByRole("article")
        .filter({
          has: page.getByRole("heading", {
            name: "Membership grace booking released",
            exact: true,
          }),
        });
      await expect(audit).toHaveCount(1);
      await expect(audit).toContainText(f.bookingId);
      await expect(audit).toContainText("BOOKED");
      await expect(audit).toContainText("CANCELLED");
      await expect(
        audit
          .locator("dl > div")
          .filter({
            has: page.locator("dt", { hasText: /^No show penalty$/ }),
          }),
      ).toContainText("No");
      await expect(audit).not.toContainText(f.evidence.id);
      await expect(audit).not.toContainText(privateSentinel);
      await page.reload();
      await expect(
        page.getByRole("heading", {
          name: "Membership grace booking released",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        (
          await processMembershipGraceDisposition({
            workspaceId: f.workspaceId,
            db,
          })
        ).cancelled,
      ).toBe(0);
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId: f.workspaceId,
            kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED",
          },
        }),
      ).toBe(1);

      const paidAt = new Date();
      await test.step("Direct canonical fictional invoice settlement; no webhook or provider request", () =>
        reconcileMembershipInvoice({
          workspaceId: f.workspaceId,
          evidence: {
            ...f.evidence,
            status: "PAID",
            amountPaidCents: 10000,
            amountDueCents: 0,
            paidAt,
            firstFailedAt: undefined,
            failureCode: null,
            failureMessage: null,
            payments: [
              {
                allocationId: `inpay_${f.bookingId}`,
                paymentIntentId: `pi_${f.bookingId}`,
                amountCents: 10000,
                paidAt,
              },
            ],
          },
          eventId: `evt_${randomUUID()}`,
          db,
          now: paidAt,
          graceClock: () => paidAt,
        }));
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.bookingId },
          })
        ).status,
      ).toBe("CANCELLED");
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { bookingId: f.bookingId, state: "RESERVED" },
        }),
      ).toBe(0);
      expect(
        await db.workspaceDataEvent.findUniqueOrThrow({
          where: { id: receipt.id },
        }),
      ).toEqual(receipt);
      await memberPage.goto(
        `${memberBase}/app/schedule?date=${f.date}&booking=${f.bookingId}`,
      );
      await settled(memberPage);
      await expect(
        memberPage.getByRole("dialog", {
          name: "Booking details",
          exact: true,
        }),
      ).toContainText(membershipGraceReleaseMessage);
      await memberPage.keyboard.press("Escape");
      await memberPage
        .getByRole("button", { name: new RegExp(`^Book class — ${f.title},`) })
        .click();
      const review = memberPage.getByRole("dialog", {
        name: "Review booking",
        exact: true,
      });
      await expect(review).toContainText(
        "This booking uses Fictional grace membership.",
      );
      const result = await action(
        memberPage,
        review.getByRole("button", { name: "Book class", exact: true }),
      );
      await expect(
        memberPage.getByText("Your place is booked.", { exact: true }),
      ).toBeVisible();
      if (result.status() === 200)
        browserDiagnostics.acknowledgeAction(
          result,
          "The member explicitly books the class again after canonical fictional settlement; this is not a provider payment proof.",
        );
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: f.bookingId } }),
      ).toMatchObject({
        status: "BOOKED",
        fundingRevision: booking.fundingRevision + 1,
        fundingMembershipId: f.membershipId,
        providerChangedAt: null,
      });
      expect(
        await db.membershipAllowanceAllocation.count({
          where: {
            bookingId: f.bookingId,
            bookingRevision: 2,
            state: "RESERVED",
          },
        }),
      ).toBe(2);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: {
            bookingId: f.bookingId,
            bookingRevision: 1,
            state: "RELEASED",
          },
        }),
      ).toBe(2);
      expect(
        await db.workspaceDataEvent.findUniqueOrThrow({
          where: { id: receipt.id },
        }),
      ).toEqual(receipt);
      await memberPage.goto(
        `${memberBase}/app/schedule?date=${f.date}&booking=${f.bookingId}`,
      );
      const currentDetails = memberPage.getByRole("dialog", {
        name: "Booking details",
        exact: true,
      });
      await expect(currentDetails).toBeVisible();
      await expect(currentDetails).not.toContainText(
        membershipGraceReleaseMessage,
      );
      await info.attach("membership-grace-boundary.json", {
        body: Buffer.from(
          JSON.stringify(
            {
              scope:
                "Rendered member/owner views; direct bounded maintenance and canonical fictional settlement; actual member rebooking; no HTTP scheduler/webhook/provider",
              bookingId: f.bookingId,
              receiptId: receipt.id,
              released,
            },
            null,
            2,
          ),
        ),
        contentType: "application/json",
      });
    } finally {
      await memberPage.close();
    }
  });
});
