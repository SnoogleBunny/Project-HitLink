import { loginToWorkspace } from "./support/workspace-login";
import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  addDays,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  getWeekdayForDateString,
  createAccessBackedBooking,
  recordLocalFormSignature,
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
  lockClassSchedule,
} from "../../packages/db/src/index";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../packages/db/src/retention-inventory";
import {
  test,
  expect,
  type BrowserDiagnosticsCollector,
  type Page,
  type Locator,
} from "./support/browser-diagnostics";
const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  !/test|e2e/i.test(new URL(url).pathname)
)
  throw new Error(
    "Form lifecycle acceptance requires an explicit dedicated local test database.",
  );
const db = new PrismaClient({ datasourceUrl: url }),
  workspaces: string[] = [],
  users: string[] = [];
const admin =
    process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100",
  member = process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
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
  // Check each real UI/database outcome at the callsite. A Next action's RSC
  // stream need not finish after that committed result has rendered.
  await page.waitForLoadState("networkidle");
  return response;
}
async function login(page: Page, origin: string, email: string, diagnostics: BrowserDiagnosticsCollector) {
  await loginToWorkspace({
    page,
    origin,
    email,
    password: "DemoPass123!",
    expectedRedirect: origin === admin ? "/dashboard;push" : "/app;push",
    destination: {
      path: origin === admin ? "/dashboard" : "/app/schedule",
      heading: origin === admin ? "Today" : "Classes",
    },
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
async function fixture(
  options: { pack?: boolean; historical?: boolean; limit?: number } = {},
) {
  const actual = new Date(),
    date = addDays(
      getWorkspaceDateString(actual, "UTC"),
      options.historical ? -7 : 7,
    );
  const serviceAt = getZonedDateTimeAsUtc({
    dateString: date,
    minutes: 600,
    timezone: "UTC",
  });
  const acceptedAt = options.historical
    ? new Date(+serviceAt - 2 * 86400000)
    : new Date(+actual - 60000);
  const owner = await db.user.create({
    data: { email: `${randomUUID()}@forms-owner.example.test` },
  });
  const customer = await db.user.create({
    data: { email: `${randomUUID()}@forms-member.example.test` },
  });
  users.push(owner.id, customer.id);
  const workspace = await db.workspace.create({
    data: {
      name: "Fictional form lifecycle gym",
      status: "ACTIVE",
      location: { create: { name: "Gym", timezone: "UTC" } },
      workspaceUsers: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: customer.id, role: "CUSTOMER" },
        ],
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional verified fixture",
          flowstateResponsibility: "Local test only",
          ownerReviewAcknowledgedAt: acceptedAt,
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: acceptedAt,
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: { location: true, workspaceUsers: true },
  });
  workspaces.push(workspace.id);
  const staff = workspace.workspaceUsers.find(
    (row) => row.userId === owner.id,
  )!;
  await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
  const member = await db.member.create({
    data: {
      workspaceId: workspace.id,
      userId: customer.id,
      fullName: "Fictional participant",
      email: customer.email,
      dateOfBirth: new Date("1990-01-01"),
      status: "ACTIVE",
    },
  });
  const program = await db.program.create({
    data: { workspaceId: workspace.id, name: "Fictional program" },
  });
  const room = await db.room.create({
    data: { locationId: workspace.location!.id, name: "Mat", capacity: 10 },
  });
  const template = await db.classTemplate.create({
    data: {
      workspaceId: workspace.id,
      programId: program.id,
      roomId: room.id,
      coachWorkspaceUserId: staff.id,
      weekday: getWeekdayForDateString(date),
      startTimeMinutes: 600,
      endTimeMinutes: 660,
      cancellationCutoffMinutes: 1440,
      bookingCutoffMinutes: 0,
    },
  });
  if (options.pack) {
    const product = await db.punchCardProduct.create({
      data: {
        workspaceId: workspace.id,
        name: "Fictional one pack",
        punchesIncluded: 1,
        priceCents: 1000,
        noShowConsumesPunch: true,
      },
    });
    await db.memberPunchCard.create({
      data: {
        workspaceId: workspace.id,
        memberId: member.id,
        punchCardProductId: product.id,
        originalPunches: 1,
        remainingPunches: 1,
        purchasePriceCents: 1000,
        acceptedTerms: JSON.parse(
          JSON.stringify(snapshotPunchCardTerms(product, acceptedAt)),
        ),
      },
    });
  } else {
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId: workspace.id,
        name: "Fictional weekly allowance",
        monthlyPriceCents: 10000,
        currency: "cad",
        weeklyClassLimit: options.limit ?? 2,
        allowanceCountingMode: "ATTENDANCE",
        noShowConsumesClass: true,
      },
    });
    await db.memberMembership.create({
      data: {
        workspaceId: workspace.id,
        memberId: member.id,
        membershipPlanId: plan.id,
        startedAt: new Date(+acceptedAt - 86400000),
        allowanceAnchorDate: new Date(acceptedAt.toISOString().slice(0, 10)),
        allowanceTimezone: "UTC",
        acceptedTerms: JSON.parse(
          JSON.stringify(snapshotMembershipTerms(plan, acceptedAt)),
        ),
      },
    });
  }
  // An honest pre-upgrade fixture: old exact PDF/proof, no invented expiry.
  const document = await db.formDocument.create({
    data: {
      workspaceId: workspace.id,
      name: "Fictional required waiver",
      formType: "WAIVER",
    },
  });
  const sourcePdf = await db.formVersion.findUniqueOrThrow({
    where: { id: "demo-form-version-waiver-v1" },
  });
  const bytes = Buffer.from(sourcePdf.fileData),
    sha = createHash("sha256").update(bytes).digest("hex");
  expect(sha).toBe(sourcePdf.fileSha256);
  const pdf = await db.formVersion.create({
    data: {
      workspaceId: workspace.id,
      formDocumentId: document.id,
      versionNumber: 1,
      fileName: "fictional.pdf",
      mimeType: "application/pdf",
      fileData: bytes,
      fileSizeBytes: bytes.length,
      fileSha256: sha,
      uploadedByWorkspaceUserId: staff.id,
      createdAt: new Date(+acceptedAt - 86400000),
    },
  });
  await db.formDocument.update({
    where: { id: document.id },
    data: { currentVersionId: pdf.id },
  });
  await db.requiredFormAssignment.create({
    data: {
      workspaceId: workspace.id,
      formDocumentId: document.id,
      requirementTarget: "MEMBER",
    },
  });
  const request = await db.signatureRequest.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      formVersionId: pdf.id,
      signerKind: "MEMBER",
      accessMethod: "PORTAL",
    },
  });
  expect(
    (
      await recordLocalFormSignature({
        workspaceId: workspace.id,
        memberId: member.id,
        requestId: request.id,
        actorUserId: customer.id,
        signerName: "Fictional participant",
        db,
        now: acceptedAt,
      })
    ).status,
  ).toBe("signed");
  const booked = await createAccessBackedBooking({
    workspaceId: workspace.id,
    memberId: member.id,
    classTemplateId: template.id,
    scheduledForDate: date,
    timezone: "UTC",
    source: "MEMBER_PORTAL",
    db: db as never,
    now: acceptedAt,
  });
  if (booked.status !== "created")
    throw new Error(`Fictional reservation failed: ${booked.status}`);
  return {
    workspace,
    owner,
    customer,
    staff,
    member,
    program,
    room,
    template,
    document,
    pdf,
    bytes,
    date,
    serviceAt,
    acceptedAt,
    bookingId: booked.bookingId,
  };
}

test.afterAll(async () => {
  for (const workspaceId of workspaces)
    for (let attempt = 0; ; attempt++)
      try {
        await db.$transaction(
          async (tx) => {
            await lockClassSchedule(tx, workspaceId);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${workspaceId}`}))`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention:${workspaceId}`}))`;
            const inventory = await inspectRetentionInventory(tx, workspaceId);
            await deleteReviewedWorkspaceRecords(
              tx,
              workspaceId,
              inventory.fingerprint,
            );
          },
          { isolationLevel: "Serializable", timeout: 120000 },
        );
        break;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" ||
          attempt >= 11
        )
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 25 + Math.random() * 100),
        );
      }
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
test("WF07 owner schedules a same-PDF acceptance cycle and member explicitly chooses penalty-free recovery or retention", async ({
  page,
  context,
  browserDiagnostics,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(30000);
  const f = await fixture({ limit: 2 }),
    seed = await db.user.findUniqueOrThrow({
      where: { email: "demo-owner@flowstate.local" },
      select: { passwordHash: true },
    });
  await db.user.updateMany({
    where: { id: { in: [f.owner.id, f.customer.id] } },
    data: { passwordHash: seed.passwordHash },
  });
  const target = await db.classTemplate.create({
    data: {
      workspaceId: f.workspace.id,
      programId: f.program.id,
      roomId: f.room.id,
      weekday: getWeekdayForDateString(f.date),
      startTimeMinutes: 720,
      endTimeMinutes: 780,
      cancellationCutoffMinutes: 1440,
      bookingCutoffMinutes: 0,
    },
  });
  const second = await createAccessBackedBooking({
    workspaceId: f.workspace.id,
    memberId: f.member.id,
    classTemplateId: target.id,
    scheduledForDate: f.date,
    timezone: "UTC",
    source: "MEMBER_PORTAL",
    db: db as never,
  });
  expect(second.status).toBe("created");
  await login(page, admin, f.owner.email, browserDiagnostics);
  await page.goto(`${admin}/dashboard/forms/${f.document.id}/publication`);
  await expect(
    page.getByRole("heading", {
      name: `Publish ${f.document.name}`,
      exact: true,
    }),
  ).toBeVisible();
  const effective = new Date(Date.now() + 2 * 86400000)
      .toISOString()
      .slice(0, 16),
    expiry = new Date(+f.serviceAt + 86400000).toISOString().slice(0, 16);
  await page.getByLabel("Effective at (UTC)", { exact: true }).fill(effective);
  await page
    .getByLabel("Required advance notice (minutes)", { exact: true })
    .fill("60");
  await page
    .getByLabel("Acceptance valid until (UTC, optional)", { exact: true })
    .fill(expiry);
  await page
    .getByLabel("Reason for publication or renewal", { exact: true })
    .fill("Fictional reviewed same-PDF renewal for acceptance proof");
  const previewed = await action(
    page,
    page.getByRole("button", {
      name: "Preview affected people and bookings",
      exact: true,
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Publication review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/2 accepted future bookings need recovery/),
  ).toBeVisible();
  expect(
    await db.formRequirementRevision.count({
      where: { workspaceId: f.workspace.id },
    }),
  ).toBe(0);
  if (previewed.status() === 200)
    browserDiagnostics.acknowledgeAction(
      previewed,
      "The owner sees the exact two-booking publication preview while no requirement revision has been committed.",
    );
  await page.getByLabel(/I reviewed this short-notice change/).check();
  await page.getByLabel(/I reviewed the exact PDF, affected people/).check();
  const published = await action(
    page,
    page.getByRole("button", {
      name: "Confirm reviewed publication",
      exact: true,
    }),
  );
  await expect(
    page.getByText("Requirement publication recorded", { exact: true }),
  ).toBeVisible();
  const revision = await db.formRequirementRevision.findFirstOrThrow({
    where: { workspaceId: f.workspace.id },
  });
  expect(
    await db.formVersion.count({ where: { formDocumentId: f.document.id } }),
  ).toBe(1);
  expect(
    await db.bookingFormRecovery.count({
      where: { workspaceId: f.workspace.id, state: "OPEN" },
    }),
  ).toBe(2);
  const jobs = await db.notificationJob.findMany({
    where: {
      workspaceId: f.workspace.id,
      context: { path: ["revisionId"], equals: revision.id },
    },
  });
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.status).toBe("PENDING");
  expect(jobs[0]?.providerMessageId).toBeNull();
  if (published.status() === 200)
    browserDiagnostics.acknowledgeAction(
      published,
      "The owner sees committed publication feedback; the exact revision retains one PDF, two OPEN recoveries and one PENDING notice with no provider receipt.",
    );
  const customerPage = await context.newPage();
  await login(customerPage, member, f.customer.email, browserDiagnostics);
  await customerPage.goto(`${member}/app/forms`);
  await expect(
    customerPage.getByRole("heading", { name: "Forms", exact: true }),
  ).toBeVisible();
  await expect(
    customerPage.getByText(/Scheduled requirement starts/),
  ).toBeVisible();
  const request = await db.signatureRequest.findFirstOrThrow({
    where: {
      workspaceId: f.workspace.id,
      memberId: f.member.id,
      requirementRevisionId: revision.id,
      status: "OPEN",
    },
  });
  await customerPage.locator(`a[href="/app/forms/${request.id}"]`).click();
  const documentUrl = `${member}/app/forms/${request.id}/document`;
  const directPdf = await customerPage.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return {
      status: response.status,
      type: response.headers.get("content-type"),
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    };
  }, documentUrl);
  expect(directPdf.status).toBe(200);
  expect(directPdf.type).toMatch(/^application\/pdf(?:;|$)/i);
  expect(directPdf.bytes.length).toBe(f.pdf.fileSizeBytes);
  expect(
    createHash("sha256").update(Buffer.from(directPdf.bytes)).digest("hex"),
  ).toBe(f.pdf.fileSha256);

  await expect(
    customerPage
      .getByRole("heading", { name: f.document.name, exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    customerPage.getByText(/Acceptance is valid until/),
  ).toBeVisible();
  await customerPage
    .getByLabel("Full legal name", { exact: true })
    .fill("Fictional participant");
  await customerPage.getByLabel(/I confirm I reviewed this PDF/).check();
  const signed = await action(
    customerPage,
    customerPage.getByRole("button", { name: "Sign form", exact: true }),
  );
  await expect(
    customerPage.getByRole("heading", { name: "Already signed", exact: true }),
  ).toBeVisible();
  const signedRequest = await db.signatureRequest.findUniqueOrThrow({
    where: { id: request.id },
  });
  expect(signedRequest.status).toBe("COMPLETED");
  expect(
    await db.signedDocument.findUniqueOrThrow({
      where: { signedFromRequestId: request.id },
    }),
  ).toMatchObject({
    workspaceId: f.workspace.id,
    memberId: f.member.id,
    formVersionId: f.pdf.id,
    requirementRevisionId: revision.id,
    acceptanceCycleKey: request.acceptanceCycleKey,
  });
  expect(
    await db.signedDocument.count({
      where: { workspaceId: f.workspace.id, memberId: f.member.id },
    }),
  ).toBe(2);
  expect(
    await db.bookingFormRecovery.count({
      where: { workspaceId: f.workspace.id, state: "OPEN" },
    }),
  ).toBe(2);
  if (signed.status() === 200)
    browserDiagnostics.acknowledgeAction(
      signed,
      "The exact request visibly shows Already signed and is COMPLETED with its exact member/PDF/revision/cycle proof; both original recovery choices remain OPEN.",
    );
  await customerPage.goto(`${member}/app/forms/recovery`);
  await expect(
    customerPage.getByRole("heading", {
      name: "Form-related booking recovery",
      exact: true,
    }),
  ).toBeVisible();
  const cancelled = await action(
    customerPage,
    customerPage
      .getByRole("button", {
        name: "Cancel and release original units",
        exact: true,
      })
      .first(),
  );
  await expect(
    customerPage.getByText(/original reserved units were released/),
  ).toBeVisible();
  expect(
    await db.bookingFormRecovery.count({
      where: { workspaceId: f.workspace.id, state: "CANCELLED" },
    }),
  ).toBe(1);
  expect(
    await db.classBooking.count({
      where: { workspaceId: f.workspace.id, status: "CANCELLED" },
    }),
  ).toBe(1);
  if (cancelled.status() === 200)
    browserDiagnostics.acknowledgeAction(
      cancelled,
      "The member sees release confirmation and exactly one original booking/recovery is CANCELLED.",
    );
  await customerPage.reload();
  await expect(
    customerPage.getByRole("button", {
      name: "Keep this booking after completing its forms",
      exact: true,
    }),
  ).toHaveCount(1);
  const retained = await action(
    customerPage,
    customerPage.getByRole("button", {
      name: "Keep this booking after completing its forms",
      exact: true,
    }),
  );
  await expect(
    customerPage.getByText(/explicit choice to keep this booking/),
  ).toBeVisible();
  expect(
    await db.classBooking.count({
      where: { workspaceId: f.workspace.id, status: "CANCELLED" },
    }),
  ).toBe(1);
  expect(
    await db.classBooking.count({
      where: { workspaceId: f.workspace.id, status: "BOOKED" },
    }),
  ).toBe(1);
  expect(
    (
      await db.bookingFormRecovery.findMany({
        where: { workspaceId: f.workspace.id },
        select: { state: true },
      })
    )
      .map((row) => row.state)
      .sort(),
  ).toEqual(["CANCELLED", "SIGNED"]);
  expect(
    (
      await db.signedDocument.findFirstOrThrow({
        where: { workspaceId: f.workspace.id, acceptanceCycleKey: "legacy" },
      })
    ).validUntil,
  ).toBeNull();
  if (retained.status() === 200)
    browserDiagnostics.acknowledgeAction(
      retained,
      "The member sees explicit retention feedback; exactly one booking stays BOOKED, the two recovery states are CANCELLED/SIGNED and the legacy proof still has no invented expiry.",
    );
  await customerPage.waitForLoadState("networkidle");
  await page.waitForLoadState("networkidle");
  // Existing CF11 certification rule: only authenticated, byte/hash-verified
  // PDF viewer handoffs may abort. Application/document failures still fail.
  await customerPage.close();
  const pdfAborts = browserDiagnostics.diagnostics.filter(
    (diagnostic) =>
      diagnostic.kind === "requestfailed" && diagnostic.url === documentUrl,
  );
  expect(pdfAborts.length).toBeLessThanOrEqual(2 * 3);
  for (const diagnostic of pdfAborts) {
    expect(diagnostic).toEqual({
      kind: "requestfailed",
      isNavigationRequest: true,
      message: `net::ERR_ABORTED: GET ${documentUrl}`,
      method: "GET",
      resourceType: "document",
      url: documentUrl,
    });
    expect(
      browserDiagnostics.failureEvidence.some((evidence) => {
        if (!evidence || typeof evidence !== "object") return false;
        const item = evidence as Record<string, unknown>;
        return (
          item.url === documentUrl &&
          item.responseStatus === 200 &&
          typeof item.responseType === "string" &&
          /^application\/pdf(?:;|$)/i.test(item.responseType)
        );
      }),
    ).toBe(true);
    browserDiagnostics.allow(diagnostic);
  }
});
