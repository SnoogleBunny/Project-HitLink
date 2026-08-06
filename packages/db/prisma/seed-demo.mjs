/* global console */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";

import { runGuardedDemoAction } from "./demo-database-safety.mjs";

let prisma;

const demoMemberImportCsv = [
  "external_id,full_name,email,phone,status,tags,notes",
  "demo-member-legacy-001,Demo Member,demo-member@flowstate.local,555-0101,TRIAL,demo|beginner,Seeded for the working demo.",
  "",
].join("\n");
const demoMemberImportBytes = Buffer.from(demoMemberImportCsv, "utf8");
const demoMemberImportSha256 = createHash("sha256")
  .update(demoMemberImportBytes)
  .digest("hex");

const demo = {
  workspaceName: "Demo Flowstate Gym",
  ownerEmail: "demo-owner@flowstate.local",
  ownerPassword: "DemoPass123!",
  memberEmail: "demo-member@flowstate.local",
  memberPassword: "MemberPass123!",
  coachInviteEmail: "demo-coach@flowstate.local",
  operationalReadinessActor: "demo-flowstate-operator",
  ids: {
    owner: "demo-user-owner",
    memberUser: "demo-user-member",
    workspace: "demo-workspace-flowstate",
    location: "demo-location-primary",
    ownerWorkspaceUser: "demo-workspace-user-owner",
    memberWorkspaceUser: "demo-workspace-user-member",
    migration: "demo-workspace-migration",
    workspaceSetting: "demo-workspace-setting",
    stripeSettings: "demo-stripe-settings",
    program: "demo-program-fundamentals",
    room: "demo-room-main-mat",
    classTemplate: "demo-class-template-fundamentals",
    membershipPlan: "demo-membership-plan-unlimited",
    punchCardProduct: "demo-punch-card-product-10",
    dropInProduct: "demo-drop-in-product-single",
    member: "demo-member-record",
    memberMembership: "demo-member-membership",
    billingState: "demo-membership-billing-state",
    membershipBillingRecord: "demo-billing-record-membership",
    memberPunchCard: "demo-member-punch-card",
    punchCardBillingRecord: "demo-billing-record-punch-card",
    formDocument: "demo-form-document-waiver",
    formVersion: "demo-form-version-waiver-v1",
    staffInvite: "demo-staff-invite-coach",
    importJob: "demo-import-job-member",
    importSourceFile: "demo-import-source-file-member",
    stagingRecord: "demo-staging-record-member",
    importedRecord: "demo-migration-imported-record-member",
    reconciliationReport: "demo-reconciliation-report-member",
  },
};

const demoTimezone = "America/Vancouver";
const demoImportStartedAt = new Date("2026-05-30T11:30:00.000Z");
const demoImportCompletedAt = new Date("2026-05-30T11:45:00.000Z");
const demoOwnerReviewAcknowledgedAt = new Date("2026-05-30T12:00:00.000Z");
const demoOperationallyReadyAt = new Date("2026-05-30T12:05:00.000Z");
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
BT /F1 12 Tf 24 120 Td (Flowstate demo waiver) Tj ET
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

async function main() {
  prisma = new PrismaClient();

  const [ownerPasswordHash, memberPasswordHash] = await Promise.all([
    hash(demo.ownerPassword, 12),
    hash(demo.memberPassword, 12),
  ]);
  const fileSha256 = createHash("sha256").update(pdfBytes).digest("hex");

  await prisma.$transaction([
    prisma.workspace.deleteMany({
      where: {
        name: demo.workspaceName,
      },
    }),
    prisma.user.deleteMany({
      where: {
        email: {
          in: [demo.ownerEmail, demo.memberEmail],
        },
      },
    }),
    prisma.user.create({
      data: {
        id: demo.ids.owner,
        email: demo.ownerEmail,
        fullName: "Demo Owner",
        passwordHash: ownerPasswordHash,
      },
    }),
    prisma.user.create({
      data: {
        id: demo.ids.memberUser,
        email: demo.memberEmail,
        fullName: "Demo Member",
        passwordHash: memberPasswordHash,
      },
    }),
    prisma.workspace.create({
      data: {
        id: demo.ids.workspace,
        name: demo.workspaceName,
        businessType: "Muay Thai",
        status: "ACTIVE",
      },
    }),
    prisma.location.create({
      data: {
        id: demo.ids.location,
        workspaceId: demo.ids.workspace,
        name: demo.workspaceName,
        timezone: demoTimezone,
        addressLine1: "123 Demo Street",
        city: "Vancouver",
        region: "BC",
        postalCode: "V6B 1A1",
        countryCode: "CA",
      },
    }),
    prisma.workspaceUser.create({
      data: {
        id: demo.ids.ownerWorkspaceUser,
        workspaceId: demo.ids.workspace,
        userId: demo.ids.owner,
        role: "OWNER",
      },
    }),
    prisma.workspaceMigration.create({
      data: {
        id: demo.ids.migration,
        workspaceId: demo.ids.workspace,
        stage: "COMPLETE",
        currentSoftware: "Legacy gym software (fictional demo)",
        targetGoLiveDate: dateOnly("2026-05-30"),
        memberCountEstimate: 1,
        billingStatus:
          "Billing is not part of this fictional member-import example.",
        scheduleComplexity:
          "Schedules are not part of this fictional member-import example.",
        formsAndWaivers:
          "Forms and waivers are not part of this fictional member-import example.",
        dataScope: ["Members only"],
        accessInstructions:
          "Fictional demo CSV; no customer or production data.",
        goLiveScheduledFor: dateOnly("2026-05-30"),
        ownerReviewAcknowledgedAt: demoOwnerReviewAcknowledgedAt,
        ownerReviewAcknowledgedByUserId: demo.ids.owner,
        operationallyReadyAt: demoOperationallyReadyAt,
        operationallyReadyByUserId: demo.operationalReadinessActor,
        nextOwnerAction:
          "No further owner review is pending. Daily operations are active.",
        flowstateResponsibility:
          "Flowstate completed the reviewed handoff and recorded the workspace as ready for daily operations.",
        expectedNextMilestone: "Daily operations are active in Flowstate.",
      },
    }),
    prisma.workspaceUser.create({
      data: {
        id: demo.ids.memberWorkspaceUser,
        workspaceId: demo.ids.workspace,
        userId: demo.ids.memberUser,
        role: "CUSTOMER",
      },
    }),
    prisma.workspaceSetting.create({
      data: {
        id: demo.ids.workspaceSetting,
        workspaceId: demo.ids.workspace,
        allowMultipleRooms: true,
      },
    }),
    prisma.workspaceStripeSettings.create({
      data: {
        id: demo.ids.stripeSettings,
        workspaceId: demo.ids.workspace,
        connectionStatus: "NOT_CONNECTED",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        failedPaymentGracePeriodDays: 7,
      },
    }),
    prisma.program.create({
      data: {
        id: demo.ids.program,
        workspaceId: demo.ids.workspace,
        name: "Fundamentals",
        description: "Beginner-friendly Muay Thai fundamentals.",
        ageGroupLabel: "Adults",
        levelLabel: "Beginner",
      },
    }),
    prisma.room.create({
      data: {
        id: demo.ids.room,
        locationId: demo.ids.location,
        name: "Main Mat",
        capacity: 24,
        isActive: true,
      },
    }),
    prisma.classTemplate.create({
      data: {
        id: demo.ids.classTemplate,
        workspaceId: demo.ids.workspace,
        programId: demo.ids.program,
        roomId: demo.ids.room,
        coachWorkspaceUserId: demo.ids.ownerWorkspaceUser,
        title: "Today Fundamentals",
        weekday: getDemoWeekday(),
        startTimeMinutes: 1380,
        endTimeMinutes: 1439,
        capacityOverride: 20,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
      },
    }),
    prisma.membershipPlan.create({
      data: {
        id: demo.ids.membershipPlan,
        workspaceId: demo.ids.workspace,
        name: "Unlimited Monthly",
        description: "All regular classes.",
        monthlyPriceCents: 12900,
        currency: "cad",
        cancellationPolicyReference: "30-day notice",
        freezePolicyReference: "Owner-approved freezes",
      },
    }),
    prisma.punchCardProduct.create({
      data: {
        id: demo.ids.punchCardProduct,
        workspaceId: demo.ids.workspace,
        name: "10-class pack",
        description: "Demo punch card.",
        punchesIncluded: 10,
        priceCents: 25000,
        currency: "cad",
        isEnabled: true,
        restrictionMode: "GENERAL",
      },
    }),
    prisma.dropInProduct.create({
      data: {
        id: demo.ids.dropInProduct,
        workspaceId: demo.ids.workspace,
        name: "Single class drop-in",
        description: "Demo drop-in.",
        priceCents: 3500,
        currency: "cad",
        isEnabled: true,
        restrictionMode: "GENERAL",
      },
    }),
    prisma.member.create({
      data: {
        id: demo.ids.member,
        workspaceId: demo.ids.workspace,
        userId: demo.ids.memberUser,
        fullName: "Demo Member",
        email: demo.memberEmail,
        phone: "555-0101",
        status: "TRIAL",
        tags: ["demo", "beginner"],
        notes: "Seeded for the working demo.",
      },
    }),
    prisma.importJob.create({
      data: {
        id: demo.ids.importJob,
        workspaceId: demo.ids.workspace,
        sourceType: "CSV",
        status: "COMPLETED",
        name: "Fictional demo member import",
        startedAt: demoImportStartedAt,
        completedAt: demoImportCompletedAt,
      },
    }),
    prisma.importSourceFile.create({
      data: {
        id: demo.ids.importSourceFile,
        workspaceId: demo.ids.workspace,
        importJobId: demo.ids.importJob,
        fileName: "fictional-demo-members.csv",
        mimeType: "text/csv",
        fileSizeBytes: demoMemberImportBytes.length,
        fileSha256: demoMemberImportSha256,
        rawContent: demoMemberImportCsv,
      },
    }),
    prisma.stagingRecord.create({
      data: {
        id: demo.ids.stagingRecord,
        workspaceId: demo.ids.workspace,
        importJobId: demo.ids.importJob,
        importSourceFileId: demo.ids.importSourceFile,
        recordKind: "MEMBER",
        sourceRowNumber: 2,
        externalId: "demo-member-legacy-001",
        rawData: {
          external_id: "demo-member-legacy-001",
          full_name: "Demo Member",
          email: demo.memberEmail,
          phone: "555-0101",
          status: "TRIAL",
          tags: "demo|beginner",
          notes: "Seeded for the working demo.",
        },
        mappedData: {
          fullName: "Demo Member",
          email: demo.memberEmail,
          phone: "555-0101",
          status: "TRIAL",
          tags: ["demo", "beginner"],
          notes: "Seeded for the working demo.",
        },
        isReadyForImport: true,
        importedAt: demoImportCompletedAt,
        importedModel: "Member",
        importedRecordId: demo.ids.member,
      },
    }),
    prisma.migrationImportedRecord.create({
      data: {
        id: demo.ids.importedRecord,
        workspaceId: demo.ids.workspace,
        importJobId: demo.ids.importJob,
        stagingRecordId: demo.ids.stagingRecord,
        recordKind: "MEMBER",
        externalId: "demo-member-legacy-001",
        importedModel: "Member",
        importedRecordId: demo.ids.member,
      },
    }),
    prisma.reconciliationReport.create({
      data: {
        id: demo.ids.reconciliationReport,
        workspaceId: demo.ids.workspace,
        importJobId: demo.ids.importJob,
        summary: {
          created: 1,
          updated: 0,
          skipped: 0,
          recordKind: "MEMBER",
        },
        generatedAt: demoImportCompletedAt,
      },
    }),
    prisma.memberMembership.create({
      data: {
        id: demo.ids.memberMembership,
        workspaceId: demo.ids.workspace,
        memberId: demo.ids.member,
        membershipPlanId: demo.ids.membershipPlan,
        status: "PENDING_PAYMENT_METHOD",
        nextBillingDate: dateOnly("2026-06-01"),
      },
    }),
    prisma.membershipBillingState.create({
      data: {
        id: demo.ids.billingState,
        workspaceId: demo.ids.workspace,
        memberId: demo.ids.member,
        memberMembershipId: demo.ids.memberMembership,
        status: "PENDING_PAYMENT_METHOD",
        nextBillingDate: dateOnly("2026-06-01"),
        failureMessage: "Stripe is not connected or ready for charges yet.",
      },
    }),
    prisma.billingRecord.create({
      data: {
        id: demo.ids.membershipBillingRecord,
        workspaceId: demo.ids.workspace,
        memberId: demo.ids.member,
        memberMembershipId: demo.ids.memberMembership,
        type: "MEMBERSHIP_ASSIGNED",
        status: "INFO",
        amountCents: 12900,
        currency: "cad",
        failureMessage: "Stripe is not connected or ready for charges yet.",
      },
    }),
    prisma.memberPunchCard.create({
      data: {
        id: demo.ids.memberPunchCard,
        workspaceId: demo.ids.workspace,
        memberId: demo.ids.member,
        punchCardProductId: demo.ids.punchCardProduct,
        originalPunches: 10,
        remainingPunches: 10,
        status: "ACTIVE",
        purchasePriceCents: 25000,
        purchaseCurrency: "cad",
      },
    }),
    prisma.billingRecord.create({
      data: {
        id: demo.ids.punchCardBillingRecord,
        workspaceId: demo.ids.workspace,
        memberId: demo.ids.member,
        type: "PUNCH_CARD_GRANTED",
        status: "INFO",
        amountCents: 25000,
        currency: "cad",
      },
    }),
    prisma.formDocument.create({
      data: {
        id: demo.ids.formDocument,
        workspaceId: demo.ids.workspace,
        name: "Demo Waiver",
        formType: "WAIVER",
        description: "Seeded demo PDF waiver.",
      },
    }),
    prisma.formVersion.create({
      data: {
        id: demo.ids.formVersion,
        workspaceId: demo.ids.workspace,
        formDocumentId: demo.ids.formDocument,
        versionNumber: 1,
        fileName: "demo-waiver.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: pdfBytes.length,
        fileSha256,
        fileData: pdfBytes,
        uploadedByWorkspaceUserId: demo.ids.ownerWorkspaceUser,
      },
    }),
    prisma.formDocument.update({
      where: {
        id: demo.ids.formDocument,
      },
      data: {
        currentVersionId: demo.ids.formVersion,
      },
    }),
    prisma.staffInvite.create({
      data: {
        id: demo.ids.staffInvite,
        workspaceId: demo.ids.workspace,
        invitedByUserId: demo.ids.owner,
        email: demo.coachInviteEmail,
        role: "COACH",
        status: "PENDING",
        token: "demo-coach-invite-token",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    }),
  ]);

  console.log(`Seeded ${demo.workspaceName}`);
  console.log(`Admin account: ${demo.ownerEmail}`);
  console.log(`Member account: ${demo.memberEmail}`);
  console.log("Demo passwords were set but are intentionally not printed.");
  console.log(`Workspace ID: ${demo.ids.workspace}`);
  console.log(`Class template ID: ${demo.ids.classTemplate}`);
}

runGuardedDemoAction({
  actionName: "seed demo data",
  action: main,
})
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
