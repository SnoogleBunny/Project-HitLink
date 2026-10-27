import { describe, expect, it } from "vitest";
import {
  parseBusinessSettings,
  type BusinessSettingsInput,
} from "./business-settings";

const input: BusinessSettingsInput = {
  name: " A virtual coaching practice ",
  businessType: "Coaching",
  contactEmail: "Coach@Example.test",
  contactPhone: "",
  currency: "CAD",
  locale: "en-ca",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "",
};
describe("business settings validation", () => {
  it("normalizes identity, currency and locale without requiring a virtual address", () => {
    expect(parseBusinessSettings(input)).toMatchObject({
      name: "A virtual coaching practice",
      contactEmail: "coach@example.test",
      currency: "cad",
      locale: "en-CA",
      countryCode: "",
    });
  });
  it.each([
    ["name", ""],
    ["contactEmail", "wrong@"],
    ["contactEmail", "a@example.test\r\nBcc:other@example.test"],
    ["contactPhone", "123\u0000"],
    ["currency", "XYZ"],
    ["locale", "not_a_locale"],
    ["countryCode", "CANADA"],
  ])("rejects invalid %s before any write", (key, value) => {
    expect(() => parseBusinessSettings({ ...input, [key]: value })).toThrow();
  });
  it("does not accept an oversized business identity", () => {
    expect(() =>
      parseBusinessSettings({ ...input, name: "A".repeat(121) }),
    ).toThrow();
  });
});
