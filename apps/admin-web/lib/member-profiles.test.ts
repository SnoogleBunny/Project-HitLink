import { describe, expect, it } from "vitest";
import {
  isAdultMember,
  validateEmergencyContact,
  validateMemberBasics,
} from "@flowstate/db";

describe("member contact validation", () => {
  it("normalizes member contacts without accepting account or service fields", () => {
    expect(
      validateMemberBasics(
        {
          fullName: "  Jordan Lee  ",
          email: " JORDAN@example.test ",
          phone: " +1 (555) 010-1234 ",
          dateOfBirth: "2000-02-29",
        },
        "2026-11-02",
      ),
    ).toEqual({
      fullName: "Jordan Lee",
      email: "jordan@example.test",
      phone: "+1 (555) 010-1234",
      dateOfBirth: new Date("2000-02-29T00:00:00Z"),
    });
  });
  it.each(["2025-02-29", "2027-01-01", "not-a-date"])(
    "rejects an invalid or future birth date %s",
    (dateOfBirth) => {
      expect(() =>
        validateMemberBasics({ fullName: "Jordan", dateOfBirth }, "2026-11-02"),
      ).toThrow(/valid date of birth/);
    },
  );
  it("requires a usable named emergency phone and bounds optional fields", () => {
    expect(() =>
      validateEmergencyContact({ fullName: "", phone: "555-0100" }),
    ).toThrow(/name is required/);
    expect(() =>
      validateEmergencyContact({ fullName: "Contact", phone: "none" }),
    ).toThrow(/phone/);
    expect(() =>
      validateEmergencyContact({
        fullName: "Contact",
        phone: "555-0100",
        email: "invalid",
      }),
    ).toThrow(/email/);
  });
  it("does not infer adulthood from an unknown birth date and checks the exact birthday", () => {
    expect(isAdultMember(null, "2026-11-02")).toBe(false);
    expect(isAdultMember(new Date("2008-11-03Z"), "2026-11-02")).toBe(false);
    expect(isAdultMember(new Date("2008-11-02Z"), "2026-11-02")).toBe(true);
  });
});
