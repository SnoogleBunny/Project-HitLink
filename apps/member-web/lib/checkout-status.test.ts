import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@flowstate/db", () => ({
  prisma: { financialOperation: { findFirst } },
}));

import { getOwnCheckoutStatus } from "./checkout-status";

interface OperationFixture {
  id: string;
  workspaceId: string;
  userId: string | null;
  kind: string;
  status: string;
}

interface OperationFilter {
  id?: string;
  workspaceId?: string;
  kind?: string;
  payerAccount?: { userId?: string };
}

const operations: OperationFixture[] = [
  {
    id: "own-checkout",
    workspaceId: "gym-a",
    userId: "payer-a",
    kind: "CHECKOUT",
    status: "SUBMITTED",
  },
  {
    id: "other-payer",
    workspaceId: "gym-a",
    userId: "payer-b",
    kind: "CHECKOUT",
    status: "SUCCEEDED",
  },
  {
    id: "other-workspace",
    workspaceId: "gym-b",
    userId: "payer-a",
    kind: "CHECKOUT",
    status: "REVIEW_REQUIRED",
  },
  {
    id: "refund",
    workspaceId: "gym-a",
    userId: "payer-a",
    kind: "REFUND",
    status: "SUCCEEDED",
  },
  {
    id: "unassigned",
    workspaceId: "gym-a",
    userId: null,
    kind: "CHECKOUT",
    status: "RESERVED",
  },
];

describe("payer-scoped checkout recovery", () => {
  beforeEach(() => {
    findFirst.mockReset();
    // A deliberately permissive fixture store makes each missing authorization
    // predicate observable: an omitted predicate returns the forbidden record.
    findFirst.mockImplementation(
      async ({ where }: { where: OperationFilter }) => {
        const operation = operations.find(
          (record) =>
            (where.id === undefined || record.id === where.id) &&
            (where.workspaceId === undefined ||
              record.workspaceId === where.workspaceId) &&
            (where.kind === undefined || record.kind === where.kind) &&
            (where.payerAccount?.userId === undefined ||
              record.userId === where.payerAccount.userId),
        );
        return operation
          ? { id: operation.id, status: operation.status }
          : null;
      },
    );
  });

  it("returns an unresolved checkout for its signed-in payer without claiming settlement", async () => {
    await expect(
      getOwnCheckoutStatus({
        workspaceId: "gym-a",
        userId: "payer-a",
        operationId: "own-checkout",
      }),
    ).resolves.toEqual({ id: "own-checkout", status: "SUBMITTED" });
  });

  it.each([
    ["another payer's operation", "other-payer"],
    ["the payer's operation in another workspace", "other-workspace"],
    ["a refund operation instead of a checkout", "refund"],
    ["a checkout with no payer account", "unassigned"],
    ["an unknown operation", "missing"],
  ])(
    "does not expose %s through a crafted operation ID",
    async (_label, operationId) => {
      await expect(
        getOwnCheckoutStatus({
          workspaceId: "gym-a",
          userId: "payer-a",
          operationId,
        }),
      ).resolves.toBeNull();
    },
  );

  it("does not query for an empty recovery operation ID", async () => {
    await expect(
      getOwnCheckoutStatus({
        workspaceId: "gym-a",
        userId: "payer-a",
        operationId: "",
      }),
    ).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
