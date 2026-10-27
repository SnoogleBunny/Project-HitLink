import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  context: vi.fn(),
  command: vi.fn(),
  confirmReceipt: vi.fn(),
  checkPayment: vi.fn(),
  startPayment: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@flowstate/db", () => ({
  CoachingError: class CoachingError extends Error {},
  runCoachingCommand: mock.command,
  confirmCoachingExportReceipt: mock.confirmReceipt,
}));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("../../../lib/member-auth", () => ({
  requireMemberPortalContext: mock.context,
}));
vi.mock("../../../lib/coaching-payments", () => ({
  checkCoachingPayment: mock.checkPayment,
  startCoachingPayment: mock.startPayment,
}));
import { CoachingError } from "@flowstate/db";
import { coachingAction } from "./actions";
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    enrollmentId: "enrollment",
    kind: "bookAppointment",
    operationId: "operation",
    expectedVersion: "2",
    ...values,
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.context.mockResolvedValue({
    workspace: { id: "gym" },
    session: { userId: "adult-account" },
    member: { id: "selected-child" },
  });
  mock.command.mockResolvedValue({ id: "enrollment" });
  mock.checkPayment.mockResolvedValue("PENDING");
});
describe("account-scoped coaching action returns", () => {
  it("returns a booking to appointments and uses the account actor rather than the selected child", async () => {
    await expect(
      coachingAction(form({ workspaceId: "foreign", userId: "child" })),
    ).rejects.toThrow(
      "REDIRECT:/app/coaching/enrollment?view=appointments&saved=1",
    );
    expect(mock.context).toHaveBeenCalledWith({ scope: "account" });
    expect(mock.command).toHaveBeenCalledWith(
      { workspaceId: "gym", userId: "adult-account" },
      expect.objectContaining({
        kind: "bookAppointment",
        enrollmentId: "enrollment",
      }),
    );
  });
  it("keeps an unsuccessful move in the appointment view with the original outcome", async () => {
    mock.command.mockRejectedValue(
      new CoachingError(
        "That time was taken. Your current appointment is unchanged.",
      ),
    );
    await expect(
      coachingAction(
        form({ kind: "moveAppointment", returnView: "appointments" }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/app/coaching/enrollment?view=appointments&error=That+time+was+taken.+Your+current+appointment+is+unchanged.",
    );
  });
  it("keeps pending payment recovery in My program instead of reporting success", async () => {
    await expect(
      coachingAction(form({ kind: "checkPayment", returnView: "program" })),
    ).rejects.toThrow(
      "REDIRECT:/app/coaching/enrollment?view=program&payment=pending",
    );
    expect(mock.command).not.toHaveBeenCalled();
  });
  it("restricts return views and encodes crafted enrollment IDs", async () => {
    await expect(
      coachingAction(
        form({
          enrollmentId: "id/../../?x=1",
          kind: "acceptPlan",
          returnView: "https://outside.example",
          returnUrl: "https://outside.example",
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/app/coaching/id%2F..%2F..%2F%3Fx%3D1?view=notes&saved=1",
    );
  });
  it("preserves a payer's own request route without taking an arbitrary redirect", async () => {
    await expect(
      coachingAction(
        form({
          kind: "checkPayment",
          returnPayerGrantId: "grant/one?x=1",
          returnView: "appointments",
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/app/coaching/payments/grant%2Fone%3Fx%3D1?payment=pending",
    );
  });
  it("requires archive review before confirming a receipt and stays in My program", async () => {
    await expect(
      coachingAction(
        form({ kind: "confirmExportReceipt", returnView: "program" }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/app/coaching/enrollment?view=program&error=Check+your+downloaded+archive+before+confirming+receipt.",
    );
    expect(mock.confirmReceipt).not.toHaveBeenCalled();
  });
});
