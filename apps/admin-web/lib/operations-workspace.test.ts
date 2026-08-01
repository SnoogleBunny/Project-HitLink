import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionOrNullMock, redirectMock } = vi.hoisted(() => ({
  getSessionOrNullMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("./admin-access", async () => {
  const actual = await vi.importActual<typeof import("./admin-access")>(
    "./admin-access",
  );

  return {
    ...actual,
    getSessionOrNull: getSessionOrNullMock,
  };
});

import { requireOperationsWorkspaceContext } from "./operations-workspace";

const readyMigration = {
  stage: "COMPLETE",
  ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
  ownerReviewAcknowledgedByUserId: "owner_1",
  operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
  operationallyReadyByUserId: "flowstate_operator_1",
};

function buildDb() {
  return {
    workspace: {
      findUnique: vi.fn().mockResolvedValue({
        id: "workspace_1",
        name: "Sahara Muay Thai",
        businessType: "Muay Thai gym",
        status: "ACTIVE",
        location: {
          id: "location_1",
          name: "Main Gym",
          timezone: "America/Vancouver",
          addressLine1: null,
          addressLine2: null,
          city: null,
          region: null,
          postalCode: null,
          countryCode: null,
        },
        settings: {
          allowMultipleRooms: true,
        },
        migration: readyMigration,
      }),
    },
    workspaceUser: {
      findFirst: vi.fn().mockResolvedValue({
        id: "workspace_user_1",
        role: "COACH" as const,
      }),
    },
  };
}

describe("requireOperationsWorkspaceContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a coach operations context", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "coach_1",
      email: "coach@example.com",
      displayName: "Casey Coach",
      workspaceId: "workspace_1",
      role: "COACH",
    });
    const db = buildDb();

    const result = await requireOperationsWorkspaceContext({ db });

    expect(result.workspaceUserId).toBe("workspace_user_1");
    expect(result.workspaceUserRole).toBe("COACH");
    expect(result.location.timezone).toBe("America/Vancouver");
    expect(db.workspace.findUnique).toHaveBeenCalledWith({
      where: {
        id: "workspace_1",
      },
      include: {
        location: true,
        settings: true,
        migration: {
          select: {
            stage: true,
            ownerReviewAcknowledgedAt: true,
            ownerReviewAcknowledgedByUserId: true,
            operationallyReadyAt: true,
            operationallyReadyByUserId: true,
          },
        },
      },
    });
  });

  it("allows owner operations access", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "owner_1",
      email: "owner@example.com",
      displayName: "Dana Owner",
      workspaceId: "workspace_1",
      role: "OWNER",
    });
    const db = buildDb();
    db.workspaceUser.findFirst = vi.fn().mockResolvedValue({
      id: "workspace_user_owner",
      role: "OWNER",
    });

    const result = await requireOperationsWorkspaceContext({ db });

    expect(result.workspaceUserRole).toBe("OWNER");
  });

  it("redirects a pre-ready owner from operations to migration", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "owner_1",
      email: "owner@example.com",
      displayName: "Dana Owner",
      workspaceId: "workspace_1",
      role: "OWNER",
    });
    const db = buildDb();
    db.workspace.findUnique.mockResolvedValue({
      id: "workspace_1",
      name: "Sahara Muay Thai",
      businessType: "Muay Thai gym",
      status: "SETUP_INCOMPLETE",
      location: {
        id: "location_1",
        name: "Main Gym",
        timezone: "America/Vancouver",
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        countryCode: null,
      },
      settings: {
        allowMultipleRooms: true,
      },
      migration: null,
    });
    db.workspaceUser.findFirst.mockResolvedValue({
      id: "workspace_user_owner",
      role: "OWNER",
    });

    await expect(requireOperationsWorkspaceContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/migration",
    );
  });

  it("redirects a pre-ready coach from operations to unauthorized", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "coach_1",
      email: "coach@example.com",
      displayName: "Casey Coach",
      workspaceId: "workspace_1",
      role: "COACH",
    });
    const db = buildDb();
    db.workspace.findUnique.mockResolvedValue({
      id: "workspace_1",
      name: "Sahara Muay Thai",
      businessType: "Muay Thai gym",
      status: "ACTIVE",
      location: {
        id: "location_1",
        name: "Main Gym",
        timezone: "America/Vancouver",
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        countryCode: null,
      },
      settings: {
        allowMultipleRooms: true,
      },
      migration: {
        ...readyMigration,
        stage: "REVIEW_READY",
        operationallyReadyAt: null,
        operationallyReadyByUserId: null,
      },
    });

    await expect(requireOperationsWorkspaceContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });

  it("redirects customers to unauthorized", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "customer_1",
      email: "customer@example.com",
      displayName: "Chris Customer",
      workspaceId: "workspace_1",
      role: "CUSTOMER",
    });

    await expect(requireOperationsWorkspaceContext()).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });
});
