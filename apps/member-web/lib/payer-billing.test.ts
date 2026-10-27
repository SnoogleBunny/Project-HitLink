import { describe, expect, it, vi } from "vitest";

vi.mock("@flowstate/db", () => ({ prisma: {} }));
import { getPayerBillingData } from "./payer-billing";

type BillingDatabase = NonNullable<
  Parameters<typeof getPayerBillingData>[0]["db"]
>;

function createDatabase({
  hasAccount = true,
  operations = [],
  credits = [],
}: {
  hasAccount?: boolean;
  operations?: Array<{
    id: string;
    kind: string;
    targetId: string;
    amountCents: number | null;
  }>;
  credits?: Array<{
    id: string;
    remainingAmountCents: number;
    currency: string;
  }>;
} = {}) {
  const financialAccount = {
    findFirst: vi
      .fn()
      .mockResolvedValue(hasAccount ? { id: "payer-account" } : null),
  };
  const financialOperation = {
    findMany: vi
      .fn()
      .mockImplementation(async ({ where }: { where: { kind?: unknown } }) =>
        where.kind ? [] : operations,
      ),
  };
  const invoice = { findMany: vi.fn().mockResolvedValue([]) };
  const payment = { findMany: vi.fn().mockResolvedValue([]) };
  const accountCredit = { findMany: vi.fn().mockResolvedValue(credits) };
  return {
    db: {
      financialAccount,
      financialOperation,
      invoice,
      payment,
      accountCredit,
    } as unknown as BillingDatabase,
    financialAccount,
    financialOperation,
    invoice,
    payment,
    accountCredit,
  };
}

const payer = {
  workspaceId: "gym-a",
  userId: "payer-a",
  payerMemberId: "adult-a",
};

describe("payer billing credit availability", () => {
  it("does not read financial records when the signed-in payer has no matching account", async () => {
    const fixture = createDatabase({ hasAccount: false });
    await expect(
      getPayerBillingData({ ...payer, db: fixture.db }),
    ).resolves.toEqual({
      operations: [],
      invoices: [],
      payments: [],
      credits: [],
      creditHistory: [],
    });
    for (const table of [
      fixture.financialOperation,
      fixture.invoice,
      fixture.payment,
      fixture.accountCredit,
    ]) {
      expect(table.findMany).not.toHaveBeenCalled();
    }
  });

  it("keeps unsettled credit reservations unavailable without treating other money operations as reservations", async () => {
    const operations = [
      {
        id: "reserved",
        kind: "APPLY_CREDIT",
        targetId: "credit-a",
        amountCents: 200,
      },
      {
        id: "submitted",
        kind: "APPLY_CREDIT",
        targetId: "credit-a",
        amountCents: 150,
      },
      {
        id: "under-review",
        kind: "APPLY_CREDIT",
        targetId: "credit-a",
        amountCents: 100,
      },
      {
        id: "no-amount",
        kind: "APPLY_CREDIT",
        targetId: "credit-a",
        amountCents: null,
      },
      {
        id: "another-credit",
        kind: "APPLY_CREDIT",
        targetId: "credit-b",
        amountCents: 125,
      },
      { id: "refund", kind: "REFUND", targetId: "credit-a", amountCents: 300 },
      {
        id: "issued",
        kind: "ISSUE_CREDIT",
        targetId: "credit-a",
        amountCents: 500,
      },
    ];
    const fixture = createDatabase({
      operations,
      credits: [
        { id: "credit-a", remainingAmountCents: 1000, currency: "cad" },
        { id: "credit-b", remainingAmountCents: 400, currency: "cad" },
      ],
    });
    const result = await getPayerBillingData({ ...payer, db: fixture.db });
    expect(result.credits).toEqual([
      {
        id: "credit-a",
        remainingAmountCents: 1000,
        currency: "cad",
        reservedCents: 450,
        availableCents: 550,
      },
      {
        id: "credit-b",
        remainingAmountCents: 400,
        currency: "cad",
        reservedCents: 125,
        availableCents: 275,
      },
    ]);
    expect(result.operations).toEqual(operations);
  });

  it("never advertises negative available credit when a held amount exceeds the current balance", async () => {
    const fixture = createDatabase({
      operations: [
        {
          id: "held",
          kind: "APPLY_CREDIT",
          targetId: "credit-a",
          amountCents: 150,
        },
      ],
      credits: [{ id: "credit-a", remainingAmountCents: 100, currency: "usd" }],
    });
    const result = await getPayerBillingData({ ...payer, db: fixture.db });
    expect(result.credits[0]).toMatchObject({
      remainingAmountCents: 100,
      reservedCents: 150,
      availableCents: 0,
    });
  });

  it("looks up the signed-in account with both its workspace and payer member identity", async () => {
    const fixture = createDatabase();
    await getPayerBillingData({ ...payer, db: fixture.db });
    const accountLookup = fixture.financialAccount.findFirst.mock.calls[0]?.[0];
    expect(accountLookup.where).toEqual({
      workspaceId: "gym-a",
      userId: "payer-a",
      memberId: "adult-a",
    });
    for (const table of [
      fixture.financialOperation,
      fixture.invoice,
      fixture.payment,
      fixture.accountCredit,
    ]) {
      for (const [query] of table.findMany.mock.calls) {
        expect(query.where).toMatchObject({
          workspaceId: "gym-a",
          payerAccountId: "payer-account",
        });
      }
    }
  });
});
