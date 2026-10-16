import { describe, expect, it, vi } from "vitest";
import {
  getMemberPunchCardPageData,
} from "./member-commerce";

type MemberCommerceTestDb = NonNullable<
  Parameters<typeof getMemberPunchCardPageData>[0]["db"]
>;

function createMockDb(): MemberCommerceTestDb {
  return {
    punchCardProduct: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "product_1",
          name: "10-class pack",
          description: "Non-expiring",
          punchesIncluded: 10,
          priceCents: 25000,
          currency: "usd",
          isEnabled: true,
          archivedAt: null,
          stripeProductId: null,
          stripePriceId: null,
          restrictionMode: "PROGRAM_RESTRICTED" as const,
          programRestrictions: [
            {
              program: {
                id: "program_1",
                name: "Muay Thai",
              },
            },
          ],
        },
      ]),
    },
    memberPunchCard: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "card_1",
          originalPunches: 10,
          remainingPunches: 6,
          status: "ACTIVE" as const,
          purchasePriceCents: 25000,
          purchaseCurrency: "usd",
          purchasedAt: new Date("2026-04-01T00:00:00.000Z"),
          punchCardProduct: {
            id: "product_1",
            name: "10-class pack",
            description: "Non-expiring",
            restrictionMode: "PROGRAM_RESTRICTED" as const,
            programRestrictions: [
              {
                program: {
                  id: "program_1",
                  name: "Muay Thai",
                },
              },
            ],
          },
        },
      ]),
    },
  };
}

describe("member commerce helpers", () => {
  it("returns only the member's punch cards plus enabled purchase options", async () => {
    const db = createMockDb();

    const result = await getMemberPunchCardPageData({
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
          include: {
            programRestrictions: {
              include: {
                program: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: {
                program: {
                  name: "asc",
                },
              },
            },
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
    expect(db.punchCardProduct.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        isEnabled: true,
        archivedAt: null,
      },
      include: {
        programRestrictions: {
          include: {
            program: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            program: {
              name: "asc",
            },
          },
        },
      },
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    });
    expect(result).toEqual({
      cards: [
        {
          id: "card_1",
          name: "10-class pack",
          description: "Non-expiring",
          originalPunches: 10,
          remainingPunches: 6,
          status: "ACTIVE",
          purchasedAt: new Date("2026-04-01T00:00:00.000Z"),
          purchasePriceCents: 25000,
          purchaseCurrency: "usd",
          restrictionSummary: "Muay Thai",
        },
      ],
      availableProducts: [
        {
          id: "product_1",
          name: "10-class pack",
          description: "Non-expiring",
          punchesIncluded: 10,
          priceCents: 25000,
          currency: "usd",
          restrictionSummary: "Muay Thai",
        },
      ],
    });
  });

});
