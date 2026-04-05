import { describe, expect, it, vi } from "vitest";
import { archiveProgram, createProgram, updateProgram } from "./programs";

function buildInput() {
  return {
    name: "  Youth Muay Thai  ",
    description: "  Intro classes for teens  ",
    ageGroupLabel: "  12-16  ",
    levelLabel: "  Beginner  ",
    progressTrackingEnabled: true,
  };
}

describe("program helpers", () => {
  it("creates a program with sanitized nullable fields and the requested progress flag", async () => {
    const created = {
      data: null as Record<string, unknown> | null,
    };

    const db = {
      program: {
        create: vi.fn(async ({ data }) => {
          created.data = data;
          return {
            id: "program_1",
          };
        }),
        updateMany: vi.fn(),
      },
    };

    await expect(
      createProgram({
        workspaceId: "workspace_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      programId: "program_1",
    });

    expect(created.data).toEqual({
      workspaceId: "workspace_1",
      name: "Youth Muay Thai",
      description: "Intro classes for teens",
      ageGroupLabel: "12-16",
      levelLabel: "Beginner",
      progressTrackingEnabled: true,
    });
  });

  it("returns a friendly error when the workspace name uniqueness constraint is hit", async () => {
    const db = {
      program: {
        create: vi.fn(async () => {
          throw {
            code: "P2002",
            meta: {
              target: ["workspaceId", "name"],
            },
          };
        }),
        updateMany: vi.fn(),
      },
    };

    await expect(
      createProgram({
        workspaceId: "workspace_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Programs in the same workspace must use unique names.",
    });
  });

  it("scopes updates by workspace and returns a not found error when nothing is updated", async () => {
    const db = {
      program: {
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({
          count: 0,
        }),
      },
    };

    await expect(
      updateProgram({
        workspaceId: "workspace_1",
        programId: "program_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Program not found.",
    });

    expect(db.program.updateMany).toHaveBeenCalledWith({
      where: {
        id: "program_1",
        workspaceId: "workspace_1",
      },
      data: {
        name: "Youth Muay Thai",
        description: "Intro classes for teens",
        ageGroupLabel: "12-16",
        levelLabel: "Beginner",
        progressTrackingEnabled: true,
      },
    });
  });

  it("does not archive a program outside the current workspace", async () => {
    const db = {
      program: {
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({
          count: 0,
        }),
      },
    };

    await expect(
      archiveProgram({
        workspaceId: "workspace_1",
        programId: "program_2",
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Program not found.",
    });

    expect(db.program.updateMany).toHaveBeenCalledWith({
      where: {
        id: "program_2",
        workspaceId: "workspace_1",
      },
      data: {
        archivedAt: expect.any(Date),
      },
    });
  });
});
