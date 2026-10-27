import { describe, expect, it } from "vitest";
import {
  parseClassReminderLeadMinutes,
  ClassReminderSettingsError,
  classReminderSettingsMessage,
} from "@flowstate/db";
describe("explicit class reminder interval", () => {
  it("keeps absence and explicit OFF disabled without a default", () => {
    expect(parseClassReminderLeadMinutes(null)).toBeNull();
    expect(parseClassReminderLeadMinutes("OFF")).toBeNull();
  });
  it.each([1, 60, 1440, 527040])(
    "accepts a whole explicit interval %s",
    (value) => {
      expect(parseClassReminderLeadMinutes(value)).toBe(value);
      expect(parseClassReminderLeadMinutes(String(value))).toBe(value);
    },
  );
  it.each([
    undefined,
    "",
    " 60",
    "60 ",
    "1e3",
    "0",
    0,
    -1,
    0.5,
    527041,
    NaN,
    Infinity,
    {},
    [],
    true,
  ])("rejects invalid interval %j", (value) => {
    expect(() => parseClassReminderLeadMinutes(value)).toThrow();
  });
  it("uses fixed owned error copy without inspecting spoofed or getter-bearing errors", () => {
    expect(
      classReminderSettingsMessage(
        new ClassReminderSettingsError(
          "Only the current active owner can change class reminders.",
        ),
      ),
    ).toBe("Only the current active owner can change class reminders.");
    const spoof = Object.create(ClassReminderSettingsError.prototype) as object;
    Object.defineProperty(spoof, "message", {
      get() {
        throw new Error("DO_NOT_READ");
      },
    });
    for (const error of [
      spoof,
      new Error("PRIVATE_MESSAGE"),
      new ClassReminderSettingsError("PRIVATE_MESSAGE"),
    ])
      expect(classReminderSettingsMessage(error)).toBe(
        "Reminder settings could not be saved. Reload the current settings and try again.",
      );
  });
});
