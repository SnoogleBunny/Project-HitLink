import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  update: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: mocks.owner,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@flowstate/db", () => ({
  ClassReminderSettingsError: class extends Error {},
  classReminderSettingsMessage: () =>
    "Reminder settings could not be saved. Reload the current settings and try again.",
  PaymentConfirmationError: class extends Error {},
  retryFailedNotification: vi.fn(),
  updateClassReminderSettings: mocks.update,
}));
import {
  updateClassReminderSettingsAction,
  type ClassReminderSettingsState,
} from "./actions";
const initial: ClassReminderSettingsState = {
  status: "idle",
  version: 0,
  leadMinutes: null,
  message: null,
};
function form(mode = "ON") {
  const data = new FormData();
  data.set("mode", mode);
  data.set("leadMinutes", "120");
  data.set("reason", "Explicit owner choice");
  data.set("expectedVersion", "0");
  data.set("workspaceId", "forged-gym");
  data.set("actorUserId", "forged-owner");
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.owner.mockResolvedValue({
    workspace: { id: "actual-gym" },
    session: { userId: "actual-owner" },
  });
  mocks.update.mockResolvedValue({ version: 1, leadMinutes: 120 });
});
describe("owner reminder settings action", () => {
  it("binds the command only to authenticated owner and gym", async () => {
    const result = await updateClassReminderSettingsAction(initial, form());
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      actor: { workspaceId: "actual-gym", userId: "actual-owner" },
      expectedVersion: 0,
      leadMinutes: "120",
      reason: "Explicit owner choice",
    });
    expect(result).toMatchObject({
      status: "success",
      version: 1,
      leadMinutes: 120,
    });
    expect(result.message).toContain("scheduled processing");
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith(
      "/dashboard/settings/email",
    );
  });
  it("off explicitly sends null rather than a default advance interval", async () => {
    mocks.update.mockResolvedValue({ version: 1, leadMinutes: null });
    const result = await updateClassReminderSettingsAction(
      initial,
      form("OFF"),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ leadMinutes: null }),
    );
    expect(result.message).toContain("reminders are off");
  });
  it("propagates owner redirect outside the error boundary", async () => {
    const control = new Error("NEXT_REDIRECT");
    mocks.owner.mockRejectedValue(control);
    await expect(
      updateClassReminderSettingsAction(initial, form()),
    ).rejects.toBe(control);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["expectedVersion", "mode", "reason", "leadMinutes"])(
    "rejects a duplicated %s field before mutation",
    async (key) => {
      const data = form();
      data.append(key, "duplicate");
      expect(
        (await updateClassReminderSettingsAction(initial, data)).status,
      ).toBe("error");
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it.each(["-1", "0.5", "1e3", "", "NaN"])(
    "rejects malformed version %s before mutation",
    async (version) => {
      const data = form();
      data.set("expectedVersion", version);
      expect(
        (await updateClassReminderSettingsAction(initial, data)).status,
      ).toBe("error");
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it("unknown error text does not enter feedback and failed save preserves the local version", async () => {
    mocks.update.mockRejectedValue(new Error("PRIVATE_CONTACT_DO_NOT_RENDER"));
    const result = await updateClassReminderSettingsAction(initial, form());
    expect(result).toMatchObject({
      status: "error",
      version: 0,
      leadMinutes: null,
    });
    expect(result.message).not.toContain("PRIVATE_CONTACT_DO_NOT_RENDER");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("revalidation control propagates after the successful domain call", async () => {
    const control = new Error("NEXT_CONTROL_REVALIDATION");
    mocks.revalidate.mockImplementation(() => {
      throw control;
    });
    await expect(
      updateClassReminderSettingsAction(initial, form()),
    ).rejects.toBe(control);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
