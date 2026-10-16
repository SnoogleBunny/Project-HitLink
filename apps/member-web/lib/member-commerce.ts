import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@flowstate/db";
export { startDropInCheckout, startPunchCardCheckout } from "./durable-checkout";

const checkoutReturnMaxAgeMs = 15 * 60 * 1000;
const checkoutReturnFutureToleranceMs = 60 * 1000;
const localCheckoutReturnKeyEnv = "FLOWSTATE_LOCAL_CHECKOUT_RETURN_KEY";

export type CheckoutReturnOutcome = "pending" | "success" | "failure";

export type CheckoutReturnState =
  | {
      status: "unverified";
    }
  | {
      status: "verified";
      outcome: CheckoutReturnOutcome;
      source: "local_fixture";
      issuedAt: Date;
    };

function isCheckoutReturnOutcome(value: string): value is CheckoutReturnOutcome {
  return value === "pending" || value === "success" || value === "failure";
}

export function verifyLocalCheckoutReturn(args: {
  checkoutReturn: string | string[] | undefined;
  workspaceId: string;
  memberId: string;
  now?: Date;
  fixtureKey?: string;
  environment?: string;
}): CheckoutReturnState {
  const fixtureKey = args.fixtureKey ?? process.env[localCheckoutReturnKeyEnv];
  const environment = args.environment ?? process.env.NODE_ENV;

  if (
    environment === "production" ||
    !fixtureKey ||
    typeof args.checkoutReturn !== "string"
  ) {
    return { status: "unverified" };
  }

  const parts = args.checkoutReturn.split(".");
  if (parts.length !== 4) {
    return { status: "unverified" };
  }

  const [version, outcome, issuedAtInput, signature] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (
    version !== "v1" ||
    !isCheckoutReturnOutcome(outcome) ||
    !/^\d+$/.test(issuedAtInput) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    return { status: "unverified" };
  }

  const issuedAtMs = Number(issuedAtInput);
  const nowMs = (args.now ?? new Date()).getTime();
  if (
    !Number.isSafeInteger(issuedAtMs) ||
    issuedAtMs <= 0 ||
    nowMs - issuedAtMs > checkoutReturnMaxAgeMs ||
    issuedAtMs - nowMs > checkoutReturnFutureToleranceMs
  ) {
    return { status: "unverified" };
  }

  const payload = `${version}.${outcome}.${issuedAtInput}`;
  const expectedSignature = createHmac("sha256", fixtureKey)
    .update(`${payload}.${args.workspaceId}.${args.memberId}`)
    .digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { status: "unverified" };
  }

  return {
    status: "verified",
    outcome,
    source: "local_fixture",
    issuedAt: new Date(issuedAtMs),
  };
}

interface PunchCardProductRecord {
  id: string;
  name: string;
  description: string | null;
  punchesIncluded: number;
  priceCents: number;
  currency: string;
  isEnabled: boolean;
  archivedAt: Date | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
  restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
  programRestrictions: Array<{
    program: {
      id: string;
      name: string;
    };
  }>;
}

interface MemberPunchCardRecord {
  id: string;
  originalPunches: number;
  remainingPunches: number;
  status: "ACTIVE" | "DEPLETED" | "ARCHIVED";
  purchasePriceCents: number;
  purchaseCurrency: string;
  purchasedAt: Date;
  punchCardProduct: {
    id: string;
    name: string;
    description: string | null;
    restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
    programRestrictions: Array<{
      program: {
        id: string;
        name: string;
      };
    }>;
  };
}

export interface MemberPunchCardSummary {
  id: string;
  name: string;
  description: string | null;
  originalPunches: number;
  remainingPunches: number;
  status: "ACTIVE" | "DEPLETED" | "ARCHIVED";
  purchasedAt: Date;
  purchasePriceCents: number;
  purchaseCurrency: string;
  restrictionSummary: string;
}

export interface PurchasablePunchCardProduct {
  id: string;
  name: string;
  description: string | null;
  punchesIncluded: number;
  priceCents: number;
  currency: string;
  restrictionSummary: string;
}

export interface MemberPunchCardPageData {
  cards: MemberPunchCardSummary[];
  availableProducts: PurchasablePunchCardProduct[];
}

interface MemberCommerceDatabase {
  punchCardProduct: { findMany(args: Record<string, unknown>): Promise<PunchCardProductRecord[]> };
  memberPunchCard: { findMany(args: Record<string, unknown>): Promise<MemberPunchCardRecord[]> };
}
const memberCommerceDatabase = prisma as unknown as MemberCommerceDatabase;
function formatRestrictionSummary(args: {
  restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
  programRestrictions: Array<{
    program: {
      name: string;
    };
  }>;
}): string {
  if (args.restrictionMode === "GENERAL") {
    return "All active programs";
  }

  return (
    args.programRestrictions.map((restriction) => restriction.program.name).join(", ") ||
    "Restricted programs"
  );
}

export async function getMemberPunchCardPageData(args: {
  workspaceId: string;
  memberId: string;
  db?: MemberCommerceDatabase;
}): Promise<MemberPunchCardPageData> {
  const db = args.db ?? memberCommerceDatabase;
  const [cards, products] = await Promise.all([
    db.memberPunchCard.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
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
    }),
    db.punchCardProduct.findMany({
      where: {
        workspaceId: args.workspaceId,
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
    }),
  ]);

  return {
    cards: cards.map((card) => ({
      id: card.id,
      name: card.punchCardProduct.name,
      description: card.punchCardProduct.description,
      originalPunches: card.originalPunches,
      remainingPunches: card.remainingPunches,
      status: card.status,
      purchasedAt: card.purchasedAt,
      purchasePriceCents: card.purchasePriceCents,
      purchaseCurrency: card.purchaseCurrency,
      restrictionSummary: formatRestrictionSummary({
        restrictionMode: card.punchCardProduct.restrictionMode,
        programRestrictions: card.punchCardProduct.programRestrictions,
      }),
    })),
    availableProducts: products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      punchesIncluded: product.punchesIncluded,
      priceCents: product.priceCents,
      currency: product.currency,
      restrictionSummary: formatRestrictionSummary({
        restrictionMode: product.restrictionMode,
        programRestrictions: product.programRestrictions,
      }),
    })),
  };
}
