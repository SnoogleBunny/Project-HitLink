import { loginToWorkspace } from "./support/workspace-login";
import { ensureDemoSchedulingPolicy } from "./support/demo-scheduling-policy";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { Browser, BrowserContext, Page, TestInfo, Response } from "@playwright/test";
import { expect, test, type BrowserDiagnosticsCollector } from "./support/browser-diagnostics";
import { prepareCleanEvidence } from "./support/clean-evidence";

const prisma = new PrismaClient();
const adminBaseURL =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const memberBaseURL =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const landingBaseURL =
  process.env.FLOWSTATE_LANDING_E2E_BASE_URL ?? "http://127.0.0.1:3103";
const evidenceDir =
  process.env.RP20_EVIDENCE_DIR ??
  path.join(
    process.cwd(),
    "test-results",
    "every-visible-wave1",
    "screenshots",
    "rp20-ledger",
  );
const viewports = [
  { height: 844, name: "390", width: 390 },
  { height: 1024, name: "768", width: 768 },
  { height: 900, name: "1440", width: 1440 },
] as const;

async function loginAdmin(page: Page, diagnostics?: BrowserDiagnosticsCollector): Promise<void> {
  await loginToWorkspace({
    page,
    origin: adminBaseURL,
    email: "demo-owner@flowstate.local",
    password: "DemoPass123!",
    expectedRedirect: "/dashboard;push",
    destination: { path: "/dashboard", heading: "Today" },
    diagnostics,
    allowExistingSession: true,
  });
}

async function loginMember(page: Page, diagnostics?: BrowserDiagnosticsCollector): Promise<void> {
  await loginToWorkspace({
    page,
    origin: memberBaseURL,
    email: "demo-member@flowstate.local",
    password: "MemberPass123!",
    expectedRedirect: "/app;push",
    destination: { path: "/app/schedule", heading: "Classes" },
    diagnostics,
    allowExistingSession: true,
  });
}

async function expectNoTenantDisclosure(
  response: { body(): Promise<Buffer>; status(): number },
  forbidden: string[],
): Promise<void> {
  expect(response.status()).not.toBe(200);
  const body = (await response.body()).toString("utf8");
  for (const value of forbidden) {
    expect(body).not.toContain(value);
  }
}

function expectCoherentPdf(bytes: Buffer): void {
  expect(bytes.length).toBeGreaterThan(32);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

  const text = bytes.toString("latin1");
  const startXrefMatch = text.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  expect(startXrefMatch, "PDF has a terminal startxref pointer").not.toBeNull();
  const xrefOffset = Number(startXrefMatch![1]);
  expect(text.slice(xrefOffset, xrefOffset + 4)).toBe("xref");

  const xref = text.slice(xrefOffset);
  const header = xref.match(/^xref\s+0\s+(\d+)\s+/);
  expect(header, "PDF has one zero-based xref subsection").not.toBeNull();
  const size = Number(header![1]);
  const entryText = xref.slice(header![0].length);
  const entries = entryText.match(/^(\d{10}) (\d{5}) ([fn])\s*$/gm) ?? [];
  expect(entries).toHaveLength(size);

  for (let objectNumber = 1; objectNumber < size; objectNumber += 1) {
    const entry = entries[objectNumber].match(/^(\d{10}) (\d{5}) ([fn])/);
    expect(entry, `xref entry ${objectNumber}`).not.toBeNull();
    if (entry![3] !== "n") {
      continue;
    }
    const offset = Number(entry![1]);
    const generation = Number(entry![2]);
    expect(text.startsWith(`${objectNumber} ${generation} obj`, offset)).toBe(
      true,
    );
  }

  const trailer = xref.match(/trailer\s*<<([\s\S]*?)>>/);
  expect(trailer, "PDF has a trailer dictionary").not.toBeNull();
  expect(trailer![1]).toMatch(new RegExp(`\\/Size\\s+${size}(?:\\s|$)`));
  const root = trailer![1].match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
  expect(root, "PDF trailer has a root object").not.toBeNull();
  const rootObject = Number(root![1]);
  const rootGeneration = Number(root![2]);
  const rootEntry = entries[rootObject].match(/^(\d{10}) (\d{5}) ([fn])/);
  expect(rootEntry?.[3]).toBe("n");
  expect(Number(rootEntry?.[2])).toBe(rootGeneration);

  const streamPattern = /\/Length\s+(\d+)[^\r\n]*[\s\S]*?stream\r?\n/g;
  for (const stream of text.matchAll(streamPattern)) {
    const payloadStart = (stream.index ?? 0) + stream[0].length;
    const endStream = text.indexOf("endstream", payloadStart);
    expect(endStream).toBeGreaterThan(payloadStart);
    const payload = text.slice(payloadStart, endStream).replace(/\r?\n$/, "");
    expect(Buffer.byteLength(payload, "latin1")).toBe(Number(stream[1]));
  }
}

async function createForeignFormFixture(source: {
  fileData: Buffer;
  fileName: string;
  fileSha256: string;
  fileSizeBytes: number;
  mimeType: string;
}): Promise<{
  formDocumentId: string;
  formVersionId: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
}> {
  const stamp = randomUUID();
  const workspaceName = `RP20 foreign workspace ${stamp}`;
  const workspace = await prisma.workspace.create({
    data: { name: workspaceName, status: "ACTIVE" },
  });
  const user = await prisma.user.create({
    data: {
      email: `rp20-foreign-${stamp}@example.test`,
      fullName: "RP20 Foreign Owner",
    },
  });
  const workspaceUser = await prisma.workspaceUser.create({
    data: {
      role: "OWNER",
      userId: user.id,
      workspaceId: workspace.id,
    },
  });
  const formDocument = await prisma.formDocument.create({
    data: {
      formType: "WAIVER",
      name: `Foreign waiver ${stamp}`,
      workspaceId: workspace.id,
    },
  });
  const formVersion = await prisma.formVersion.create({
    data: {
      fileData: Uint8Array.from(source.fileData),
      fileName: source.fileName,
      fileSha256: source.fileSha256,
      fileSizeBytes: source.fileSizeBytes,
      formDocumentId: formDocument.id,
      mimeType: source.mimeType,
      uploadedByWorkspaceUserId: workspaceUser.id,
      versionNumber: 1,
      workspaceId: workspace.id,
    },
  });
  await prisma.formDocument.update({
    data: { currentVersionId: formVersion.id },
    where: { id: formDocument.id },
  });

  return {
    formDocumentId: formDocument.id,
    formVersionId: formVersion.id,
    userId: user.id,
    workspaceId: workspace.id,
    workspaceName,
  };
}

async function copyCookiesToAdminHost(
  source: BrowserContext,
  target: BrowserContext,
): Promise<void> {
  const cookies = (await source.cookies()).filter(
    (cookie) =>
      cookie.domain === new URL(memberBaseURL).hostname &&
      cookie.name === "flowstate_member_session",
  );
  expect(cookies).toHaveLength(1);
  await target.addCookies(
    cookies.map((cookie) => ({
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      name: "flowstate_admin_session",
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      url: adminBaseURL,
      value: cookie.value,
    })),
  );
}

async function assertVisibleControlsAreNamedAndContained(
  page: Page,
): Promise<void> {
  const result = await page
    .locator(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary',
    )
    .evaluateAll((elements) => {
      const viewportWidth = document.documentElement.clientWidth;
      const visible = elements.filter((element) => {
        const style = getComputedStyle(element);
        return (
          element.getClientRects().length > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      });
      return {
        count: visible.length,
        unnamed: visible
          .filter((element) => {
            const ariaLabel = element.getAttribute("aria-label")?.trim();
            const text = element.textContent?.trim();
            const labels =
              "labels" in element
                ? Array.from((element as HTMLInputElement).labels ?? []).map(
                    (label) => label.textContent?.trim(),
                  )
                : [];
            return !ariaLabel && !text && !labels.some(Boolean);
          })
          .map((element) => element.outerHTML.slice(0, 180)),
        clipped: visible
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < -0.5 || rect.right > viewportWidth + 0.5;
          })
          .map((element) => element.outerHTML.slice(0, 180)),
        clientWidth: viewportWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

  expect(result.count).toBeGreaterThan(0);
  expect(result.unnamed).toEqual([]);
  expect(result.clipped).toEqual([]);
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
}

async function expectFailClosedPdfRequest(
  context: BrowserContext,
  url: string,
  forbidden: string[],
): Promise<void> {
  const cookie = (await context.cookies())
    .filter((item) => item.domain === new URL(url).hostname)
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  const response = await context.request.get(url, {
    maxRedirects: 0,
    headers: { cookie },
  });
  await expectNoTenantDisclosure(response, forbidden);
}

async function createWrongRoleContext(
  browser: Browser,
): Promise<BrowserContext> {
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await loginMember(memberPage);
  const wrongRoleContext = await browser.newContext();
  await copyCookiesToAdminHost(memberContext, wrongRoleContext);
  await memberContext.close();
  return wrongRoleContext;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("RP-20 every-visible-feature certification evidence", () => {
  test.setTimeout(900_000);

  test("EVF-FORMS-PDF: authenticated bytes, fail-closed IDs, and exact Chromium viewer allowance", async ({
    browser,
    browserDiagnostics,
    browserName,
    page,
    request,
  }) => {
    expect(browserName).toBe("chromium");
    await loginAdmin(page, browserDiagnostics);

    const document = await prisma.formDocument.findFirstOrThrow({
      include: { currentVersion: true, workspace: true },
      where: { currentVersionId: { not: null } },
    });
    expect(document.currentVersion).not.toBeNull();
    const version = document.currentVersion!;
    const exactPath = `/dashboard/forms/${document.id}/versions/${version.id}/file`;
    const exactUrl = `${adminBaseURL}${exactPath}`;

    // Chromium sends secure localhost cookies; APIRequestContext deliberately
    // does not emulate that browser-specific loopback exception.
    const direct = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return {
        status: response.status,
        type: response.headers.get("content-type"),
        disposition: response.headers.get("content-disposition"),
        bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
      };
    }, exactUrl);
    expect(direct.status).toBe(200);
    expect(direct.type).toMatch(/^application\/pdf(?:;|$)/i);
    expect(direct.disposition).toBe(`inline; filename="${version.fileName}"`);
    const directBytes = Buffer.from(direct.bytes);
    expectCoherentPdf(directBytes);
    expect(createHash("sha256").update(directBytes).digest("hex")).toBe(
      version.fileSha256,
    );

    const foreign = await createForeignFormFixture({
      fileData: Buffer.from(version.fileData),
      fileName: version.fileName,
      fileSha256: version.fileSha256,
      fileSizeBytes: version.fileSizeBytes,
      mimeType: version.mimeType,
    });
    const forbidden = [
      document.id,
      document.workspace.name,
      version.fileName,
      version.id,
      foreign.formDocumentId,
      foreign.formVersionId,
      foreign.workspaceName,
    ];
    const cookie = (await page.context().cookies())
      .filter((item) => item.domain === new URL(exactUrl).hostname)
      .map((item) => `${item.name}=${item.value}`)
      .join("; ");

    try {
      for (const pathName of [
        `/dashboard/forms/missing-form/versions/missing-version/file`,
        `/dashboard/forms/${document.id}/versions/missing-version/file`,
        `/dashboard/forms/missing-form/versions/${version.id}/file`,
        `/dashboard/forms/${foreign.formDocumentId}/versions/${foreign.formVersionId}/file`,
        `/dashboard/forms/${document.id}/versions/${foreign.formVersionId}/file`,
        `/dashboard/forms/${foreign.formDocumentId}/versions/${version.id}/file`,
      ]) {
        const response = await page.request.get(`${adminBaseURL}${pathName}`, {
          maxRedirects: 0,
          headers: { cookie },
        });
        await expectNoTenantDisclosure(response, forbidden);
      }

      const anonymous = await request.get(exactUrl, { maxRedirects: 0 });
      await expectNoTenantDisclosure(anonymous, forbidden);

      const wrongRoleContext = await createWrongRoleContext(browser);
      try {
        await expectFailClosedPdfRequest(wrongRoleContext, exactUrl, forbidden);
      } finally {
        await wrongRoleContext.close();
      }

      const ownerCookies = (await page.context().cookies()).filter(
        (item) => item.domain === new URL(adminBaseURL).hostname,
      );
      const authCookie = ownerCookies.find((cookie) =>
        cookie.name.includes("session"),
      );
      expect(authCookie, "owner session cookie exists").toBeTruthy();
      const tamperedContext = await browser.newContext();
      await tamperedContext.addCookies([
        {
          expires: authCookie!.expires,
          httpOnly: authCookie!.httpOnly,
          name: authCookie!.name,
          sameSite: authCookie!.sameSite,
          secure: authCookie!.secure,
          url: adminBaseURL,
          value: `${authCookie!.value}-tampered`,
        },
      ]);
      try {
        await expectFailClosedPdfRequest(tamperedContext, exactUrl, forbidden);
      } finally {
        await tamperedContext.close();
      }

      const diagnosticStart = browserDiagnostics.diagnostics.length;
      const detailResponse = await page.goto(
        `${adminBaseURL}/dashboard/forms/${document.id}`,
        { waitUntil: "networkidle" },
      );
      expect(detailResponse?.status()).toBe(200);
      await expect(
        page.getByRole("link", { name: "Open PDF" }),
      ).toHaveAttribute("href", exactPath);
      await page.waitForTimeout(100);

      const newDiagnostics =
        browserDiagnostics.diagnostics.slice(diagnosticStart);
      const pdfAborts = newDiagnostics.filter(
        (diagnostic) =>
          diagnostic.kind === "requestfailed" && diagnostic.url === exactUrl,
      );
      expect(pdfAborts.length).toBeGreaterThanOrEqual(1);
      expect(pdfAborts.length).toBeLessThanOrEqual(3);
      expect(newDiagnostics).toEqual(pdfAborts);
      for (const diagnostic of pdfAborts) {
        expect(diagnostic).toEqual({
          isNavigationRequest: true,
          kind: "requestfailed",
          message: `net::ERR_ABORTED: GET ${exactUrl}`,
          method: "GET",
          resourceType: "document",
          url: exactUrl,
        });
        browserDiagnostics.allow(diagnostic);
      }
      browserDiagnostics.assertNoExternalRequests();
    } finally {
      await prisma.workspace.delete({ where: { id: foreign.workspaceId } });
      await prisma.user.delete({ where: { id: foreign.userId } });
    }
  });

  test("EVF-CONTROL-CATALOG: route controls stay named, contained, and responsive", async ({
    browserDiagnostics,
    page,
  }, testInfo: TestInfo) => {
    const workspace = await prisma.workspace.findFirstOrThrow({
      include: {
        classTemplates: true,
        dropInProducts: true,
        formDocuments: true,
        location: { include: { rooms: true } },
        members: true,
        membershipPlans: true,
        programs: true,
        punchCardProducts: true,
      },
      where: { name: "Demo HitLink Gym" },
    });
    const adminRoutes = [
      "/dashboard",
      "/dashboard/access-products",
      `/dashboard/access-products/drop-ins/${workspace.dropInProducts[0].id}/edit`,
      `/dashboard/access-products/punch-cards/${workspace.punchCardProducts[0].id}/edit`,
      "/dashboard/billing",
      "/dashboard/bookings",
      "/dashboard/coach/today",
      "/dashboard/forms",
      "/dashboard/members",
      `/dashboard/members/${workspace.members[0].id}`,
      `/dashboard/members/${workspace.members[0].id}/billing`,
      "/dashboard/membership-plans",
      `/dashboard/membership-plans/${workspace.membershipPlans[0].id}/edit`,
      "/dashboard/migration",
      "/dashboard/programs",
      `/dashboard/programs/${workspace.programs[0].id}/edit`,
      "/dashboard/rooms",
      `/dashboard/rooms/${workspace.location!.rooms[0].id}/edit`,
      "/dashboard/schedule",
      `/dashboard/schedule/${workspace.classTemplates[0].id}/edit`,
      "/dashboard/schedule/new",
      "/dashboard/settings/billing",
      "/dashboard/settings/data",
      "/dashboard/staff",
      "/dashboard/coaching",
      `/dashboard/members/${workspace.members[0].id}/records`,
      "/dashboard/staff-invites",
    ];
    const memberRoutes = [
      "/app",
      "/app/billing",
      "/app/bookings",
      "/app/checkout/complete",
      "/app/forms",
      "/app/membership",
      "/app/schedule",
      "/app/account",
      "/app/account/records",
      "/app/coaching",
    ];

    await fs.mkdir(evidenceDir, { recursive: true });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await loginAdmin(page, browserDiagnostics);
      for (const route of adminRoutes) {
        const response = await page.goto(`${adminBaseURL}${route}`, {
          waitUntil: "networkidle",
        });
        expect(response?.status(), route).toBeLessThan(400);
        await assertVisibleControlsAreNamedAndContained(page);
      }
      await page.goto(`${adminBaseURL}/dashboard/forms`, {
        waitUntil: "networkidle",
      });
      await prepareCleanEvidence(page);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDir, `admin-forms-${viewport.name}.png`),
      });

      await loginMember(page, browserDiagnostics);
      for (const route of memberRoutes) {
        const response = await page.goto(`${memberBaseURL}${route}`, {
          waitUntil: "networkidle",
        });
        expect(response?.status(), route).toBeLessThan(400);
        await assertVisibleControlsAreNamedAndContained(page);
      }
      await page.goto(`${memberBaseURL}/app/forms`, {
        waitUntil: "networkidle",
      });
      await prepareCleanEvidence(page);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDir, `member-forms-${viewport.name}.png`),
      });
      await testInfo.attach(`control-catalog-${viewport.name}.json`, {
        body: JSON.stringify({
          adminRoutes,
          memberRoutes,
          viewport,
        }),
        contentType: "application/json",
      });
    }
    browserDiagnostics.assertNoExternalRequests();
  });

  test("EVF-PROVIDER-BOUNDARIES: unavailable controls stay truthful with zero external requests", async ({
    browserDiagnostics,
    page,
  }) => {
    // Opening the member screen reconciles the pending demonstration contract
    // into the payment-method-needed queue without inventing an invoice.
    await loginMember(page, browserDiagnostics);
    await page.goto(`${memberBaseURL}/app/billing`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("button", { name: "Payment method unavailable" }),
    ).toBeDisabled();
    await loginAdmin(page, browserDiagnostics);
    await page.goto(`${adminBaseURL}/dashboard/settings/billing`, {
      waitUntil: "networkidle",
    });
    const connect = page.getByRole("button", {
      name: /Connect Stripe|Continue setup/,
    });
    const refresh = page.getByRole("button", { name: "Refresh status" });
    await expect(connect).toBeDisabled();
    await expect(refresh).toBeDisabled();
    await expect(page.getByText("Stripe unavailable")).toBeVisible();
    await expect(connect).toHaveAttribute(
      "aria-describedby",
      "stripe-provider-unavailable-reason",
    );

    await page.goto(`${adminBaseURL}/dashboard/billing`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByText("1 billing item", { exact: true }),
    ).toBeVisible();
    const retryNow = page.getByRole("button").filter({ hasText: "Retry now" });
    await expect(retryNow).toHaveCount(1);
    await expect(retryNow).toBeDisabled();
    await expect(
      page.getByText("No invoice is available to retry."),
    ).toBeVisible();

    await page.goto(`${adminBaseURL}/dashboard/migration`, {
      waitUntil: "networkidle",
    });
    const correctionLink = page.locator('a[href^="mailto:"]').first();
    await expect(correctionLink).toBeVisible();
    const correctionHref = await correctionLink.getAttribute("href");
    expect(correctionHref).toBeTruthy();
    expect(decodeURIComponent(new URL(correctionHref!).pathname)).toBe(
      "migration-corrections@example.test",
    );

    await loginMember(page, browserDiagnostics);
    await page.goto(`${memberBaseURL}/app/billing`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("button", { name: "Payment method unavailable" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Retry unavailable" }),
    ).toBeDisabled();

    await page.goto(`${memberBaseURL}/app/membership`, {
      waitUntil: "networkidle",
    });
    const buyPunchCard = page.getByRole("button", { name: "Buy punch card" });
    await expect(buyPunchCard).toBeDisabled();
    await expect(buyPunchCard).toHaveAttribute(
      "aria-describedby",
      "punch-card-purchase-unavailable",
    );

    await page.goto(`${memberBaseURL}/app/checkout/complete`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("heading", { name: "Payment request not found" }),
    ).toBeVisible();
    await expect(
      page.getByText("Open Payments to find your current requests."),
    ).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .getByRole("link", { name: "Classes", exact: true }),
    ).toHaveAttribute("href", "/app/schedule");

    await page.goto(landingBaseURL, { waitUntil: "networkidle" });
    for (const name of ["Book a Demo", "Contact"]) {
      const href = await page.getByRole("link", { name }).getAttribute("href");
      expect(href).toBeTruthy();
      const mailto = new URL(href!);
      expect(mailto.protocol).toBe("mailto:");
      expect(decodeURIComponent(mailto.pathname)).toBe(
        "hello@flowstategym.com",
      );
    }

    browserDiagnostics.assertNoExternalRequests();
  });

  test("EVF-RP16-ABSENCE: internal migration controls stay absent from the owner demo", async ({
    browserDiagnostics,
    page,
  }) => {
    await loginAdmin(page, browserDiagnostics);
    await page.goto(`${adminBaseURL}/dashboard/migration`, {
      waitUntil: "networkidle",
    });

    for (const name of [
      "Update service status",
      "Stage and validate",
      "Run import",
    ]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    for (const name of [
      "stage",
      "nextOwnerAction",
      "flowstateResponsibility",
      "expectedNextMilestone",
      "expectedNextMilestoneAt",
      "goLiveScheduledFor",
      "recordKind",
      "csv",
    ]) {
      await expect(page.locator(`[name="${name}"]`)).toHaveCount(0);
    }
    browserDiagnostics.assertNoExternalRequests();
  });
});

test.beforeAll(async () => { await ensureDemoSchedulingPolicy(prisma); });
