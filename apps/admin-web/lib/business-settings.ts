import {
  Prisma,
  prisma,
  lockClassSchedule,
  lockStaffAuthorityTx,
} from "@flowstate/db";

export class BusinessSettingsError extends Error {}
export interface BusinessSettingsInput {
  name: string;
  businessType: string;
  contactEmail: string;
  contactPhone: string;
  currency: string;
  locale: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
}

export function parseBusinessSettings(input: BusinessSettingsInput) {
  const clean = (
    value: string,
    label: string,
    limit: number,
    required = false,
  ) => {
    const result = value.trim();
    if (
      (required && !result) ||
      result.length > limit ||
      Array.from(result).some((character) => character.charCodeAt(0) < 32)
    )
      throw new BusinessSettingsError(
        `Enter ${label.toLowerCase()} using ${limit} characters or fewer.`,
      );
    return result;
  };
  const name = clean(input.name, "Business name", 120, true);
  const contactEmail = clean(
    input.contactEmail,
    "Contact email",
    254,
  ).toLowerCase();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    throw new BusinessSettingsError("Enter a valid contact email.");
  const currency = input.currency.trim().toLowerCase();
  if (
    !["cad", "usd", "gbp", "eur", "aud", "nzd", "jpy", "krw"].includes(currency)
  )
    throw new BusinessSettingsError("Choose a supported business currency.");
  let locale: string;
  try {
    locale = Intl.getCanonicalLocales(input.locale.trim())[0] ?? "";
    if (!locale || !Intl.DateTimeFormat.supportedLocalesOf([locale]).length)
      throw new Error();
  } catch {
    throw new BusinessSettingsError(
      "Enter a supported locale, such as en-CA or en-US.",
    );
  }
  const countryCode = input.countryCode.trim().toUpperCase();
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode))
    throw new BusinessSettingsError(
      "Use a two-letter country code, or leave the address blank for a virtual business.",
    );
  return {
    name,
    businessType: clean(input.businessType, "Business type", 80),
    contactEmail,
    contactPhone: clean(input.contactPhone, "Contact phone", 40),
    currency,
    locale,
    addressLine1: clean(input.addressLine1, "Address", 200),
    addressLine2: clean(input.addressLine2, "Address line 2", 200),
    city: clean(input.city, "City", 100),
    region: clean(input.region, "Region", 100),
    postalCode: clean(input.postalCode, "Postal code", 24),
    countryCode,
  };
}

async function financialCurrencies(
  db: Prisma.TransactionClient,
  workspaceId: string,
) {
  const records = await Promise.all([
    db.invoice.groupBy({ by: ["currency"], where: { workspaceId } }),
    db.payment.groupBy({ by: ["currency"], where: { workspaceId } }),
    db.refund.groupBy({ by: ["currency"], where: { workspaceId } }),
    db.accountCredit.groupBy({ by: ["currency"], where: { workspaceId } }),
    db.financialOperation.groupBy({ by: ["currency"], where: { workspaceId } }),
  ]);
  return [
    ...new Set(
      records
        .flat()
        .map((row) => row.currency?.toLowerCase())
        .filter((value): value is string => !!value),
    ),
  ].sort();
}

async function retryBusinessSettingsTransaction<T>(
  work: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 3
      )
        throw error;
    }
  }
}

export async function getBusinessSettings(actor: {
  workspaceId: string;
  userId: string;
}) {
  return prisma.$transaction(async (db) => {
    if (
      !(await db.workspaceUser.findFirst({
        where: {
          ...actor,
          role: "OWNER",
          isActive: true,
          workspace: { status: { not: "DISABLED" } },
        },
        select: { id: true },
      }))
    )
      throw new BusinessSettingsError(
        "Only the owner can manage business settings.",
      );
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: actor.workspaceId },
      include: { settings: true, location: true },
    });
    return {
      workspace,
      financialCurrencies: await financialCurrencies(db, actor.workspaceId),
    };
  });
}

export async function saveBusinessSettings(
  actor: { workspaceId: string; userId: string },
  expectedVersion: number,
  input: BusinessSettingsInput,
) {
  const next = parseBusinessSettings(input);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    throw new BusinessSettingsError("Reload business settings before saving.");
  return retryBusinessSettingsTransaction(() =>
    prisma.$transaction(
      async (db) => {
        await lockClassSchedule(db, actor.workspaceId);
        await lockStaffAuthorityTx(db, actor);
        const owner = await db.workspaceUser.findFirst({
          where: {
            ...actor,
            role: "OWNER",
            isActive: true,
            workspace: { status: { not: "DISABLED" } },
          },
          select: { id: true },
        });
        if (!owner)
          throw new BusinessSettingsError(
            "Only the owner can manage business settings.",
          );
        const previous = await db.workspace.findUniqueOrThrow({
          where: { id: actor.workspaceId },
          include: { settings: true, location: true },
        });
        if ((previous.settings?.identityVersion ?? 0) !== expectedVersion)
          throw new BusinessSettingsError(
            "These settings changed. Reload them before saving.",
          );
        if (!previous.location)
          throw new BusinessSettingsError(
            "Complete business setup before editing these settings.",
          );
        const currencies = await financialCurrencies(db, actor.workspaceId);
        if (
          currencies.length &&
          (previous.settings?.currency
            ? next.currency !== previous.settings.currency
            : currencies.length !== 1 || currencies[0] !== next.currency)
        )
          throw new BusinessSettingsError(
            "Currency is locked after financial activity. Existing financial records must keep their original currency.",
          );
        await db.workspace.update({
          where: { id: actor.workspaceId },
          data: { name: next.name, businessType: next.businessType || null },
        });
        await db.location.update({
          where: { id: previous.location.id },
          data: {
            name: next.name,
            addressLine1: next.addressLine1 || null,
            addressLine2: next.addressLine2 || null,
            city: next.city || null,
            region: next.region || null,
            postalCode: next.postalCode || null,
            countryCode: next.countryCode || null,
          },
        });
        await db.workspaceSetting.upsert({
          where: { workspaceId: actor.workspaceId },
          create: {
            workspaceId: actor.workspaceId,
            contactEmail: next.contactEmail || null,
            contactPhone: next.contactPhone || null,
            currency: next.currency,
            locale: next.locale,
            identityVersion: 1,
          },
          update: {
            contactEmail: next.contactEmail || null,
            contactPhone: next.contactPhone || null,
            currency: next.currency,
            locale: next.locale,
            identityVersion: { increment: 1 },
          },
        });
        await db.workspaceDataEvent.create({
          data: {
            workspaceId: actor.workspaceId,
            actorUserId: actor.userId,
            kind: "BUSINESS_SETTINGS_CHANGED",
            metadata: {
              version: expectedVersion + 1,
              before: {
                name: previous.name,
                businessType: previous.businessType,
                contactEmail: previous.settings?.contactEmail ?? null,
                contactPhone: previous.settings?.contactPhone ?? null,
                currency: previous.settings?.currency ?? null,
                locale: previous.settings?.locale ?? null,
                addressLine1: previous.location.addressLine1,
                addressLine2: previous.location.addressLine2,
                city: previous.location.city,
                region: previous.location.region,
                postalCode: previous.location.postalCode,
                countryCode: previous.location.countryCode,
              },
              after: next,
            },
          },
        });
        return { version: expectedVersion + 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
