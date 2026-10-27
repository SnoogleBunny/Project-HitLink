import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CoachingBookingPolicyError,
  coachingBookingWeekdays,
  type CoachingBookingPolicy,
} from "../../../../../../packages/db/src/coaching-booking-policy";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: mocks.context,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@flowstate/db", async () => ({
  ...(await import("../../../../../../packages/db/src/coaching-booking-policy")),
  previewCoachingBookingPolicy: mocks.preview,
  confirmCoachingBookingPolicy: mocks.confirm,
}));

import {
  updateCoachingBookingPolicyAction,
  type CoachingBookingPolicyRequest,
  type CoachingBookingRulesState,
} from "./actions";

const operationId = "owner-request-00000001";
const previewHash = "a".repeat(64);
const initialState: CoachingBookingRulesState = {
  status: "idle",
  baseVersion: 2,
  operationId,
  confirmedVersion: null,
  message: null,
  review: null,
  request: null,
  confirmedPolicy: null,
};
function policy(): CoachingBookingPolicy {
  return {
    schemaVersion: 1,
    appointments: {
      weeklyHours: coachingBookingWeekdays.map((weekday) => ({
        weekday,
        intervals: weekday === "MONDAY"
          ? [{ startMinute: 540, endMinute: 720 }, { startMinute: 780, endMinute: 1020 }]
          : [],
      })),
      maxAdvanceMinutes: 10080,
      minimumLeadMinutes: 60,
      minimumBufferMinutes: 15,
      resolutionResponseHours: 24,
    },
  };
}
function form(intent = "PREVIEW") {
  const data = new FormData();
  data.set("intent", intent);
  data.set("policy", JSON.stringify(policy()));
  data.set("expectedVersion", "2");
  data.set("reason", "  Reviewed appointment hours  ");
  data.set("operationId", operationId);
  data.set("workspaceId", "forged-workspace");
  data.set("actorUserId", "forged-owner");
  if (intent === "CONFIRM") {
    data.set("previewHash", previewHash);
    data.set("confirmed", "on");
  }
  return data;
}
async function previewed(previousState = initialState) {
  return updateCoachingBookingPolicyAction(previousState, form());
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({
    workspace: { id: "actual-workspace" },
    session: { userId: "actual-owner" },
  });
  mocks.preview.mockImplementation(async ({ input }: { input: CoachingBookingPolicyRequest }) => ({
    version: input.expectedVersion,
    policy: input.policy,
    reason: input.reason,
    previewHash,
    affectedAvailabilityCount: 4,
    retainedAppointmentCount: 3,
  }));
  mocks.confirm.mockImplementation(async ({ confirmed }: { confirmed: boolean }) => {
    if (!confirmed) {
      throw new CoachingBookingPolicyError("Confirm that accepted appointments and units will remain unchanged.");
    }
    return { id: "policy-receipt", version: 3, replayed: false };
  });
});

describe("owner appointment rule preview", () => {
  it("uses only the authenticated owner and tenant and canonicalizes the structured draft", async () => {
    const data = form();
    const shuffled = policy();
    shuffled.appointments.weeklyHours.reverse();
    shuffled.appointments.weeklyHours.find((day) => day.weekday === "MONDAY")!.intervals.reverse();
    data.set("policy", JSON.stringify(shuffled));
    const result = await updateCoachingBookingPolicyAction(initialState, data);
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith({
      actor: { workspaceId: "actual-workspace", userId: "actual-owner" },
      input: {
        policy: policy(),
        reason: "Reviewed appointment hours",
        expectedVersion: 2,
        operationId,
      },
    });
    expect(result).toMatchObject({
      status: "preview",
      baseVersion: 2,
      operationId,
      review: { affectedAvailabilityCount: 4, retainedAppointmentCount: 3, previewHash },
      request: { policy: policy(), reason: "Reviewed appointment hours", expectedVersion: 2, operationId },
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("lets the owner guard redirect without making either domain call", async () => {
    const redirect = new Error("NEXT_REDIRECT:/unauthorized");
    mocks.context.mockRejectedValue(redirect);
    await expect(updateCoachingBookingPolicyAction(initialState, form())).rejects.toBe(redirect);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each(["", "not-json", "null", "{}"])("rejects a malformed policy (%s) before any domain call", async (value) => {
    const data = form();
    data.set("policy", value);
    expect(await updateCoachingBookingPolicyAction(initialState, data)).toMatchObject({ status: "error", review: null });
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("requires seven explicitly distinct days instead of filling defaults", async () => {
    const data = form();
    const incomplete = policy();
    incomplete.appointments.weeklyHours.pop();
    data.set("policy", JSON.stringify(incomplete));
    expect(await updateCoachingBookingPolicyAction(initialState, data)).toMatchObject({
      status: "error",
      message: "Explicitly configure all seven distinct weekdays; an empty interval list means closed.",
    });
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it.each(["", " ", "-1", "1.5", "Infinity", "9007199254740992"])("rejects invalid submitted version %j", async (value) => {
    const data = form();
    data.set("expectedVersion", value);
    expect(await updateCoachingBookingPolicyAction(initialState, data)).toMatchObject({
      status: "error", baseVersion: 2, operationId,
    });
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("rejects missing and repeated form fields rather than coercing them", async () => {
    const missing = form();
    missing.delete("expectedVersion");
    expect((await updateCoachingBookingPolicyAction(initialState, missing)).status).toBe("error");
    const repeated = form();
    repeated.append("policy", JSON.stringify(policy()));
    expect((await updateCoachingBookingPolicyAction(initialState, repeated)).status).toBe("error");
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it.each([
    ["reason", "   "],
    ["reason", "x".repeat(501)],
    ["reason", "reason\u0000control"],
    ["operationId", "short"],
    ["operationId", "different-request-0001"],
    ["intent", "DELETE"],
  ])("rejects invalid %s without changing request identity", async (name, value) => {
    const data = form();
    data.set(name, value);
    expect(await updateCoachingBookingPolicyAction(initialState, data)).toMatchObject({
      status: "error", baseVersion: 2, operationId, review: null,
    });
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("exposes a missing-configuration domain error and hides unexpected internal details", async () => {
    mocks.preview.mockRejectedValueOnce(new CoachingBookingPolicyError("Complete business timezone setup first."));
    expect(await previewed()).toMatchObject({
      status: "error", message: "Complete business timezone setup first.", review: null,
    });
    mocks.preview.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_SENTINEL"));
    const result = await previewed();
    expect(result.message).toBe("Appointment rules could not be confirmed. Reload and preview them again.");
    expect(result.message).not.toContain("PRIVATE_DATABASE_SENTINEL");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("keeps the submitted draft base and the last confirmed version through preview or stale denial", async () => {
    const previous = { ...initialState, baseVersion: 9, confirmedVersion: 1 };
    expect(await previewed(previous)).toMatchObject({
      status: "preview", baseVersion: 2, confirmedVersion: 1, operationId,
    });
    mocks.preview.mockRejectedValueOnce(new CoachingBookingPolicyError("Appointment rules changed. Reload and preview this change again."));
    expect(await previewed(previous)).toMatchObject({
      status: "error", baseVersion: 2, confirmedVersion: 1, operationId, review: null,
      message: "Appointment rules changed. Reload and preview this change again.",
    });
  });
});

describe("owner appointment rule confirmation", () => {
  it("requires an existing exact reviewed request", async () => {
    expect(await updateCoachingBookingPolicyAction(initialState, form("CONFIRM"))).toMatchObject({
      status: "error", message: "The draft changed after preview. Preview the current effects again.",
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each(["policy", "reason", "expectedVersion", "operationId", "previewHash"])("denies confirmation after %s changes", async (name) => {
    const previous = await previewed();
    const data = form("CONFIRM");
    if (name === "policy") {
      const changed = policy();
      changed.appointments.minimumBufferMinutes = 30;
      data.set(name, JSON.stringify(changed));
    } else {
      data.set(name, name === "expectedVersion" ? "3" : "changed-after-preview");
    }
    const result = await updateCoachingBookingPolicyAction(previous, data);
    expect(result.status).toBe("error");
    expect(result.operationId).toBe(operationId);
    expect(result.review).toBeNull();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([undefined, "false", "true", "1"])("requires exact checkbox acknowledgment instead of %j", async (acknowledgment) => {
    const previous = await previewed();
    const data = form("CONFIRM");
    if (acknowledgment === undefined) data.delete("confirmed");
    else data.set("confirmed", acknowledgment);
    const result = await updateCoachingBookingPolicyAction(previous, data);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmed: false, previewHash }));
    expect(result).toMatchObject({
      status: "error", baseVersion: 2, confirmedVersion: null, operationId,
      message: "Confirm that accepted appointments and units will remain unchanged.",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not accept a repeated acknowledgment field", async () => {
    const previous = await previewed();
    const data = form("CONFIRM");
    data.append("confirmed", "false");
    expect((await updateCoachingBookingPolicyAction(previous, data)).status).toBe("error");
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmed: false }));
  });

  it("forwards the exact review and returns the actual committed version, policy and a new request ID", async () => {
    const previous = await previewed();
    const result = await updateCoachingBookingPolicyAction(previous, form("CONFIRM"));
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({
      actor: { workspaceId: "actual-workspace", userId: "actual-owner" },
      input: { policy: policy(), reason: "Reviewed appointment hours", expectedVersion: 2, operationId },
      previewHash,
      confirmed: true,
    });
    expect(result).toMatchObject({
      status: "success", baseVersion: 3, confirmedVersion: 3,
      message: "Appointment booking rules version 3 confirmed.",
      request: null, review: null, confirmedPolicy: policy(),
    });
    expect(result.operationId).not.toBe(operationId);
    expect(result.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/dashboard", "layout");
  });

  it("uses the receipt version when an exact lost-response retry is replayed", async () => {
    const previous = await previewed();
    mocks.confirm.mockResolvedValueOnce({ id: "original-receipt", version: 3, replayed: true });
    expect(await updateCoachingBookingPolicyAction(previous, form("CONFIRM"))).toMatchObject({
      status: "success", baseVersion: 3, confirmedVersion: 3,
      message: "Appointment booking rules version 3 confirmed.",
    });
  });

  it("retains draft authority and clears the review after a changed schedule or revoked-owner domain denial", async () => {
    for (const message of [
      "The reviewed policy or schedule changed. Preview the current effects again.",
      "Only a current active owner can confirm appointment booking rules.",
    ]) {
      const previous = await previewed({ ...initialState, confirmedVersion: 1 });
      mocks.confirm.mockRejectedValueOnce(new CoachingBookingPolicyError(message));
      expect(await updateCoachingBookingPolicyAction(previous, form("CONFIRM"))).toMatchObject({
        status: "error", baseVersion: 2, operationId, confirmedVersion: 1,
        review: null, message,
      });
    }
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
