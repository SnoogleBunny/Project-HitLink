import { describe, expect, it } from "vitest";
import {
  isWorkspaceOperationallyReady,
  isWorkspaceMigrationReady,
  validateNewBusinessRegionalSettings,
} from "@flowstate/db";
describe("clean workspace setup authority", () => {
  const receipt = {
    ownerUserId: "owner",
    ownerVerifiedAt: new Date("2030-01-01T12:00:00Z"),
    activatedAt: new Date("2030-01-01T12:05:00Z"),
    snapshotHash: "a".repeat(64),
  };
  it("allows only an active workspace with complete setup receipt, while migration readiness stays strict", () => {
    expect(
      isWorkspaceOperationallyReady({
        workspaceStatus: "ACTIVE",
        setupActivation: receipt,
      }),
    ).toBe(true);
    expect(isWorkspaceMigrationReady({ workspaceStatus: "ACTIVE" })).toBe(
      false,
    );
    expect(
      isWorkspaceOperationallyReady({
        workspaceStatus: "SETUP_INCOMPLETE",
        setupActivation: receipt,
      }),
    ).toBe(false);
    expect(
      isWorkspaceOperationallyReady({
        workspaceStatus: "DISABLED",
        setupActivation: receipt,
      }),
    ).toBe(false);
    expect(
      isWorkspaceOperationallyReady({
        workspaceStatus: "ACTIVE",
        setupActivation: { ...receipt, snapshotHash: "unreviewed" },
      }),
    ).toBe(false);
    expect(
      isWorkspaceOperationallyReady({
        workspaceStatus: "ACTIVE",
        setupActivation: {
          ...receipt,
          ownerVerifiedAt: new Date("2030-01-02"),
        },
      }),
    ).toBe(false);
  });
  it.each([
    { ownerUserId: undefined },
    { ownerVerifiedAt: null },
    { activatedAt: undefined },
    { ownerVerifiedAt: "2030-01-01" },
    { snapshotHash: undefined },
  ])("fails closed for an incomplete runtime setup receipt %j", (missing) => {
    expect(
      isWorkspaceOperationallyReady({
        workspaceStatus: "ACTIVE",
        setupActivation: { ...receipt, ...missing } as never,
      }),
    ).toBe(false);
  });
  it("requires explicit valid services, currency, locale and timezone without a physical address", () => {
    const input = {
      serviceMode: "COACHING",
      currency: "CAD",
      locale: "en-ca",
      timezone: "UTC",
      contactEmail: " Owner@Example.test ",
    };
    expect(validateNewBusinessRegionalSettings(input)).toEqual({
      serviceMode: "COACHING",
      currency: "cad",
      locale: "en-CA",
      timezone: "UTC",
      contactEmail: "owner@example.test",
    });
    for (const override of [
      { timezone: "+03:00" },
      { currency: "" },
      { locale: "made_up" },
      { serviceMode: "UNKNOWN" },
      { contactEmail: "not-email" },
    ])
      expect(() =>
        validateNewBusinessRegionalSettings({ ...input, ...override }),
      ).toThrow();
  });
});
