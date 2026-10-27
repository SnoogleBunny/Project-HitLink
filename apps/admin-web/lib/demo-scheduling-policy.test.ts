import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ensureDemoSchedulingPolicy } from "../../../tests/e2e/support/demo-scheduling-policy";
describe("preserved fictional E2E policy upgrade guard", () => {
  it.each([
    undefined,
    "postgresql://example.com/hitlink_e2e_test",
    "postgresql://localhost/hitlink_production",
    "postgresql://localhost/hitlink_demo",
    "postgresql://localhost/hitlink_e2e_test?host=example.com",
  ])("rejects an unsafe target before reading or writing: %s", async (url) => {
    const findUnique = vi.fn();
    const db = { workspace: { findUnique } } as unknown as PrismaClient;
    await expect(ensureDemoSchedulingPolicy(db, url ?? "")).rejects.toThrow();
    expect(findUnique).not.toHaveBeenCalled();
  });
  it("requires the canonical fictional workspace, owner and migration identity", async () => {
    const db = {
      workspace: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: "demo-workspace-flowstate",
            workspaceUsers: [],
            migration: { id: "demo-workspace-migration", stage: "COMPLETE" },
          }),
      },
    } as unknown as PrismaClient;
    await expect(
      ensureDemoSchedulingPolicy(db, "postgresql://localhost/hitlink_e2e_test"),
    ).rejects.toThrow("canonical fictional demo");
  });
  it("preserves every existing owner policy without replacing edits", async () => {
    const db = {
      workspace: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: "demo-workspace-flowstate",
            workspaceUsers: [
              {
                role: "OWNER",
                isActive: true,
                userId: "owner",
                user: { email: "demo-owner@flowstate.local" },
              },
            ],
            migration: { id: "demo-workspace-migration", stage: "COMPLETE" },
          }),
      },
      workspaceSchedulingPolicyRevision: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-owner-policy" }),
      },
    } as unknown as PrismaClient;
    await expect(
      ensureDemoSchedulingPolicy(db, "postgresql://localhost/hitlink_e2e_test"),
    ).resolves.toBeUndefined();
  });
});
