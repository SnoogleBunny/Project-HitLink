import { describe, expect, it, vi } from "vitest";
import {
  archiveMembershipPlan,
  createMembershipPlan,
  updateMembershipPlan,
} from "./membership-plans";

type MembershipPlanTestDb = NonNullable<
  Parameters<typeof createMembershipPlan>[0]["db"]
>;

function createMockDb(): MembershipPlanTestDb {
  return {
    program: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "program_1",
          name: "Muay Thai",
        },
      ]),
    },
    membershipPlan: {
      create: vi.fn().mockResolvedValue({
        id: "plan_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "plan_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

describe("membership plan helpers", () => {
  it("creates a monthly plan with sanitized fields and program restrictions", async () => {
    const db = createMockDb();
    const created = {
      data: null as Record<string, unknown> | null,
    };

    db.membershipPlan.create = vi.fn(async ({ data }) => {
      created.data = data as Record<string, unknown>;

      return {
        id: "plan_1",
      };
    });

    await expect(
      createMembershipPlan({
        workspaceId: "workspace_1",
        input: {
          name: "  Unlimited Monthly ",
          description: "  Best for regulars ",
          monthlyPriceCents: "12900",
          currency: "CAD",
          cancellationPolicyReference: "  End of cycle ",
          freezePolicyReference: " Owner approval ",
          programIds: ["program_1", "program_1", ""],
        },
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      membershipPlanId: "plan_1",
    });

    expect(created.data).toEqual({
      workspaceId: "workspace_1",
      name: "Unlimited Monthly",
      description: "Best for regulars",
      monthlyPriceCents: 12900,
      currency: "cad",
      cancellationPolicyReference: "End of cycle",
      freezePolicyReference: "Owner approval",
      programRestrictions: {
        create: [
          {
            workspaceId: "workspace_1",
            programId: "program_1",
          },
        ],
      },
    });
  });

  it("rejects invalid price and invalid program restrictions", async () => {
    const db = createMockDb();

    await expect(
      createMembershipPlan({
        workspaceId: "workspace_1",
        input: {
          name: "Unlimited",
          monthlyPriceCents: "12.99",
          programIds: [],
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Monthly price must be a positive whole number of cents.",
    });

    db.program.findMany = vi.fn().mockResolvedValue([]);

    await expect(
      createMembershipPlan({
        workspaceId: "workspace_1",
        input: {
          name: "Unlimited",
          monthlyPriceCents: "12900",
          programIds: ["program_foreign"],
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose only active programs in this workspace.",
    });
  });

  it("blocks price changes after a Stripe price exists", async () => {
    const db = createMockDb();
    db.membershipPlan.findFirst = vi.fn().mockResolvedValue({
      id: "plan_1",
      workspaceId: "workspace_1",
      name: "Unlimited",
      description: null,
      monthlyPriceCents: 12900,
      currency: "usd",
      cancellationPolicyReference: null,
      freezePolicyReference: null,
      stripeProductId: "prod_1",
      stripePriceId: "price_1",
      archivedAt: null,
      createdAt: new Date("2026-04-08T00:00:00.000Z"),
      updatedAt: new Date("2026-04-08T00:00:00.000Z"),
      programRestrictions: [],
    });

    await expect(
      updateMembershipPlan({
        workspaceId: "workspace_1",
        membershipPlanId: "plan_1",
        input: {
          name: "Unlimited",
          monthlyPriceCents: "14900",
          currency: "usd",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Plans already synced to Stripe cannot change price or currency. Archive this plan and create a new one.",
    });

    expect(db.membershipPlan.update).not.toHaveBeenCalled();
  });

  it("archives plans inside the workspace", async () => {
    const db = createMockDb();

    await expect(
      archiveMembershipPlan({
        workspaceId: "workspace_1",
        membershipPlanId: "plan_1",
        db,
      }),
    ).resolves.toEqual({
      status: "archived",
      membershipPlanId: "plan_1",
    });

    expect(db.membershipPlan.updateMany).toHaveBeenCalledWith({
      where: {
        id: "plan_1",
        workspaceId: "workspace_1",
      },
      data: {
        archivedAt: expect.any(Date),
      },
    });
  });
});

