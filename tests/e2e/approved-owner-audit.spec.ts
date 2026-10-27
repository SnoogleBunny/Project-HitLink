import { loginToWorkspace } from "./support/workspace-login";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../packages/db/src/retention-inventory";
import { test, expect } from "./support/browser-diagnostics";
const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  !/test|e2e/i.test(new URL(url).pathname)
)
  throw new Error(
    "Owner audit acceptance requires an explicit disposable local test database.",
  );
const db = new PrismaClient({ datasourceUrl: url });
test.afterAll(() => db.$disconnect());
test("RE08 owner inspects attributed safe audit history and filters it on a phone", async ({
  page,
  browserDiagnostics,
}, testInfo) => {
  const key = `audit-browser-${randomUUID()}`;
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const user = await db.user.create({
    data: {
      email: `${key}@example.test`,
      fullName: "Audit browser owner",
      passwordHash: seed.passwordHash,
    },
  });
  const now = new Date();
  const workspace = await db.workspace.create({
    data: {
      name: key,
      status: "ACTIVE",
      location: { create: { name: "Fictional business", timezone: "UTC" } },
      settings: { create: { locale: "en-CA", currency: "cad" } },
      workspaceUsers: { create: { userId: user.id, role: "OWNER" } },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Local fixture ready",
          flowstateResponsibility: "Fictional browser fixture",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: user.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: user.id,
        },
      },
    },
  });
  try {
    await db.workspaceDataEvent.createMany({
      data: [
        {
          workspaceId: workspace.id,
          actorUserId: user.id,
          kind: "BUSINESS_SETTINGS_CHANGED",
          metadata: {
            version: 1,
            before: { contactEmail: "before@example.test" },
            after: { contactEmail: "after@example.test" },
            privateNote: "AUDIT_BROWSER_PRIVATE_SENTINEL",
          },
        },
        {
          workspaceId: workspace.id,
          actorUserId: user.id,
          kind: "STAFF_ACCESS_CHANGED",
          metadata: {
            targetWorkspaceUserId: "historical-staff",
            before: { role: "COACH", isActive: true },
            after: { role: "COACH", isActive: false },
            reason: "Reviewed departure",
          },
        },
      ],
    });
    await loginToWorkspace({
      page,
      origin: new URL(test.info().project.use.baseURL!).origin,
      email: user.email,
      password: "DemoPass123!",
      expectedRedirect: "/dashboard;push",
      destination: { path: "/dashboard", heading: "Today" },
      diagnostics: browserDiagnostics,
    });
    // A 303 remains subject to the collector's existing exact document-visit rule.
    await page.goto("/dashboard/settings");
    await page.getByRole("link", { name: "Audit log", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Audit log", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("before@example.test", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("after@example.test", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Reviewed departure", { exact: false }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(
      "Recorded by Audit browser owner",
    );
    await expect(page.locator("body")).not.toContainText(
      "AUDIT_BROWSER_PRIVATE_SENTINEL",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("combobox", { name: /^Change type/ })
      .selectOption("BUSINESS_SETTINGS_CHANGED");
    await page
      .getByRole("button", { name: "Filter audit log", exact: true })
      .click();
    await expect(page).toHaveURL(/kind=BUSINESS_SETTINGS_CHANGED/);
    await expect(
      page.getByRole("heading", {
        name: "Business settings changed",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Staff access changed", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("body")).toContainText("1 matching record");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("owner-audit-phone.png"),
      fullPage: true,
    });
  } finally {
    await db.$transaction(
      async (tx) => {
        const inventory = await inspectRetentionInventory(tx, workspace.id);
        await deleteReviewedWorkspaceRecords(
          tx,
          workspace.id,
          inventory.fingerprint,
        );
      },
      { timeout: 120000 },
    );
    await db.user.delete({ where: { id: user.id } });
  }
});
