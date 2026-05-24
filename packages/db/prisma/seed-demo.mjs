/* global console */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import process from "node:process";

const prisma = new PrismaClient();

const demo = {
  workspaceName: "Demo HitLink Gym",
  ownerEmail: "demo-owner@hitlink.local",
  ownerPassword: "DemoPass123!",
  memberEmail: "demo-member@hitlink.local",
  memberPassword: "MemberPass123!",
  coachInviteEmail: "demo-coach@hitlink.local",
};

const demoTimezone = "America/Vancouver";
const weekdays = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const pdfBytes = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 240] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 46 >>
stream
BT /F1 12 Tf 24 120 Td (HitLink demo waiver) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<< /Root 1 0 R /Size 5 >>
startxref
300
%%EOF
`);

function dateOnly(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function getDemoWeekday() {
  const weekdayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: demoTimezone,
    weekday: "long",
  })
    .format(new Date())
    .toUpperCase();

  return weekdays.includes(weekdayLabel) ? weekdayLabel : "SATURDAY";
}

async function removePreviousDemoData() {
  const workspace = await prisma.workspace.findFirst({
    where: {
      name: demo.workspaceName,
    },
    select: {
      id: true,
    },
  });

  if (workspace) {
    await prisma.workspace.delete({
      where: {
        id: workspace.id,
      },
    });
  }

  await prisma.user.deleteMany({
    where: {
      email: {
        in: [demo.ownerEmail, demo.memberEmail],
      },
    },
  });
}

async function main() {
  await removePreviousDemoData();

  const [ownerPasswordHash, memberPasswordHash] = await Promise.all([
    hash(demo.ownerPassword, 12),
    hash(demo.memberPassword, 12),
  ]);
  const fileSha256 = createHash("sha256").update(pdfBytes).digest("hex");

  const owner = await prisma.user.create({
    data: {
      email: demo.ownerEmail,
      fullName: "Demo Owner",
      passwordHash: ownerPasswordHash,
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      email: demo.memberEmail,
      fullName: "Demo Member",
      passwordHash: memberPasswordHash,
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: demo.workspaceName,
      businessType: "Muay Thai",
      status: "ACTIVE",
    },
  });

  const location = await prisma.location.create({
    data: {
      workspaceId: workspace.id,
      name: demo.workspaceName,
      timezone: demoTimezone,
      addressLine1: "123 Demo Street",
      city: "Vancouver",
      region: "BC",
      postalCode: "V6B 1A1",
      countryCode: "CA",
    },
  });

  const ownerWorkspaceUser = await prisma.workspaceUser.create({
    data: {
      workspaceId: workspace.id,
      userId: owner.id,
      role: "OWNER",
    },
  });

  await prisma.workspaceUser.create({
    data: {
      workspaceId: workspace.id,
      userId: memberUser.id,
      role: "CUSTOMER",
    },
  });

  await prisma.workspaceSetting.create({
    data: {
      workspaceId: workspace.id,
      allowMultipleRooms: true,
    },
  });

  await prisma.workspaceStripeSettings.create({
    data: {
      workspaceId: workspace.id,
      connectionStatus: "NOT_CONNECTED",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      failedPaymentGracePeriodDays: 7,
    },
  });

  const program = await prisma.program.create({
    data: {
      workspaceId: workspace.id,
      name: "Fundamentals",
      description: "Beginner-friendly Muay Thai fundamentals.",
      ageGroupLabel: "Adults",
      levelLabel: "Beginner",
    },
  });

  const room = await prisma.room.create({
    data: {
      locationId: location.id,
      name: "Main Mat",
      capacity: 24,
      isActive: true,
    },
  });

  const classTemplate = await prisma.classTemplate.create({
    data: {
      workspaceId: workspace.id,
      programId: program.id,
      roomId: room.id,
      coachWorkspaceUserId: ownerWorkspaceUser.id,
      title: "Today Fundamentals",
      weekday: getDemoWeekday(),
      startTimeMinutes: 1380,
      endTimeMinutes: 1439,
      capacityOverride: 20,
      bookingCutoffMinutes: 0,
      cancellationCutoffMinutes: 0,
    },
  });

  const membershipPlan = await prisma.membershipPlan.create({
    data: {
      workspaceId: workspace.id,
      name: "Unlimited Monthly",
      description: "All regular classes.",
      monthlyPriceCents: 12900,
      currency: "cad",
      cancellationPolicyReference: "30-day notice",
      freezePolicyReference: "Owner-approved freezes",
    },
  });

  const punchCardProduct = await prisma.punchCardProduct.create({
    data: {
      workspaceId: workspace.id,
      name: "10-class pack",
      description: "Demo punch card.",
      punchesIncluded: 10,
      priceCents: 25000,
      currency: "cad",
      isEnabled: true,
      restrictionMode: "GENERAL",
    },
  });

  await prisma.dropInProduct.create({
    data: {
      workspaceId: workspace.id,
      name: "Single class drop-in",
      description: "Demo drop-in.",
      priceCents: 3500,
      currency: "cad",
      isEnabled: true,
      restrictionMode: "GENERAL",
    },
  });

  const member = await prisma.member.create({
    data: {
      workspaceId: workspace.id,
      userId: memberUser.id,
      fullName: "Demo Member",
      email: demo.memberEmail,
      phone: "555-0101",
      status: "TRIAL",
      tags: ["demo", "beginner"],
      notes: "Seeded for the working demo.",
    },
  });

  const memberMembership = await prisma.memberMembership.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      membershipPlanId: membershipPlan.id,
      status: "PENDING_PAYMENT_METHOD",
      nextBillingDate: dateOnly("2026-06-01"),
    },
  });

  await prisma.membershipBillingState.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      memberMembershipId: memberMembership.id,
      status: "PENDING_PAYMENT_METHOD",
      nextBillingDate: dateOnly("2026-06-01"),
      failureMessage: "Stripe is not connected or ready for charges yet.",
    },
  });

  await prisma.billingRecord.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      memberMembershipId: memberMembership.id,
      type: "MEMBERSHIP_ASSIGNED",
      status: "INFO",
      amountCents: 12900,
      currency: "cad",
      failureMessage: "Stripe is not connected or ready for charges yet.",
    },
  });

  await prisma.memberPunchCard.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      punchCardProductId: punchCardProduct.id,
      originalPunches: 10,
      remainingPunches: 10,
      status: "ACTIVE",
      purchasePriceCents: 25000,
      purchaseCurrency: "cad",
    },
  });

  await prisma.billingRecord.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      type: "PUNCH_CARD_GRANTED",
      status: "INFO",
      amountCents: 25000,
      currency: "cad",
    },
  });

  const formDocument = await prisma.formDocument.create({
    data: {
      workspaceId: workspace.id,
      name: "Demo Waiver",
      formType: "WAIVER",
      description: "Seeded demo PDF waiver.",
    },
  });

  const formVersion = await prisma.formVersion.create({
    data: {
      workspaceId: workspace.id,
      formDocumentId: formDocument.id,
      versionNumber: 1,
      fileName: "demo-waiver.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: pdfBytes.length,
      fileSha256,
      fileData: pdfBytes,
      uploadedByWorkspaceUserId: ownerWorkspaceUser.id,
    },
  });

  await prisma.formDocument.update({
    where: {
      id: formDocument.id,
    },
    data: {
      currentVersionId: formVersion.id,
    },
  });

  await prisma.staffInvite.create({
    data: {
      workspaceId: workspace.id,
      invitedByUserId: owner.id,
      email: demo.coachInviteEmail,
      role: "COACH",
      status: "PENDING",
      token: randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`Seeded ${demo.workspaceName}`);
  console.log(`Admin: ${demo.ownerEmail} / ${demo.ownerPassword}`);
  console.log(`Member: ${demo.memberEmail} / ${demo.memberPassword}`);
  console.log(`Workspace ID: ${workspace.id}`);
  console.log(`Class template ID: ${classTemplate.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
