import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

const demoMemberImportCsv = [
  "external_id,full_name,email,phone,status,tags,notes",
  "demo-member-legacy-001,Demo Member,demo-member@flowstate.local,555-0101,TRIAL,demo|beginner,Seeded for the working demo.",
  "",
].join("\n");
const demoMemberImportBytes = Buffer.from(demoMemberImportCsv, "utf8");
const demoMemberImportSha256 = createHash("sha256")
  .update(demoMemberImportBytes)
  .digest("hex");

const prisma = new PrismaClient();

const demo = {
  workspaceName: "Demo Flowstate Gym",
  ownerEmail: "demo-owner@flowstate.local",
  memberEmail: "demo-member@flowstate.local",
  importStartedAt: "2026-05-30T11:30:00.000Z",
  importCompletedAt: "2026-05-30T11:45:00.000Z",
  ownerReviewAcknowledgedAt: "2026-05-30T12:00:00.000Z",
  operationallyReadyAt: "2026-05-30T12:05:00.000Z",
  operationalReadinessActor: "demo-flowstate-operator",
  migrationCopy: {
    nextOwnerAction:
      "No further owner review is pending. Daily operations are active.",
    flowstateResponsibility:
      "Flowstate completed the reviewed handoff and recorded the workspace as ready for daily operations.",
    expectedNextMilestone: "Daily operations are active in Flowstate.",
  },
  ids: {
    workspace: "demo-workspace-flowstate",
    migration: "demo-workspace-migration",
    owner: "demo-user-owner",
    memberUser: "demo-user-member",
    location: "demo-location-primary",
    ownerWorkspaceUser: "demo-workspace-user-owner",
    memberWorkspaceUser: "demo-workspace-user-member",
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

async function main() {
  const workspaces = await prisma.workspace.findMany({
    where: {
      name: demo.workspaceName,
    },
    select: {
      id: true,
      status: true,
      migration: {
        select: {
          id: true,
          workspaceId: true,
          stage: true,
          currentSoftware: true,
          targetGoLiveDate: true,
          memberCountEstimate: true,
          billingStatus: true,
          scheduleComplexity: true,
          formsAndWaivers: true,
          dataScope: true,
          accessInstructions: true,
          nextOwnerAction: true,
          flowstateResponsibility: true,
          expectedNextMilestone: true,
          goLiveScheduledFor: true,
          ownerReviewAcknowledgedAt: true,
          ownerReviewAcknowledgedByUserId: true,
          operationallyReadyAt: true,
          operationallyReadyByUserId: true,
        },
      },
      location: {
        select: {
          id: true,
          workspaceId: true,
        },
      },
      workspaceUsers: {
        orderBy: {
          role: "asc",
        },
        select: {
          id: true,
          userId: true,
          role: true,
        },
      },
    },
  });

  assert.equal(
    workspaces.length,
    1,
    "the demo seed must create exactly one demo workspace",
  );

  const workspace = workspaces[0];
  assert.ok(workspace);

  const owners = await prisma.user.findMany({
    where: {
      email: demo.ownerEmail,
    },
    select: {
      id: true,
    },
  });

  assert.equal(owners.length, 1, "the demo seed must create exactly one owner");
  assert.equal(
    workspace.id,
    demo.ids.workspace,
    "the demo workspace identifier must be stable across seed runs",
  );
  assert.equal(
    owners[0]?.id,
    demo.ids.owner,
    "the demo owner identifier must be stable across seed runs",
  );
  assert.equal(workspace.status, "ACTIVE");
  assert.equal(workspace.migration?.id, demo.ids.migration);
  assert.equal(workspace.migration?.workspaceId, demo.ids.workspace);
  assert.equal(
    workspace.migration?.stage,
    "COMPLETE",
    "the demo migration handoff must be complete",
  );
  assert.equal(
    workspace.migration?.ownerReviewAcknowledgedAt?.toISOString(),
    demo.ownerReviewAcknowledgedAt,
    "the demo migration review acknowledgment must use the deterministic timestamp",
  );
  assert.equal(
    workspace.migration?.ownerReviewAcknowledgedByUserId,
    demo.ids.owner,
    "the demo migration review acknowledgment must belong to the demo owner",
  );
  assert.equal(
    workspace.migration?.operationallyReadyAt?.toISOString(),
    demo.operationallyReadyAt,
    "the demo migration handoff must use the deterministic readiness timestamp",
  );
  assert.equal(
    workspace.migration?.operationallyReadyByUserId,
    demo.operationalReadinessActor,
    "the internal Flowstate operator must be recorded as the completed handoff actor",
  );
  assert.equal(
    workspace.migration?.currentSoftware,
    "Legacy gym software (fictional demo)",
  );
  assert.equal(
    workspace.migration?.targetGoLiveDate?.toISOString(),
    "2026-05-30T00:00:00.000Z",
  );
  assert.equal(workspace.migration?.memberCountEstimate, 1);
  assert.equal(
    workspace.migration?.billingStatus,
    "Billing is not part of this fictional member-import example.",
  );
  assert.equal(
    workspace.migration?.scheduleComplexity,
    "Schedules are not part of this fictional member-import example.",
  );
  assert.equal(
    workspace.migration?.formsAndWaivers,
    "Forms and waivers are not part of this fictional member-import example.",
  );
  assert.deepEqual(workspace.migration?.dataScope, ["Members only"]);
  assert.equal(
    workspace.migration?.accessInstructions,
    "Fictional demo CSV; no customer or production data.",
  );
  assert.equal(
    workspace.migration?.goLiveScheduledFor?.toISOString(),
    "2026-05-30T00:00:00.000Z",
  );
  assert.equal(
    workspace.migration?.nextOwnerAction,
    demo.migrationCopy.nextOwnerAction,
  );
  assert.equal(
    workspace.migration?.flowstateResponsibility,
    demo.migrationCopy.flowstateResponsibility,
  );
  assert.equal(
    workspace.migration?.expectedNextMilestone,
    demo.migrationCopy.expectedNextMilestone,
  );
  assert.deepEqual(workspace.location, {
    id: demo.ids.location,
    workspaceId: demo.ids.workspace,
  });
  assert.deepEqual(workspace.workspaceUsers, [
    {
      id: demo.ids.ownerWorkspaceUser,
      userId: demo.ids.owner,
      role: "OWNER",
    },
    {
      id: demo.ids.memberWorkspaceUser,
      userId: demo.ids.memberUser,
      role: "CUSTOMER",
    },
  ]);

  const [
    importJobs,
    importSourceFiles,
    stagingRecords,
    importedRecords,
    validationIssues,
    blockingValidationIssueCount,
    reconciliationReports,
  ] = await prisma.$transaction([
    prisma.importJob.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        workspaceId: true,
        sourceType: true,
        status: true,
        name: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        failureMessage: true,
        cancelledAt: true,
        cancelledByOperatorId: true,
        cancellationReason: true,
      },
    }),
    prisma.importSourceFile.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        workspaceId: true,
        importJobId: true,
        fileName: true,
        mimeType: true,
        fileSizeBytes: true,
        fileSha256: true,
        storageKey: true,
        rawContent: true,
      },
    }),
    prisma.stagingRecord.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        workspaceId: true,
        importJobId: true,
        importSourceFileId: true,
        recordKind: true,
        sourceRowNumber: true,
        externalId: true,
        rawData: true,
        mappedData: true,
        isReadyForImport: true,
        importedAt: true,
        importedModel: true,
        importedRecordId: true,
      },
    }),
    prisma.migrationImportedRecord.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        workspaceId: true,
        importJobId: true,
        stagingRecordId: true,
        recordKind: true,
        externalId: true,
        importedModel: true,
        importedRecordId: true,
      },
    }),
    prisma.validationIssue.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { id: "asc" },
      select: { id: true },
    }),
    prisma.validationIssue.count({
      where: { workspaceId: workspace.id, severity: "ERROR" },
    }),
    prisma.reconciliationReport.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        workspaceId: true,
        importJobId: true,
        summary: true,
        generatedAt: true,
      },
    }),
  ]);

  assert.deepEqual(importJobs, [
    {
      id: demo.ids.importJob,
      workspaceId: demo.ids.workspace,
      sourceType: "CSV",
      status: "COMPLETED",
      name: "Fictional demo member import",
      startedAt: new Date(demo.importStartedAt),
      completedAt: new Date(demo.importCompletedAt),
      failedAt: null,
      failureMessage: null,
      cancelledAt: null,
      cancelledByOperatorId: null,
      cancellationReason: null,
    },
  ]);
  assert.deepEqual(importSourceFiles, [
    {
      id: demo.ids.importSourceFile,
      workspaceId: demo.ids.workspace,
      importJobId: demo.ids.importJob,
      fileName: "fictional-demo-members.csv",
      mimeType: "text/csv",
      fileSizeBytes: demoMemberImportBytes.length,
      fileSha256: demoMemberImportSha256,
      storageKey: null,
      rawContent: demoMemberImportCsv,
    },
  ]);
  assert.deepEqual(stagingRecords, [
    {
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
      importedAt: new Date(demo.importCompletedAt),
      importedModel: "Member",
      importedRecordId: demo.ids.member,
    },
  ]);
  assert.deepEqual(importedRecords, [
    {
      id: demo.ids.importedRecord,
      workspaceId: demo.ids.workspace,
      importJobId: demo.ids.importJob,
      stagingRecordId: demo.ids.stagingRecord,
      recordKind: "MEMBER",
      externalId: "demo-member-legacy-001",
      importedModel: "Member",
      importedRecordId: demo.ids.member,
    },
  ]);
  assert.deepEqual(validationIssues, []);
  assert.equal(blockingValidationIssueCount, 0);
  assert.deepEqual(reconciliationReports, [
    {
      id: demo.ids.reconciliationReport,
      workspaceId: demo.ids.workspace,
      importJobId: demo.ids.importJob,
      summary: { created: 1, updated: 0, skipped: 0, recordKind: "MEMBER" },
      generatedAt: new Date(demo.importCompletedAt),
    },
  ]);

  const importStartedAt = importJobs[0]?.startedAt;
  const importCompletedAt = importJobs[0]?.completedAt;
  const reconciledAt = reconciliationReports[0]?.generatedAt;
  const ownerAcknowledgedAt = workspace.migration?.ownerReviewAcknowledgedAt;
  const operationallyReadyAt = workspace.migration?.operationallyReadyAt;
  assert.ok(importStartedAt && importCompletedAt && reconciledAt);
  assert.ok(ownerAcknowledgedAt && operationallyReadyAt);
  assert.ok(importStartedAt < importCompletedAt);
  assert.equal(importCompletedAt.toISOString(), reconciledAt.toISOString());
  assert.ok(importCompletedAt < ownerAcknowledgedAt);
  assert.ok(ownerAcknowledgedAt < operationallyReadyAt);

  const [
    workspaceSetting,
    stripeSettingsRecord,
    program,
    room,
    classTemplate,
    membershipPlan,
    punchCardProduct,
    dropInProduct,
    member,
    memberMembership,
    billingState,
    billingRecordRows,
    memberPunchCard,
    formDocument,
    formVersion,
    staffInvite,
  ] = await prisma.$transaction([
    prisma.workspaceSetting.findUnique({
      where: { id: demo.ids.workspaceSetting },
      select: { workspaceId: true, allowMultipleRooms: true },
    }),
    prisma.workspaceStripeSettings.findUnique({
      where: { id: demo.ids.stripeSettings },
      select: { workspaceId: true, connectionStatus: true },
    }),
    prisma.program.findUnique({
      where: { id: demo.ids.program },
      select: { workspaceId: true, name: true },
    }),
    prisma.room.findUnique({
      where: { id: demo.ids.room },
      select: { locationId: true, name: true },
    }),
    prisma.classTemplate.findUnique({
      where: { id: demo.ids.classTemplate },
      select: {
        workspaceId: true,
        programId: true,
        roomId: true,
        coachWorkspaceUserId: true,
      },
    }),
    prisma.membershipPlan.findUnique({
      where: { id: demo.ids.membershipPlan },
      select: { workspaceId: true, name: true },
    }),
    prisma.punchCardProduct.findUnique({
      where: { id: demo.ids.punchCardProduct },
      select: { workspaceId: true, punchesIncluded: true, isEnabled: true },
    }),
    prisma.dropInProduct.findUnique({
      where: { id: demo.ids.dropInProduct },
      select: { workspaceId: true, isEnabled: true },
    }),
    prisma.member.findUnique({
      where: { id: demo.ids.member },
      select: {
        workspaceId: true,
        userId: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        tags: true,
        notes: true,
      },
    }),
    prisma.memberMembership.findUnique({
      where: { id: demo.ids.memberMembership },
      select: {
        workspaceId: true,
        memberId: true,
        membershipPlanId: true,
        status: true,
      },
    }),
    prisma.membershipBillingState.findUnique({
      where: { id: demo.ids.billingState },
      select: {
        workspaceId: true,
        memberId: true,
        memberMembershipId: true,
        status: true,
      },
    }),
    prisma.billingRecord.findMany({
      where: { workspaceId: demo.ids.workspace },
      orderBy: { id: "asc" },
      select: {
        id: true,
        memberId: true,
        memberMembershipId: true,
        type: true,
      },
    }),
    prisma.memberPunchCard.findUnique({
      where: { id: demo.ids.memberPunchCard },
      select: {
        workspaceId: true,
        memberId: true,
        punchCardProductId: true,
        status: true,
        remainingPunches: true,
      },
    }),
    prisma.formDocument.findUnique({
      where: { id: demo.ids.formDocument },
      select: { workspaceId: true, formType: true, currentVersionId: true },
    }),
    prisma.formVersion.findUnique({
      where: { id: demo.ids.formVersion },
      select: {
        workspaceId: true,
        formDocumentId: true,
        versionNumber: true,
        uploadedByWorkspaceUserId: true,
      },
    }),
    prisma.staffInvite.findUnique({
      where: { id: demo.ids.staffInvite },
      select: {
        workspaceId: true,
        invitedByUserId: true,
        role: true,
        status: true,
        expiresAt: true,
      },
    }),
  ]);

  assert.deepEqual(workspaceSetting, {
    workspaceId: demo.ids.workspace,
    allowMultipleRooms: true,
  });
  assert.deepEqual(stripeSettingsRecord, {
    workspaceId: demo.ids.workspace,
    connectionStatus: "NOT_CONNECTED",
  });
  assert.deepEqual(program, {
    workspaceId: demo.ids.workspace,
    name: "Fundamentals",
  });
  assert.deepEqual(room, {
    locationId: demo.ids.location,
    name: "Main Mat",
  });
  assert.deepEqual(classTemplate, {
    workspaceId: demo.ids.workspace,
    programId: demo.ids.program,
    roomId: demo.ids.room,
    coachWorkspaceUserId: demo.ids.ownerWorkspaceUser,
  });
  assert.deepEqual(membershipPlan, {
    workspaceId: demo.ids.workspace,
    name: "Unlimited Monthly",
  });
  assert.deepEqual(punchCardProduct, {
    workspaceId: demo.ids.workspace,
    punchesIncluded: 10,
    isEnabled: true,
  });
  assert.deepEqual(dropInProduct, {
    workspaceId: demo.ids.workspace,
    isEnabled: true,
  });
  assert.deepEqual(member, {
    workspaceId: demo.ids.workspace,
    userId: demo.ids.memberUser,
    fullName: "Demo Member",
    email: demo.memberEmail,
    phone: "555-0101",
    status: "TRIAL",
    tags: ["demo", "beginner"],
    notes: "Seeded for the working demo.",
  });
  assert.deepEqual(memberMembership, {
    workspaceId: demo.ids.workspace,
    memberId: demo.ids.member,
    membershipPlanId: demo.ids.membershipPlan,
    status: "PENDING_PAYMENT_METHOD",
  });
  assert.deepEqual(billingState, {
    workspaceId: demo.ids.workspace,
    memberId: demo.ids.member,
    memberMembershipId: demo.ids.memberMembership,
    status: "PENDING_PAYMENT_METHOD",
  });
  assert.deepEqual(billingRecordRows, [
    {
      id: demo.ids.membershipBillingRecord,
      memberId: demo.ids.member,
      memberMembershipId: demo.ids.memberMembership,
      type: "MEMBERSHIP_ASSIGNED",
    },
    {
      id: demo.ids.punchCardBillingRecord,
      memberId: demo.ids.member,
      memberMembershipId: null,
      type: "PUNCH_CARD_GRANTED",
    },
  ]);
  assert.deepEqual(memberPunchCard, {
    workspaceId: demo.ids.workspace,
    memberId: demo.ids.member,
    punchCardProductId: demo.ids.punchCardProduct,
    status: "ACTIVE",
    remainingPunches: 10,
  });
  assert.deepEqual(formDocument, {
    workspaceId: demo.ids.workspace,
    formType: "WAIVER",
    currentVersionId: demo.ids.formVersion,
  });
  assert.deepEqual(formVersion, {
    workspaceId: demo.ids.workspace,
    formDocumentId: demo.ids.formDocument,
    versionNumber: 1,
    uploadedByWorkspaceUserId: demo.ids.ownerWorkspaceUser,
  });
  assert.deepEqual(staffInvite, {
    workspaceId: demo.ids.workspace,
    invitedByUserId: demo.ids.owner,
    role: "COACH",
    status: "PENDING",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  });

  const workspaceId = workspace.id;
  const [
    demoWorkspaces,
    demoUsers,
    workspaceMigrations,
    locations,
    rooms,
    workspaceUsers,
    workspaceSettings,
    stripeSettings,
    programs,
    classTemplates,
    membershipPlans,
    punchCardProducts,
    dropInProducts,
    members,
    memberMemberships,
    billingStates,
    billingRecords,
    memberPunchCards,
    formDocuments,
    formVersions,
    staffInvites,
    importJobCount,
    importSourceFileCount,
    stagingRecordCount,
    validationIssueCount,
    reconciliationReportCount,
    migrationImportedRecordCount,
  ] = await prisma.$transaction([
    prisma.workspace.count({ where: { name: demo.workspaceName } }),
    prisma.user.count({
      where: {
        email: {
          in: [demo.ownerEmail, demo.memberEmail],
        },
      },
    }),
    prisma.workspaceMigration.count({ where: { workspaceId } }),
    prisma.location.count({ where: { workspaceId } }),
    prisma.room.count({ where: { location: { workspaceId } } }),
    prisma.workspaceUser.count({ where: { workspaceId } }),
    prisma.workspaceSetting.count({ where: { workspaceId } }),
    prisma.workspaceStripeSettings.count({ where: { workspaceId } }),
    prisma.program.count({ where: { workspaceId } }),
    prisma.classTemplate.count({ where: { workspaceId } }),
    prisma.membershipPlan.count({ where: { workspaceId } }),
    prisma.punchCardProduct.count({ where: { workspaceId } }),
    prisma.dropInProduct.count({ where: { workspaceId } }),
    prisma.member.count({ where: { workspaceId } }),
    prisma.memberMembership.count({ where: { workspaceId } }),
    prisma.membershipBillingState.count({ where: { workspaceId } }),
    prisma.billingRecord.count({ where: { workspaceId } }),
    prisma.memberPunchCard.count({ where: { workspaceId } }),
    prisma.formDocument.count({ where: { workspaceId } }),
    prisma.formVersion.count({ where: { workspaceId } }),
    prisma.staffInvite.count({ where: { workspaceId } }),
    prisma.importJob.count({ where: { workspaceId } }),
    prisma.importSourceFile.count({ where: { workspaceId } }),
    prisma.stagingRecord.count({ where: { workspaceId } }),
    prisma.validationIssue.count({ where: { workspaceId } }),
    prisma.reconciliationReport.count({ where: { workspaceId } }),
    prisma.migrationImportedRecord.count({ where: { workspaceId } }),
  ]);

  const counts = {
    demoWorkspaces,
    demoUsers,
    workspaceMigrations,
    locations,
    rooms,
    workspaceUsers,
    workspaceSettings,
    stripeSettings,
    programs,
    classTemplates,
    membershipPlans,
    punchCardProducts,
    dropInProducts,
    members,
    memberMemberships,
    billingStates,
    billingRecords,
    memberPunchCards,
    formDocuments,
    formVersions,
    staffInvites,
    importJobCount,
    importSourceFileCount,
    stagingRecordCount,
    validationIssueCount,
    reconciliationReportCount,
    migrationImportedRecordCount,
  };

  assert.deepEqual(counts, {
    demoWorkspaces: 1,
    demoUsers: 2,
    workspaceMigrations: 1,
    locations: 1,
    rooms: 1,
    workspaceUsers: 2,
    workspaceSettings: 1,
    stripeSettings: 1,
    programs: 1,
    classTemplates: 1,
    membershipPlans: 1,
    punchCardProducts: 1,
    dropInProducts: 1,
    members: 1,
    memberMemberships: 1,
    billingStates: 1,
    billingRecords: 2,
    memberPunchCards: 1,
    formDocuments: 1,
    formVersions: 1,
    staffInvites: 1,
    importJobCount: 1,
    importSourceFileCount: 1,
    stagingRecordCount: 1,
    validationIssueCount: 0,
    reconciliationReportCount: 1,
    migrationImportedRecordCount: 1,
  });

  globalThis.console.log(
    JSON.stringify(
      {
        workspace: {
          name: demo.workspaceName,
          status: workspace.status,
        },
        migration: {
          stage: workspace.migration.stage,
          operationallyReadyAt:
            workspace.migration.operationallyReadyAt.toISOString(),
          completedByFlowstateOperator: true,
        },
        counts,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
