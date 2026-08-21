import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma, type StripeConnectionStatus } from "@flowstate/db";
import Stripe from "stripe";

const checkoutExpirationSeconds = 15 * 60;
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

interface WorkspaceStripeSettingsRecord {
  stripeAccountId: string | null;
  connectionStatus: StripeConnectionStatus;
  chargesEnabled: boolean;
}

interface MemberRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
}

interface PreviousCustomerRecord {
  stripeCustomerId: string | null;
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

interface DropInBookingRecord {
  id: string;
  memberId: string;
  bookingType: "DROP_IN";
  status: "PENDING_PAYMENT" | "BOOKED" | "CANCELLED";
  dropInProductId: string | null;
  dropInPriceCents: number | null;
  dropInCurrency: string | null;
  classTemplate: {
    title: string | null;
    program: {
      name: string;
    };
  };
  dropInProduct: {
    id: string;
    name: string;
    stripeProductId: string | null;
    stripePriceId: string | null;
  } | null;
}

interface MemberCommerceDatabase {
  workspaceStripeSettings: {
    findUnique(args: Record<string, unknown>): Promise<WorkspaceStripeSettingsRecord | null>;
  };
  member: {
    findFirst(args: Record<string, unknown>): Promise<MemberRecord | null>;
  };
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<PreviousCustomerRecord | null>;
  };
  punchCardProduct: {
    findMany(args: Record<string, unknown>): Promise<PunchCardProductRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<PunchCardProductRecord | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  memberPunchCard: {
    findMany(args: Record<string, unknown>): Promise<MemberPunchCardRecord[]>;
  };
  classBooking: {
    findFirst(args: Record<string, unknown>): Promise<DropInBookingRecord | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
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

interface StripeCheckoutClient {
  ensureCustomer(args: {
    stripeAccountId: string;
    workspaceId: string;
    memberId: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    existingStripeCustomerId?: string | null;
  }): Promise<{
    stripeCustomerId: string;
  }>;
  ensureOneTimePrice(args: {
    stripeAccountId: string;
    workspaceId: string;
    recordId: string;
    name: string;
    priceCents: number;
    currency: string;
    existingStripeProductId?: string | null;
    existingStripePriceId?: string | null;
    metadataKey: "punchCardProductId" | "dropInProductId";
  }): Promise<{
    stripeProductId: string;
    stripePriceId: string;
  }>;
  createCheckoutSession(args: {
    stripeAccountId: string;
    stripeCustomerId: string;
    stripePriceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    expiresAt?: number;
  }): Promise<{
    id: string;
    url: string;
    expiresAt: Date | null;
  }>;
}

const memberCommerceDatabase = prisma as unknown as MemberCommerceDatabase;

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);

  return stripeClient;
}

function isStripeReady(settings: WorkspaceStripeSettingsRecord | null): settings is WorkspaceStripeSettingsRecord & {
  stripeAccountId: string;
} {
  return Boolean(
    settings?.stripeAccountId &&
      settings.connectionStatus === "ACTIVE" &&
      settings.chargesEnabled,
  );
}

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

function getCheckoutExpiresAt(now: Date): number {
  return Math.floor(now.getTime() / 1000) + checkoutExpirationSeconds;
}

export const memberCheckoutStripeClient: StripeCheckoutClient = {
  async ensureCustomer(args) {
    if (args.existingStripeCustomerId) {
      return {
        stripeCustomerId: args.existingStripeCustomerId,
      };
    }

    const customer = await getStripeClient().customers.create(
      {
        name: args.fullName,
        email: args.email ?? undefined,
        phone: args.phone ?? undefined,
        metadata: {
          workspaceId: args.workspaceId,
          memberId: args.memberId,
        },
      },
      {
        stripeAccount: args.stripeAccountId,
      },
    );

    return {
      stripeCustomerId: customer.id,
    };
  },

  async ensureOneTimePrice(args) {
    if (args.existingStripeProductId && args.existingStripePriceId) {
      return {
        stripeProductId: args.existingStripeProductId,
        stripePriceId: args.existingStripePriceId,
      };
    }

    const stripe = getStripeClient();
    const requestOptions = {
      stripeAccount: args.stripeAccountId,
    };
    const product =
      args.existingStripeProductId ??
      (
        await stripe.products.create(
          {
            name: args.name,
            metadata: {
              workspaceId: args.workspaceId,
              [args.metadataKey]: args.recordId,
            },
          },
          requestOptions,
        )
      ).id;
    const price = await stripe.prices.create(
      {
        currency: args.currency,
        product,
        unit_amount: args.priceCents,
        metadata: {
          workspaceId: args.workspaceId,
          [args.metadataKey]: args.recordId,
        },
      },
      requestOptions,
    );

    return {
      stripeProductId: product,
      stripePriceId: price.id,
    };
  },

  async createCheckoutSession(args) {
    const session = await getStripeClient().checkout.sessions.create(
      {
        mode: "payment",
        customer: args.stripeCustomerId,
        line_items: [
          {
            price: args.stripePriceId,
            quantity: 1,
          },
        ],
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        metadata: args.metadata,
        expires_at: args.expiresAt,
      },
      {
        stripeAccount: args.stripeAccountId,
      },
    );

    return {
      id: session.id,
      url: session.url ?? "",
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    };
  },
};

async function getStripeCheckoutContext(args: {
  workspaceId: string;
  memberId: string;
  db: MemberCommerceDatabase;
}): Promise<
  | {
      status: "ok";
      member: MemberRecord;
      settings: WorkspaceStripeSettingsRecord & {
        stripeAccountId: string;
      };
      existingStripeCustomerId: string | null;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const [member, settings, previousCustomer] = await Promise.all([
    args.db.member.findFirst({
      where: {
        id: args.memberId,
        workspaceId: args.workspaceId,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
      },
    }),
    args.db.workspaceStripeSettings.findUnique({
      where: {
        workspaceId: args.workspaceId,
      },
      select: {
        stripeAccountId: true,
        connectionStatus: true,
        chargesEnabled: true,
      },
    }),
    args.db.memberMembership.findFirst({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        stripeCustomerId: {
          not: null,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        stripeCustomerId: true,
      },
    }),
  ]);

  if (!member) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  if (!isStripeReady(settings)) {
    return {
      status: "error",
      message: "Online payments are not connected for this gym yet.",
    };
  }

  return {
    status: "ok",
    member,
    settings,
    existingStripeCustomerId: previousCustomer?.stripeCustomerId ?? null,
  };
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

export async function startPunchCardCheckout(args: {
  workspaceId: string;
  memberId: string;
  punchCardProductId: string;
  successUrl: string;
  cancelUrl: string;
  db?: MemberCommerceDatabase;
  stripe?: StripeCheckoutClient;
  now?: Date;
}): Promise<
  | {
      status: "ok";
      url: string;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const db = args.db ?? memberCommerceDatabase;
  const stripe = args.stripe ?? memberCheckoutStripeClient;
  const now = args.now ?? new Date();
  const [checkoutContext, product] = await Promise.all([
    getStripeCheckoutContext({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      db,
    }),
    db.punchCardProduct.findFirst({
      where: {
        id: args.punchCardProductId,
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
        },
      },
    }),
  ]);

  if (checkoutContext.status === "error") {
    return checkoutContext;
  }

  if (!product) {
    return {
      status: "error",
      message: "Punch card product not found.",
    };
  }

  const customer = await stripe.ensureCustomer({
    stripeAccountId: checkoutContext.settings.stripeAccountId,
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    fullName: checkoutContext.member.fullName,
    email: checkoutContext.member.email,
    phone: checkoutContext.member.phone,
    existingStripeCustomerId: checkoutContext.existingStripeCustomerId,
  });
  const price = await stripe.ensureOneTimePrice({
    stripeAccountId: checkoutContext.settings.stripeAccountId,
    workspaceId: args.workspaceId,
    recordId: product.id,
    name: product.name,
    priceCents: product.priceCents,
    currency: product.currency,
    existingStripeProductId: product.stripeProductId,
    existingStripePriceId: product.stripePriceId,
    metadataKey: "punchCardProductId",
  });

  await db.punchCardProduct.updateMany({
    where: {
      id: product.id,
      workspaceId: args.workspaceId,
    },
    data: {
      stripeProductId: price.stripeProductId,
      stripePriceId: price.stripePriceId,
    },
  });

  const session = await stripe.createCheckoutSession({
    stripeAccountId: checkoutContext.settings.stripeAccountId,
    stripeCustomerId: customer.stripeCustomerId,
    stripePriceId: price.stripePriceId,
    successUrl: args.successUrl,
    cancelUrl: args.cancelUrl,
    expiresAt: getCheckoutExpiresAt(now),
    metadata: {
      checkoutType: "punch_card_purchase",
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      punchCardProductId: product.id,
      punchesIncluded: String(product.punchesIncluded),
      priceCents: String(product.priceCents),
      currency: product.currency,
    },
  });

  if (!session.url) {
    return {
      status: "error",
      message: "Checkout session could not be created.",
    };
  }

  return {
    status: "ok",
    url: session.url,
  };
}

export async function startDropInCheckout(args: {
  workspaceId: string;
  memberId: string;
  bookingId: string;
  successUrl: string;
  cancelUrl: string;
  db?: MemberCommerceDatabase;
  stripe?: StripeCheckoutClient;
  now?: Date;
}): Promise<
  | {
      status: "ok";
      url: string;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const db = args.db ?? memberCommerceDatabase;
  const stripe = args.stripe ?? memberCheckoutStripeClient;
  const now = args.now ?? new Date();
  const [checkoutContext, booking] = await Promise.all([
    getStripeCheckoutContext({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      db,
    }),
    db.classBooking.findFirst({
      where: {
        id: args.bookingId,
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        bookingType: "DROP_IN",
        status: "PENDING_PAYMENT",
      },
      include: {
        classTemplate: {
          include: {
            program: {
              select: {
                name: true,
              },
            },
          },
        },
        dropInProduct: {
          select: {
            id: true,
            name: true,
            stripeProductId: true,
            stripePriceId: true,
          },
        },
      },
    }),
  ]);

  if (checkoutContext.status === "error") {
    return checkoutContext;
  }

  if (
    !booking ||
    !booking.dropInProduct ||
    booking.dropInPriceCents === null ||
    !booking.dropInCurrency
  ) {
    return {
      status: "error",
      message: "Drop-in booking is not ready for checkout.",
    };
  }

  try {
    const customer = await stripe.ensureCustomer({
      stripeAccountId: checkoutContext.settings.stripeAccountId,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      fullName: checkoutContext.member.fullName,
      email: checkoutContext.member.email,
      phone: checkoutContext.member.phone,
      existingStripeCustomerId: checkoutContext.existingStripeCustomerId,
    });
    const price = await stripe.ensureOneTimePrice({
      stripeAccountId: checkoutContext.settings.stripeAccountId,
      workspaceId: args.workspaceId,
      recordId: booking.dropInProduct.id,
      name: booking.dropInProduct.name,
      priceCents: booking.dropInPriceCents,
      currency: booking.dropInCurrency,
      existingStripeProductId: booking.dropInProduct.stripeProductId,
      existingStripePriceId: booking.dropInProduct.stripePriceId,
      metadataKey: "dropInProductId",
    });

    const session = await stripe.createCheckoutSession({
      stripeAccountId: checkoutContext.settings.stripeAccountId,
      stripeCustomerId: customer.stripeCustomerId,
      stripePriceId: price.stripePriceId,
      successUrl: args.successUrl,
      cancelUrl: args.cancelUrl,
      expiresAt: getCheckoutExpiresAt(now),
      metadata: {
        checkoutType: "drop_in_booking",
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        bookingId: booking.id,
        dropInProductId: booking.dropInProduct.id,
      },
    });

    await db.classBooking.updateMany({
      where: {
        id: booking.id,
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        status: "PENDING_PAYMENT",
      },
      data: {
        dropInCheckoutSessionId: session.id,
        pendingPaymentExpiresAt: session.expiresAt,
      },
    });

    return {
      status: "ok",
      url: session.url,
    };
  } catch (error) {
    await db.classBooking.updateMany({
      where: {
        id: booking.id,
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        status: "PENDING_PAYMENT",
      },
      data: {
        status: "CANCELLED",
        pendingPaymentExpiresAt: null,
      },
    });

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Drop-in checkout could not be started.",
    };
  }
}
