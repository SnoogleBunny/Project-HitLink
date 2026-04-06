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
      classTemplate: {
        count: vi.fn().mockResolvedValue(0),
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
      classTemplate: {
        count: vi.fn().mockResolvedValue(0),
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
      classTemplate: {
        count: vi.fn().mockResolvedValue(0),
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

  it("blocks archiving when an unarchived class template still uses the program", async () => {
    const db = {
      program: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      classTemplate: {
        count: vi.fn().mockResolvedValue(1),
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
      message:
        "This program is still used by active class templates. Archive or reassign those templates first.",
    });

    expect(db.program.updateMany).not.toHaveBeenCalled();
    expect(db.classTemplate.count).toHaveBeenCalledWith({
      where: {
        programId: "program_2",
        archivedAt: null,
      },
    });
  });

  it("allows archiving when only archived templates remain or none exist", async () => {
    const db = {
      program: {
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
      },
      classTemplate: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    await expect(
      archiveProgram({
        workspaceId: "workspace_1",
        programId: "program_2",
        db,
      }),
    ).resolves.toEqual({
      status: "archived",
      programId: "program_2",
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

  it("does not archive a program outside the current workspace", async () => {
    const db = {
      program: {
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({
          count: 0,
        }),
      },
      classTemplate: {
        count: vi.fn().mockResolvedValue(0),
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
