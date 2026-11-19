/* eslint-disable turbo/no-undeclared-env-vars -- disposable PostgreSQL test URL is opt-in and never used by application runtime */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import type { PrismaClient } from "@flowstate/db";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const now = new Date("2026-04-08T00:30:00.000Z");
const scheduledForDate = new Date("2026-04-07T00:00:00.000Z");
const workspaceId = "rp07_trial_workspace";
const foreignWorkspaceId = "rp07_trial_foreign_workspace";
const ownerUserId = "rp07_trial_owner_user";
const foreignOwnerUserId = "rp07_trial_foreign_owner_user";
const ownerWorkspaceUserId = "rp07_trial_owner_workspace_user";
const foreignOwnerWorkspaceUserId = "rp07_trial_foreign_owner_workspace_user";
const locationId = "rp07_trial_location";
const foreignLocationId = "rp07_trial_foreign_location";
const roomId = "rp07_trial_room";
const foreignRoomId = "rp07_trial_foreign_room";
const programId = "rp07_trial_program";
const foreignProgramId = "rp07_trial_foreign_program";
const templateId = "rp07_trial_template";
const foreignTemplateId = "rp07_trial_foreign_template";
const formDocumentId = "rp07_trial_form_document";
const formVersionId = "rp07_trial_form_version";

integrationDescribe("public trial PostgreSQL atomicity", () => {
  let prisma: PrismaClient;
  let createTrialBooking: (typeof import("./trial-booking"))["createTrialBooking"];
  let listTrialBookingOptions: (typeof import("./trial-booking"))["listTrialBookingOptions"];
  let issueTrialMagicLinkRequests: (typeof import("@flowstate/db"))["issueTrialMagicLinkRequests"];
  let fetchSpy: MockInstance<typeof fetch>;

  async function seedWorkspace(args: {
    id: string;
    ownerUserId: string;
    ownerWorkspaceUserId: string;
    locationId: string;
    roomId: string;
    programId: string;
    templateId: string;
    withRequiredForm?: boolean;
  }) {
    await prisma.user.create({
      data: {
        id: args.ownerUserId,
        email: `${args.ownerUserId}@example.test`,
        fullName: "Trial Owner",
      },
    });
    await prisma.workspace.create({
      data: {
        id: args.id,
        name:
          args.id === workspaceId ? "Flowstate Trial Gym" : "Foreign Trial Gym",
        status: "ACTIVE",
        location: {
          create: {
            id: args.locationId,
            name: "Main gym",
            timezone: "America/Vancouver",
            rooms: {
              create: {
                id: args.roomId,
                name: "Main Mat",
                capacity: 2,
              },
            },
          },
        },
        programs: {
          create: {
            id: args.programId,
            name: "Muay Thai Fundamentals",
          },
        },
        workspaceUsers: {
          create: {
            id: args.ownerWorkspaceUserId,
            userId: args.ownerUserId,
            role: "OWNER",
            isActive: true,
          },
        },
      },
    });
    await prisma.classTemplate.create({
      data: {
        id: args.templateId,
        workspaceId: args.id,
        programId: args.programId,
        roomId: args.roomId,
        coachWorkspaceUserId: args.ownerWorkspaceUserId,
        title: "Muay Thai Fundamentals",
        weekday: "TUESDAY",
        startTimeMinutes: 18 * 60,
        endTimeMinutes: 19 * 60,
        capacityOverride: 2,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
      },
    });

    if (!args.withRequiredForm) {
      return;
    }

    await prisma.formDocument.create({
      data: {
        id: formDocumentId,
        workspaceId: args.id,
        name: "Adult Waiver",
        formType: "WAIVER",
      },
    });
    await prisma.formVersion.create({
      data: {
        id: formVersionId,
        workspaceId: args.id,
        formDocumentId,
        versionNumber: 1,
        fileName: "adult-waiver.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 5,
        fileSha256: "rp07-test-sha256",
        fileData: new Uint8Array([37, 80, 68, 70, 45]),
        uploadedByWorkspaceUserId: args.ownerWorkspaceUserId,
      },
    });
    await prisma.formDocument.update({
      where: { id: formDocumentId },
      data: { currentVersionId: formVersionId },
    });
    await prisma.requiredFormAssignment.create({
      data: {
        workspaceId: args.id,
        formDocumentId,
        requirementTarget: "TRIAL",
        isActive: true,
      },
    });
  }

  async function snapshotWorkspaceState() {
    const [members, guardians, familyLinks, classBookings, signatureRequests] =
      await Promise.all([
        prisma.member.findMany({
          where: { workspaceId },
          select: { id: true, email: true, status: true },
          orderBy: { id: "asc" },
        }),
        prisma.guardian.findMany({
          where: { workspaceId },
          select: { id: true, email: true },
          orderBy: { id: "asc" },
        }),
        prisma.familyLink.findMany({
          where: { workspaceId },
          select: { id: true, guardianId: true, childMemberId: true },
          orderBy: { id: "asc" },
        }),
        prisma.classBooking.findMany({
          where: { workspaceId },
          select: {
            id: true,
            memberId: true,
            classTemplateId: true,
            scheduledForDate: true,
            status: true,
            source: true,
          },
          orderBy: { id: "asc" },
        }),
        prisma.signatureRequest.findMany({
          where: { workspaceId },
          select: {
            id: true,
            memberId: true,
            formVersionId: true,
            status: true,
            tokenHash: true,
          },
          orderBy: { id: "asc" },
        }),
      ]);

    return {
      counts: {
        members: members.length,
        guardians: guardians.length,
        familyLinks: familyLinks.length,
        classBookings: classBookings.length,
        signatureRequests: signatureRequests.length,
      },
      members,
      guardians,
      familyLinks,
      classBookings,
      signatureRequests,
    };
  }

  function buildInput(args?: { classTemplateId?: string; email?: string }) {
    return {
      classTemplateId: args?.classTemplateId ?? templateId,
      scheduledForDate: "2026-04-07",
      fullName: "Jordan Lee",
      email: args?.email ?? "jordan@example.test",
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma, issueTrialMagicLinkRequests } = await import("@flowstate/db"));
    ({ createTrialBooking, listTrialBookingOptions } =
      await import("./trial-booking"));
  });

  beforeEach(async () => {
    await prisma.workspace.deleteMany({
      where: { id: { in: [workspaceId, foreignWorkspaceId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, foreignOwnerUserId] } },
    });
    await seedWorkspace({
      id: workspaceId,
      ownerUserId,
      ownerWorkspaceUserId,
      locationId,
      roomId,
      programId,
      templateId,
      withRequiredForm: true,
    });
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("external requests are forbidden in RP-07"));
    process.env.FORMS_MAGIC_LINK_SECRET = "rp07-local-integration-secret";
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    delete process.env.FORMS_MAGIC_LINK_SECRET;
    await prisma.workspace.deleteMany({
      where: { id: { in: [workspaceId, foreignWorkspaceId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, foreignOwnerUserId] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("commits the populated-date booking and required signature request together", async () => {
    const before = await snapshotWorkspaceState();

    const result = await createTrialBooking({
      workspaceId,
      now,
      input: buildInput(),
    });

    const after = await snapshotWorkspaceState();
    expect(before.counts).toEqual({
      members: 0,
      guardians: 0,
      familyLinks: 0,
      classBookings: 0,
      signatureRequests: 0,
    });
    expect(result).toMatchObject({
      status: "booked",
      scheduledForDate: "2026-04-07",
      forms: [{ formName: "Adult Waiver", signerKind: "MEMBER" }],
    });
    expect(after.counts).toEqual({
      members: 1,
      guardians: 0,
      familyLinks: 0,
      classBookings: 1,
      signatureRequests: 1,
    });
    expect(after.classBookings).toHaveLength(1);
    expect(after.signatureRequests).toHaveLength(1);
    expect(after.classBookings[0]?.memberId).toBe(
      after.signatureRequests[0]?.memberId,
    );
    expect(after.signatureRequests[0]?.tokenHash).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rolls back the participant and booking when issuance fails immediately after booking", async () => {
    const before = await snapshotWorkspaceState();

    const result = await createTrialBooking({
      workspaceId,
      now,
      input: buildInput(),
      issueFormRequests: async () => {
        throw new Error("injected after-booking failure");
      },
    });

    expect(result).toEqual({
      status: "error",
      message:
        "Trial booking could not be completed. No booking was saved. Try again.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rolls back the participant, booking, and created request when the signing secret is missing", async () => {
    delete process.env.FORMS_MAGIC_LINK_SECRET;
    const before = await snapshotWorkspaceState();

    const result = await createTrialBooking({
      workspaceId,
      now,
      input: buildInput(),
    });

    expect(result).toEqual({
      status: "error",
      message:
        "Trial booking could not be completed. No booking was saved. Try again.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rolls back booking and fully issued requests when a post-issuance boundary fails", async () => {
    const before = await snapshotWorkspaceState();

    const result = await createTrialBooking({
      workspaceId,
      now,
      input: buildInput(),
      issueFormRequests: async (args) => {
        await issueTrialMagicLinkRequests(args);
        throw new Error("injected after-form-issuance failure");
      },
    });

    expect(result).toEqual({
      status: "error",
      message:
        "Trial booking could not be completed. No booking was saved. Try again.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves the exact before-state for a full occurrence", async () => {
    const existingMember = await prisma.member.create({
      data: {
        workspaceId,
        fullName: "Existing Trial",
        email: "existing@example.test",
        status: "TRIAL",
        tags: [],
      },
    });
    await prisma.classTemplate.update({
      where: { id: templateId },
      data: { capacityOverride: 1 },
    });
    await prisma.classBooking.create({
      data: {
        workspaceId,
        memberId: existingMember.id,
        classTemplateId: templateId,
        scheduledForDate,
        bookingType: "TRIAL",
        status: "BOOKED",
        source: "PUBLIC_TRIAL",
      },
    });
    const before = await snapshotWorkspaceState();

    await expect(
      createTrialBooking({ workspaceId, now, input: buildInput() }),
    ).resolves.toEqual({
      status: "error",
      message: "This class is full. Choose another available trial date.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves the exact before-state for a cancelled occurrence", async () => {
    await prisma.classInstance.create({
      data: {
        workspaceId,
        classTemplateId: templateId,
        programId,
        roomId,
        coachWorkspaceUserId: ownerWorkspaceUserId,
        scheduledForDate,
        title: "Muay Thai Fundamentals",
        startTimeMinutes: 18 * 60,
        endTimeMinutes: 19 * 60,
        capacityOverride: 2,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
        status: "CANCELLED",
        cancellationReason: "Local integration fixture",
      },
    });
    const before = await snapshotWorkspaceState();

    await expect(
      createTrialBooking({ workspaceId, now, input: buildInput() }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose an available upcoming trial date.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves the exact before-state for foreign-workspace and cutoff submissions", async () => {
    await seedWorkspace({
      id: foreignWorkspaceId,
      ownerUserId: foreignOwnerUserId,
      ownerWorkspaceUserId: foreignOwnerWorkspaceUserId,
      locationId: foreignLocationId,
      roomId: foreignRoomId,
      programId: foreignProgramId,
      templateId: foreignTemplateId,
    });
    const beforeForeign = await snapshotWorkspaceState();

    await expect(
      createTrialBooking({
        workspaceId,
        now,
        input: buildInput({ classTemplateId: foreignTemplateId }),
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose an available upcoming trial date.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(beforeForeign);

    await prisma.classTemplate.update({
      where: { id: templateId },
      data: { bookingCutoffMinutes: 60 },
    });
    const beforeCutoff = await snapshotWorkspaceState();
    await expect(
      createTrialBooking({
        workspaceId,
        now: new Date("2026-04-08T00:00:00.000Z"),
        input: buildInput(),
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose an available upcoming trial date.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(beforeCutoff);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves the exact before-state for stale and duplicate submissions", async () => {
    const beforeStale = await snapshotWorkspaceState();
    await expect(
      createTrialBooking({
        workspaceId,
        now,
        input: {
          ...buildInput(),
          scheduledForDate: "2026-03-31",
        },
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose an available upcoming trial date.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(beforeStale);

    await expect(
      createTrialBooking({ workspaceId, now, input: buildInput() }),
    ).resolves.toMatchObject({ status: "booked" });
    const beforeDuplicate = await snapshotWorkspaceState();
    await expect(
      createTrialBooking({ workspaceId, now, input: buildInput() }),
    ).resolves.toEqual({
      status: "error",
      message: "This member already has a booking for that class date.",
    });
    await expect(snapshotWorkspaceState()).resolves.toEqual(beforeDuplicate);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("projects zero-date and populated-date fixtures distinctly without mutation", async () => {
    const populatedBefore = await snapshotWorkspaceState();
    const populated = await listTrialBookingOptions({ workspaceId, now });
    await expect(snapshotWorkspaceState()).resolves.toEqual(populatedBefore);
    expect(populated).toMatchObject({ status: "available" });

    await prisma.classTemplate.update({
      where: { id: templateId },
      data: { bookingCutoffMinutes: 43 * 24 * 60 },
    });
    const zeroDateBefore = await snapshotWorkspaceState();
    const zeroDate = await listTrialBookingOptions({ workspaceId, now });
    await expect(snapshotWorkspaceState()).resolves.toEqual(zeroDateBefore);
    expect(zeroDate).toEqual({
      status: "no-eligible-dates",
      workspaceId,
      workspaceName: "Flowstate Trial Gym",
      timezone: "America/Vancouver",
      activeTemplateCount: 1,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
