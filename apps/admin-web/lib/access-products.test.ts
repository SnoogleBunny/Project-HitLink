import { describe, expect, it, vi } from "vitest";
import {
  archivePunchCardProduct,
  createDropInProduct,
  createPunchCardProduct,
  grantMemberPunchCard,
  listMemberPunchCardBalances,
  togglePunchCardProduct,
} from "./access-products";

type AccessProductsTestDb = NonNullable<
  Parameters<typeof createPunchCardProduct>[0]["db"]
>;

function createMockDb(): AccessProductsTestDb {
  return {
    program: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "program_1",
          name: "Muay Thai",
        },
      ]),
    },
    punchCardProduct: {
      create: vi.fn().mockResolvedValue({
        id: "punch_card_product_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "punch_card_product_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: "punch_card_product_1",
        workspaceId: "workspace_1",
        name: "10-class pack",
        description: "Non-expiring",
        punchesIncluded: 10,
        priceCents: 25000,
        currency: "usd",
        isEnabled: false,
        archivedAt: null,
        restrictionMode: "PROGRAM_RESTRICTED" as const,
        stripeProductId: null,
        stripePriceId: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        programRestrictions: [
          {
            program: {
              id: "program_1",
              name: "Muay Thai",
            },
          },
        ],
      }),
    },
    dropInProduct: {
      create: vi.fn().mockResolvedValue({
        id: "drop_in_product_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "drop_in_product_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
      }),
    },
    memberPunchCard: {
      create: vi.fn().mockResolvedValue({
        id: "member_punch_card_1",
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "member_punch_card_1",
          originalPunches: 10,
          remainingPunches: 7,
          status: "ACTIVE" as const,
          purchasePriceCents: 25000,
          purchaseCurrency: "usd",
          purchasedAt: new Date("2026-04-02T00:00:00.000Z"),
          punchCardProduct: {
            id: "punch_card_product_1",
            name: "10-class pack",
          },
        },
      ]),
    },
    billingRecord: {
      create: vi.fn().mockResolvedValue({
        id: "billing_record_1",
      }),
    },
  };
}

describe("access product helpers", () => {
  it("creates restricted punch-card products with validated positive values", async () => {
    const db = createMockDb();

    await expect(
      createPunchCardProduct({
        workspaceId: "workspace_1",
        input: {
          name: "10-class pack",
          description: "Non-expiring",
          punchesIncluded: "10",
          priceCents: "25000",
          currency: "usd",
          programIds: ["program_1"],
        },
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      recordId: "punch_card_product_1",
    });

    expect(db.punchCardProduct.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        name: "10-class pack",
        description: "Non-expiring",
        punchesIncluded: 10,
        priceCents: 25000,
        currency: "usd",
        restrictionMode: "PROGRAM_RESTRICTED",
        programRestrictions: {
          createMany: {
            data: [
              {
                workspaceId: "workspace_1",
                programId: "program_1",
              },
            ],
          },
        },
      },
      select: {
        id: true,
      },
    });

    await expect(
      createPunchCardProduct({
        workspaceId: "workspace_1",
        input: {
          name: "Broken card",
          punchesIncluded: "0",
          priceCents: "-5",
          currency: "usd",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Included punches must be a positive whole number.",
    });
  });

  it("validates drop-in program restrictions in the same workspace", async () => {
    const db = createMockDb();
    db.program.findMany = vi.fn().mockResolvedValue([]);

    await expect(
      createDropInProduct({
        workspaceId: "workspace_1",
        input: {
          name: "Single class",
          priceCents: "3500",
          currency: "usd",
          programIds: ["foreign_program"],
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose only active programs in this workspace.",
    });
    expect(db.dropInProduct.create).not.toHaveBeenCalled();
  });

  it("toggles and archives punch-card products without deleting balances", async () => {
    const db = createMockDb();

    await expect(
      togglePunchCardProduct({
        workspaceId: "workspace_1",
        punchCardProductId: "punch_card_product_1",
        enabled: false,
        db,
      }),
    ).resolves.toEqual({
      status: "disabled",
      recordId: "punch_card_product_1",
    });

    expect(db.punchCardProduct.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "punch_card_product_1",
        workspaceId: "workspace_1",
        archivedAt: null,
      },
      data: {
        isEnabled: false,
      },
    });

    await archivePunchCardProduct({
      workspaceId: "workspace_1",
      punchCardProductId: "punch_card_product_1",
      db,
    });

    expect(db.punchCardProduct.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "punch_card_product_1",
        workspaceId: "workspace_1",
        archivedAt: null,
      },
      data: {
        archivedAt: expect.any(Date),
        isEnabled: false,
      },
    });
  });

  it("grants non-archived punch cards and lists member-only balances", async () => {
    const db = createMockDb();

    await expect(
      grantMemberPunchCard({
        workspaceId: "workspace_1",
        memberId: "member_1",
        punchCardProductId: "punch_card_product_1",
        db,
      }),
    ).resolves.toEqual({
      status: "granted",
      recordId: "member_punch_card_1",
    });

    expect(db.memberPunchCard.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        memberId: "member_1",
        punchCardProductId: "punch_card_product_1",
        originalPunches: 10,
        remainingPunches: 10,
        status: "ACTIVE",
        purchasePriceCents: 25000,
        purchaseCurrency: "usd",
        purchasedAt: expect.any(Date),
      },
      select: {
        id: true,
      },
    });
    expect(db.billingRecord.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        memberId: "member_1",
        type: "PUNCH_CARD_GRANTED",
        status: "INFO",
        amountCents: 25000,
        currency: "usd",
      },
      select: {
        id: true,
      },
    });

    const balances = await listMemberPunchCardBalances({
      workspaceId: "workspace_1",
      memberId: "member_1",
      db,
    });

    expect(db.memberPunchCard.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        memberId: "member_1",
      },
      include: {
        punchCardProduct: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        {
          purchasedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });
    expect(balances).toEqual([
      {
        id: "member_punch_card_1",
        name: "10-class pack",
        originalPunches: 10,
        remainingPunches: 7,
        status: "ACTIVE",
        purchasedAt: new Date("2026-04-02T00:00:00.000Z"),
        purchasePriceCents: 25000,
        purchaseCurrency: "usd",
      },
    ]);
  });
});
