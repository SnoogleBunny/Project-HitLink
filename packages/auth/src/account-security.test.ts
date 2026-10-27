import { describe, expect, it } from "vitest";
import { passwordResetLink, validateNewPassword } from "./account-security.js";

describe("password recovery input and link boundaries", () => {
  it("requires a substantial password without bcrypt's silent 72-byte truncation", () => {
    expect(validateNewPassword("short")).toMatch(/12 characters/);
    expect(validateNewPassword("🔐".repeat(6))).toMatch(/12 characters/);
    expect(validateNewPassword("a".repeat(72))).toBeNull();
    expect(validateNewPassword("a".repeat(73))).toMatch(/72 bytes/);
    expect(validateNewPassword("🔐".repeat(19))).toMatch(/72 bytes/);
    expect(validateNewPassword("a sufficiently long password")).toBeNull();
  });
  it("puts the token in a fragment on the configured origin, never in a request query", () => {
    const link = new URL(
      passwordResetLink(
        "https://members.example.test/untrusted-path?next=other",
        "secret-token",
      ),
    );
    expect(link.origin).toBe("https://members.example.test");
    expect(link.pathname).toBe("/reset-password");
    expect(link.search).toBe("");
    expect(new URLSearchParams(link.hash.slice(1)).get("token")).toBe(
      "secret-token",
    );
  });
  it.each([
    "javascript:alert(1)",
    "https://user:pass@example.test",
    "http://external.example.test",
    "not a URL",
  ])("rejects an unsafe reset origin %s", (origin) => {
    expect(() => passwordResetLink(origin, "token")).toThrow(
      /temporarily unavailable/,
    );
  });
  it("permits explicit loopback HTTP development origins", () => {
    expect(passwordResetLink("http://127.0.0.1:3100", "token")).toBe(
      "http://127.0.0.1:3100/reset-password#token=token",
    );
  });
});
