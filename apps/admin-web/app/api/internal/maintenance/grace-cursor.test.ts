import { describe, expect, it } from "vitest";
import { encodeGraceMaintenanceCursor, encodeReminderMaintenanceCursor, parseMaintenanceCursor } from "./grace-cursor";
describe("bounded maintenance continuation contract", () => {
  it("retains the existing workspace cursor and encodes a precise same-workspace booking position", () => {
    expect(parseMaintenanceCursor(null)).toEqual({});
    expect(parseMaintenanceCursor("gym-1")).toEqual({ afterWorkspaceId: "gym-1" });
    expect(parseMaintenanceCursor(encodeGraceMaintenanceCursor("gym-1", "booking:101", "booking:999"))).toEqual({ grace: { workspaceId: "gym-1", afterBookingId: "booking:101", throughBookingId: "booking:999" } });
  });
  it.each(["mg1.invalid", "<foreign>", "mg1.", "x".repeat(701), `mg1.${Buffer.from(JSON.stringify(["gym-1", "booking", "end", "extra"])).toString("base64url")}`, `mg1.${Buffer.from(JSON.stringify(["", "booking", "end"])).toString("base64url")}`])("rejects malformed opaque state %s", value => { expect(parseMaintenanceCursor(value)).toBeNull(); });
});

describe("reminder maintenance phase", () => {
  it("encodes a start phase and an exact bounded booking/settings position", () => {
    expect(parseMaintenanceCursor(encodeReminderMaintenanceCursor("gym-1"))).toEqual({ reminders: { workspaceId: "gym-1" } });
    const cursor = { afterId: "booking:100", highWaterId: "booking:999", settingsVersion: 2 };
    expect(parseMaintenanceCursor(encodeReminderMaintenanceCursor("gym-1", cursor))).toEqual({ reminders: { workspaceId: "gym-1", cursor } });
  });
  it.each(["mr1.", "mr1.invalid", `mr1.${Buffer.from(JSON.stringify(["gym-1", "booking-1", "booking-1", 1])).toString("base64url")}`, `mr1.${Buffer.from(JSON.stringify(["gym-1", null, "booking-1", null])).toString("base64url")}`, `mr1.${Buffer.from(JSON.stringify(["gym-1", "booking-1", "booking-2", 0])).toString("base64url")}`, `mr1.${Buffer.from(JSON.stringify(["gym-1", "booking-1", "booking-2", 1, "extra"])).toString("base64url")}`])("rejects malformed reminder state %s", value => { expect(parseMaintenanceCursor(value)).toBeNull(); });
});
