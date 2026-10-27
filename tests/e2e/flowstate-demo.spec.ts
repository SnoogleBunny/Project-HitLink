import { expectActionRedirect, captureAction } from "./support/action-redirect";
import { loginToWorkspace } from "./support/workspace-login";
import type { Response } from "@playwright/test";
import { ensureDemoSchedulingPolicy } from "./support/demo-scheduling-policy";
import { expect, test, type Page, type BrowserDiagnosticsCollector } from "./support/browser-diagnostics";
import type { Locator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prepareCleanEvidence } from "./support/clean-evidence";

const prisma = new PrismaClient();
const adminBaseURL =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const memberBaseURL =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const apiBaseURL =
  process.env.FLOWSTATE_API_E2E_BASE_URL ?? "http://127.0.0.1:3102";
const workspaceId = "demo-workspace-flowstate";
const title = "Beginner Padwork";
function dateKey(offset = 1) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
async function login(page: Page, role: "owner" | "member", diagnostics: BrowserDiagnosticsCollector) {
  const base = role === "owner" ? adminBaseURL : memberBaseURL;
  await loginToWorkspace({
    page,
    origin: base,
    email: `demo-${role}@flowstate.local`,
    password: role === "owner" ? "DemoPass123!" : "MemberPass123!",
    expectedRedirect: role === "owner" ? "/dashboard;push" : "/app;push",
    destination: {
      path: role === "owner" ? "/dashboard" : "/app/schedule",
      heading: role === "owner" ? "Today" : "Classes",
    },
    diagnostics,
    allowExistingSession: true,
  });
}
async function schedule(page: Page, day = dateKey()) {
  await page.goto(`${memberBaseURL}/app/schedule?date=${day}`);
  await expect(
    page.getByRole("heading", { name: "Classes", exact: true }),
  ).toBeVisible();
  const row = page
    .locator(".hl-class-row")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(row).toBeVisible();
  return row;
}
async function submitAndSettle(page: Page, control: Locator) {
  const response = await captureAction(page, () => control.click());
  await page.waitForLoadState("networkidle");
  return response;
}
function luminance(color: string) {
  const channels = color
    .match(/\d+(?:\.\d+)?/g)!
    .slice(0, 3)
    .map(Number)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test.afterAll(() => prisma.$disconnect());
test.describe("HitLink approved demo", () => {
  test.setTimeout(60000);
  test("owner metrics link to their records and the demo exposes the five approved daily classes", async ({
    page,
    request,
    browserDiagnostics,
  }) => {
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: {
        migration: true,
        classTemplates: { include: { scheduleRevisions: true } },
        location: { include: { rooms: true } },
      },
    });
    expect(workspace.status).toBe("ACTIVE");
    expect(workspace.migration?.stage).toBe("COMPLETE");
    expect(
      workspace.classTemplates
        .map((item) => [item.title, item.startTimeMinutes, item.endTimeMinutes])
        .sort(),
    ).toEqual(
      [
        ["HIIT Bootcamp", 435, 510],
        ["HIIT/Hyrox", 990, 1050],
        ["Beginner Padwork", 1050, 1110],
        ["Beginner Muay Thai", 1110, 1170],
        ["Advanced Muay Thai", 1110, 1170],
      ].sort(),
    );
    expect(
      workspace.classTemplates.every(
        (item) =>
          item.coachWorkspaceUserId === null &&
          item.scheduleRevisions[0]?.recurrence === "DAILY",
      ),
    ).toBe(true);
    expect(workspace.location?.rooms).toHaveLength(2);
    const health = await request.get(`${apiBaseURL}/api/v1/health`);
    await expect(health).toBeOK();
    expect(await health.json()).toEqual({ status: "ready" });
    await login(page, "owner", browserDiagnostics);
    await expect(page.getByText("Demo HitLink Gym").first()).toBeVisible();
    const active = page.getByRole("link", { name: /Active members/ });
    await expect(active).toHaveAttribute("href", "/dashboard/members");
    const directoryIntent = browserDiagnostics.beginRenderedNavigation(
      page,
      `${adminBaseURL}/dashboard/members`,
    );
    const [directoryRequest] = await Promise.all([
      page.waitForRequest((request) => {
        const url = new URL(request.url());
        url.searchParams.delete("_rsc");
        return (
          request.method() === "GET" &&
          request.headers().rsc === "1" &&
          request.headers()["next-router-prefetch"] !== "1" &&
          url.href === `${adminBaseURL}/dashboard/members`
        );
      }),
      active.click(),
    ]);
    browserDiagnostics.bindRenderedNavigationRequest(
      directoryIntent,
      directoryRequest,
    );
    const directoryResponse = await directoryRequest.response();
    expect(directoryResponse).not.toBeNull();
    if (!directoryResponse)
      throw new Error("The exact directory request has no response.");
    expect(directoryResponse.status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard\/members$/);
    await expect(
      page.getByRole("heading", { name: "Current members", exact: true }),
    ).toBeVisible();
    // The active-member metric opens the complete directory, including the
    // trial profile whose demonstration pack does not imply paid membership.
    await expect(
      page.getByText("Demo Member", { exact: true }).first(),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    browserDiagnostics.acknowledgeRenderedNavigation(
      directoryIntent,
      directoryResponse,
      "The Active members metric rendered the Current members directory and exact Demo Member record on this page.",
    );
    await page.goto(`${adminBaseURL}/dashboard/members?status=TRIAL`, {
      waitUntil: "networkidle",
    });
    await expect(page).toHaveURL(/\/dashboard\/members\?status=TRIAL$/);
    await expect(
      page.getByRole("heading", { name: "Current members", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Demo Member", { exact: true }).first(),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
  });
  test("booking review keeps pending and rejected submissions in the same dialog without consuming a visit", async ({
    page,
    browserDiagnostics,
  }) => {
    const template = await prisma.classTemplate.findFirstOrThrow({
      where: { workspaceId, title },
      include: { scheduleRevisions: true },
    });
    const revision = template.scheduleRevisions[0];
    const card = await prisma.memberPunchCard.findFirstOrThrow({
      where: { workspaceId, member: { email: "demo-member@flowstate.local" } },
    });
    await login(page, "member", browserDiagnostics);
    const row = await schedule(page);
    await row.getByRole("button", { name: /^Book class/ }).click();
    const dialog = page.getByRole("dialog", { name: "Review booking" });
    await expect(
      dialog.getByText("Demo Member", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Coach to be confirmed", { exact: true }),
    ).toBeVisible();
    const submit = dialog.locator('button[type="submit"]');
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/app/schedule**", async (route) => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    });
    try {
      await prisma.classScheduleRevision.update({
        where: { id: revision.id },
        data: { bookingCutoffMinutes: 100000 },
      });
      await prisma.classTemplate.update({
        where: { id: template.id },
        data: { bookingCutoffMinutes: 100000 },
      });
      const actionUrl = page.url();
      const submitted = Promise.all([
        page.waitForResponse(
          (candidate) =>
            candidate.url() === actionUrl &&
            candidate.request().method() === "POST" &&
            !!candidate.request().headers()["next-action"],
        ),
        submitAndSettle(page, submit),
      ]);
      await expect(submit).toBeDisabled();
      await expect(submit).toHaveText("Booking…");
      release();
      const [rejectedResponse] = await submitted;
      expect(rejectedResponse.status()).toBe(200);
      expect(rejectedResponse.request().postData()).toContain(template.id);
      await expect(dialog).toBeVisible();
      await expect(submit).toBeEnabled();
      const alert = dialog.getByRole("alert");
      await expect(alert).toContainText(title);
      await expect(alert).toBeFocused();
      await expect(alert).toContainText(
        /closed|cutoff|deadline|eligible|no longer|valid upcoming/i,
      );
      // Next also mounts an empty route-announcement alert outside the app.
      await expect(
        page.getByRole("alert").filter({ hasText: title }),
      ).toHaveCount(1);
      expect(
        (
          await prisma.memberPunchCard.findUniqueOrThrow({
            where: { id: card.id },
          })
        ).remainingPunches,
      ).toBe(card.remainingPunches);
      expect(
        await prisma.classBooking.count({
          where: {
            workspaceId,
            classTemplateId: template.id,
            memberId: card.memberId,
            scheduledForDate: new Date(dateKey()),
            status: "BOOKED",
          },
        }),
      ).toBe(0);
      browserDiagnostics.acknowledgeAction(
        rejectedResponse,
        "The exact class submission visibly rejects within the still-open review dialog, focuses its class-specific error, re-enables submit, and leaves the original pack balance and zero BOOKED places unchanged.",
      );
    } finally {
      release();
      await page.unroute("**/app/schedule**");
      await prisma.classScheduleRevision.update({
        where: { id: revision.id },
        data: { bookingCutoffMinutes: revision.bookingCutoffMinutes },
      });
      await prisma.classTemplate.update({
        where: { id: template.id },
        data: { bookingCutoffMinutes: template.bookingCutoffMinutes },
      });
    }
  });
  test("class buttons have visible hover and focus, readable contrast, and responsive sizing", async ({
    page,
    browserDiagnostics,
  }, info) => {
    await login(page, "member", browserDiagnostics);
    const row = await schedule(page);
    const button = row.getByRole("button", { name: /^Book class/ });
    const colors = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        foreground: s.color,
        shadow: s.boxShadow,
        transform: s.transform,
      };
    });
    expect(
      contrast(colors.background, colors.foreground),
    ).toBeGreaterThanOrEqual(4.5);
    await button.hover();
    await page.waitForTimeout(250);
    const hover = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        foreground: s.color,
        shadow: s.boxShadow,
        transform: s.transform,
      };
    });
    expect(hover).not.toEqual(colors);
    expect(contrast(hover.background, hover.foreground)).toBeGreaterThanOrEqual(
      4.5,
    );
    await page.mouse.move(0, 0);
    await button.focus();
    const focus = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(focus.style).not.toBe("none");
    expect(focus.width).toBeGreaterThanOrEqual(2);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(40);
      expect(box!.height).toBeLessThanOrEqual(64);
      await prepareCleanEvidence(page);
      await page.screenshot({
        path: info.outputPath(`classes-${width}.png`),
        fullPage: true,
      });
    }
  });
  test("a member books, moves and cancels a dated place with one pack debit and a matching owner roster", async ({
    page,
    browserDiagnostics,
  }) => {
    const card = await prisma.memberPunchCard.findFirstOrThrow({
      where: { workspaceId, member: { email: "demo-member@flowstate.local" } },
    });
    await login(page, "member", browserDiagnostics);
    const row = await schedule(page);
    await row.getByRole("button", { name: /^Book class/ }).click();
    const bookingResponse = await submitAndSettle(
      page,
      page
        .getByRole("dialog", { name: "Review booking" })
        .getByRole("button", { name: "Book class", exact: true }),
    );
    await expect(page.getByRole("status")).toContainText(
      "Your place is booked.",
    );
    const booked = await prisma.classBooking.findFirstOrThrow({
      where: {
        workspaceId,
        memberId: card.memberId,
        status: "BOOKED",
        scheduledForDate: new Date(dateKey()),
      },
    });
    expect(booked.memberPunchCardId).toBe(card.id);
    expect(
      (
        await prisma.memberPunchCard.findUniqueOrThrow({
          where: { id: card.id },
        })
      ).remainingPunches,
    ).toBe(card.remainingPunches - 1);
    await expectActionRedirect(page, bookingResponse, `${memberBaseURL}/app/schedule?${new URLSearchParams({date:dateKey(),booking:booked.id,notice:"booked"})}`);
    if (bookingResponse.status() === 200) browserDiagnostics.acknowledgeAction(
      bookingResponse, "Your place is booked is visible and the exact dated booking persists with one pack debit.",
    );
    await login(page, "owner", browserDiagnostics);
    await page.goto(
      `${adminBaseURL}/dashboard/schedule/${booked.classTemplateId}/roster?date=${dateKey()}`,
    );
    await expect(
      page.getByText("Demo Member", { exact: true }).first(),
    ).toBeVisible();
    await login(page, "member", browserDiagnostics);
    await page.goto(
      `${memberBaseURL}/app/schedule?date=${dateKey()}&booking=${booked.id}`,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Move booking" })
      .click();
    const select = page.getByRole("dialog").getByLabel("Move to");
    const option = await select.locator("option").nth(1).getAttribute("value");
    expect(option).toBeTruthy();
    await select.selectOption(option!);
    const moveResponse = await submitAndSettle(
      page,
      page.getByRole("dialog").getByRole("button", { name: "Confirm move" }),
    );
    await expect(page.getByRole("status")).toContainText("Booking moved.");
    expect(
      (
        await prisma.classBooking.findUniqueOrThrow({
          where: { id: booked.id },
        })
      ).status,
    ).toBe("CANCELLED");
    expect(
      (
        await prisma.memberPunchCard.findUniqueOrThrow({
          where: { id: card.id },
        })
      ).remainingPunches,
    ).toBe(card.remainingPunches - 1);
    const moved = await prisma.classBooking.findFirstOrThrow({
      where: {workspaceId,memberId:card.memberId,status:"BOOKED"},
    });
    const [targetTemplateId,targetDate] = option!.split(":");
    expect(moved.classTemplateId).toBe(targetTemplateId);
    expect(moved.scheduledForDate).toEqual(new Date(targetDate!));
    await expectActionRedirect(page, moveResponse, `${memberBaseURL}/app/schedule?${new URLSearchParams({notice:"moved",date:targetDate!,booking:moved.id})}`);
    if (moveResponse.status() === 200) browserDiagnostics.acknowledgeAction(
      moveResponse, "Booking moved is visible, the original booking is cancelled, the selected dated target persists, and the pack debit remains one.",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel booking", exact: true })
      .click();
    const cancellationResponse = await submitAndSettle(
      page,
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm cancellation" }),
    );
    await expect(page.getByRole("status")).toContainText("Booking cancelled.");
    expect(
      (
        await prisma.memberPunchCard.findUniqueOrThrow({
          where: { id: card.id },
        })
      ).remainingPunches,
    ).toBe(card.remainingPunches);
    expect(
      await prisma.classBooking.count({
        where: { workspaceId, memberId: card.memberId, status: "BOOKED" },
      }),
    ).toBe(0);
    await expectActionRedirect(page, cancellationResponse, `${memberBaseURL}/app/schedule?${new URLSearchParams({notice:"cancelled",date:targetDate!})}`);
    if (cancellationResponse.status() === 200) browserDiagnostics.acknowledgeAction(
      cancellationResponse, "Booking cancelled is visible, no booked places remain, and the exact original pack balance is restored.",
    );
    for (const legacy of ["/app", "/app/bookings"]) {
      await page.goto(`${memberBaseURL}${legacy}`);
      await expect(page).toHaveURL(/\/app\/schedule/);
      await expect(
        page.getByRole("heading", { name: "Classes", exact: true }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
    }
  });
});

test.beforeAll(async () => {
  await ensureDemoSchedulingPolicy(prisma);
});
