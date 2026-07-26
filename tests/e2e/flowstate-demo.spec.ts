import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/flowstate_dev?schema=public";

const prisma = new PrismaClient();

const demo = {
  ownerEmail: "demo-owner@flowstate.local",
  ownerPassword: "DemoPass123!",
  memberEmail: "demo-member@flowstate.local",
  memberPassword: "MemberPass123!",
  trialEmail: "demo-trial@flowstate.local",
};

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

async function expectHealthyPage(page: Page): Promise<string> {
  const text = await bodyText(page);

  await expect(page.locator("body")).not.toContainText("This page couldn't load");
  await expect(page.locator("body")).not.toContainText("server error");
  await expect(page.locator("body")).not.toContainText("This page could not be found");

  return text;
}

async function loginAdmin(page: Page) {
  await page.goto("http://localhost:3000/login");
  if (/\/dashboard/.test(page.url())) {
    return;
  }

  await page.getByLabel("Email").fill(demo.ownerEmail);
  await page.getByLabel("Password").fill(demo.ownerPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function loginMember(page: Page) {
  await page.goto("http://localhost:3001/login");
  await page.getByLabel("Email").fill(demo.memberEmail);
  await page.getByLabel("Password").fill(demo.memberPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.serial("Flowstate working demo", () => {
  test.setTimeout(300_000);

  test("admin, member, public trial, and API flows are connected", async ({ page, request }) => {
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: {
        name: "Demo Flowstate Gym",
      },
      include: {
        programs: true,
        location: {
          include: {
            rooms: true,
          },
        },
        classTemplates: true,
        membershipPlans: true,
        punchCardProducts: true,
        dropInProducts: true,
        formDocuments: true,
        members: true,
      },
    });

    expect(workspace.programs).toHaveLength(1);
    expect(workspace.location?.rooms).toHaveLength(1);
    expect(workspace.classTemplates).toHaveLength(1);
    expect(workspace.membershipPlans).toHaveLength(1);
    expect(workspace.punchCardProducts).toHaveLength(1);
    expect(workspace.dropInProducts).toHaveLength(1);
    expect(workspace.formDocuments).toHaveLength(1);
    expect(workspace.members).toHaveLength(1);

    const health = await request.get("http://localhost:3002/api/v1/health");
    await expect(health).toBeOK();
    expect(await health.json()).toEqual({ ok: true });

    await loginAdmin(page);
    await expectHealthyPage(page);
    await expect(page.getByText("Demo Flowstate Gym").first()).toBeVisible();

    const adminRoutes = [
      "/dashboard",
      "/dashboard/programs",
      `/dashboard/programs/${workspace.programs[0].id}/edit`,
      "/dashboard/rooms",
      `/dashboard/rooms/${workspace.location?.rooms[0].id}/edit`,
      "/dashboard/schedule",
      "/dashboard/schedule/new",
      `/dashboard/schedule/${workspace.classTemplates[0].id}/edit`,
      "/dashboard/bookings",
      "/dashboard/coach/today",
      "/dashboard/members",
      `/dashboard/members/${workspace.members[0].id}`,
      `/dashboard/members/${workspace.members[0].id}/billing`,
      "/dashboard/forms",
      `/dashboard/forms/${workspace.formDocuments[0].id}`,
      "/dashboard/membership-plans",
      `/dashboard/membership-plans/${workspace.membershipPlans[0].id}/edit`,
      "/dashboard/access-products",
      `/dashboard/access-products/punch-cards/${workspace.punchCardProducts[0].id}/edit`,
      `/dashboard/access-products/drop-ins/${workspace.dropInProducts[0].id}/edit`,
      "/dashboard/billing",
      "/dashboard/settings/billing",
      "/dashboard/staff-invites",
    ];

    for (const route of adminRoutes) {
      const response = await page.goto(`http://localhost:3000${route}`);
      expect(response?.status(), route).toBeLessThan(400);
      await expectHealthyPage(page);
    }

    await loginMember(page);
    await expectHealthyPage(page);
    await expect(page.getByText("Demo Member").first()).toBeVisible();

    const memberRoutes = [
      "/app",
      "/app/schedule",
      "/app/bookings",
      "/app/membership",
      "/app/forms",
      "/app/billing",
      "/app/checkout/complete",
    ];

    for (const route of memberRoutes) {
      const response = await page.goto(`http://localhost:3001${route}`);
      expect(response?.status(), route).toBeLessThan(400);
      await expectHealthyPage(page);
    }

    await page.goto("http://localhost:3001/app/schedule");
    await expect(page.getByRole("button", { name: "Book class" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Book class" }).first().click();
    await expect(page).toHaveURL(/\/app\/bookings$/);
    await expect(page.getByText("1 active booking")).toBeVisible();
    await expect(page.getByText("Today Fundamentals")).toBeVisible();

    const memberBooking = await prisma.classBooking.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        member: {
          email: demo.memberEmail,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const rosterDate = memberBooking.scheduledForDate.toISOString().slice(0, 10);
    const connectedOccurrenceValue = `${memberBooking.classTemplateId}|${rosterDate}`;

    await page.goto(`http://localhost:3001/trial/${workspace.id}`);
    await expectHealthyPage(page);
    await page
      .locator('select[name="bookingOption"]')
      .selectOption(connectedOccurrenceValue);
    await page.locator('input[name="fullName"]').fill("Demo Trial Prospect");
    await page.locator('input[name="email"]').fill(demo.trialEmail);
    await page.locator('input[name="phone"]').fill("555-0303");
    await page.getByRole("button", { name: "Book trial" }).click();
    await expect(page.getByText("Trial booked")).toBeVisible();

    const trialBooking = await prisma.classBooking.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        member: {
          email: demo.trialEmail,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(trialBooking).toMatchObject({
      bookingType: "TRIAL",
      classTemplateId: memberBooking.classTemplateId,
      scheduledForDate: memberBooking.scheduledForDate,
      source: "PUBLIC_TRIAL",
      status: "BOOKED",
    });

    await loginAdmin(page);
    await page.goto(
      `http://localhost:3000/dashboard/schedule/${memberBooking.classTemplateId}/roster?date=${rosterDate}`,
    );
    await expect(page.locator("dd").filter({ hasText: /^2 \/ 20 booked$/ })).toBeVisible();
    await expect(page.getByText("Demo Member")).toBeVisible();
    await expect(page.getByText("Demo Trial Prospect")).toBeVisible();
    await page.locator('select[name="state"]').first().selectOption("PRESENT");
    await page.locator('input[name="note"]').first().fill("Playwright attendance check.");
    await page.getByRole("button", { name: "Save attendance" }).first().click();
    const demoMemberCard = page.locator("article").filter({ hasText: "Demo Member" });
    await expect(demoMemberCard.getByText("Attended")).toBeVisible();
    await expect(demoMemberCard.locator("span").filter({ hasText: /^Present$/ })).toBeVisible();
  });
});
