import { prisma } from "@hitlink/db";

export interface ProgramFormInput {
  name: string;
  description?: string;
  ageGroupLabel?: string;
  levelLabel?: string;
  progressTrackingEnabled: boolean;
}

interface ProgramDatabase {
  program: {
    create(args: {
      data: {
        workspaceId: string;
        name: string;
        description: string | null;
        ageGroupLabel: string | null;
        levelLabel: string | null;
        progressTrackingEnabled: boolean;
      };
      select: {
        id: true;
      };
    }): Promise<{
      id: string;
    }>;
    updateMany(args: {
      where: {
        id?: string;
        workspaceId: string;
      };
      data: {
        name?: string;
        description?: string | null;
        ageGroupLabel?: string | null;
        levelLabel?: string | null;
        progressTrackingEnabled?: boolean;
        archivedAt?: Date;
      };
    }): Promise<{
      count: number;
    }>;
  };
  classTemplate: {
    count(args: {
      where: {
        programId: string;
        archivedAt: null;
      };
    }): Promise<number>;
  };
}

type ProgramMutationResult =
  | {
      status: "created" | "updated" | "archived";
      programId: string;
    }
  | {
      status: "error";
      message: string;
    };

const programDatabase = prisma as unknown as ProgramDatabase;
const duplicateProgramNameMessage =
  "Programs in the same workspace must use unique names.";
const activeTemplateDependencyMessage =
  "This program is still used by active class templates. Archive or reassign those templates first.";

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function sanitizeProgramInput(input: ProgramFormInput) {
  return {
    name: input.name.trim(),
    description: cleanNullable(input.description),
    ageGroupLabel: cleanNullable(input.ageGroupLabel),
    levelLabel: cleanNullable(input.levelLabel),
    progressTrackingEnabled: input.progressTrackingEnabled,
  };
}

function isProgramNameUniqueConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: string;
    meta?: {
      target?: string[];
    };
  };

  return (
    maybeError.code === "P2002" &&
    Array.isArray(maybeError.meta?.target) &&
    maybeError.meta.target.includes("workspaceId") &&
    maybeError.meta.target.includes("name")
  );
}

export async function createProgram(args: {
  workspaceId: string;
  input: ProgramFormInput;
  db?: ProgramDatabase;
}): Promise<ProgramMutationResult> {
  const input = sanitizeProgramInput(args.input);

  if (!input.name) {
    return {
      status: "error",
      message: "Program name is required.",
    };
  }

  const db = args.db ?? programDatabase;

  try {
    const program = await db.program.create({
      data: {
        workspaceId: args.workspaceId,
        name: input.name,
        description: input.description,
        ageGroupLabel: input.ageGroupLabel,
        levelLabel: input.levelLabel,
        progressTrackingEnabled: input.progressTrackingEnabled,
      },
      select: {
        id: true,
      },
    });

    return {
      status: "created",
      programId: program.id,
    };
  } catch (error) {
    if (isProgramNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: duplicateProgramNameMessage,
      };
    }

    throw error;
  }
}

export async function updateProgram(args: {
  programId: string;
  workspaceId: string;
  input: ProgramFormInput;
  db?: ProgramDatabase;
}): Promise<ProgramMutationResult> {
  const input = sanitizeProgramInput(args.input);

  if (!input.name) {
    return {
      status: "error",
      message: "Program name is required.",
    };
  }

  const db = args.db ?? programDatabase;

  try {
    const result = await db.program.updateMany({
      where: {
        id: args.programId,
        workspaceId: args.workspaceId,
      },
      data: {
        name: input.name,
        description: input.description,
        ageGroupLabel: input.ageGroupLabel,
        levelLabel: input.levelLabel,
        progressTrackingEnabled: input.progressTrackingEnabled,
      },
    });

    if (result.count === 0) {
      return {
        status: "error",
        message: "Program not found.",
      };
    }

    return {
      status: "updated",
      programId: args.programId,
    };
  } catch (error) {
    if (isProgramNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: duplicateProgramNameMessage,
      };
    }

    throw error;
  }
}

export async function archiveProgram(args: {
  programId: string;
  workspaceId: string;
  db?: ProgramDatabase;
}): Promise<ProgramMutationResult> {
  const db = args.db ?? programDatabase;
  const activeTemplateCount = await db.classTemplate.count({
    where: {
      programId: args.programId,
      archivedAt: null,
    },
  });

  if (activeTemplateCount > 0) {
    return {
      status: "error",
      message: activeTemplateDependencyMessage,
    };
  }

  const result = await db.program.updateMany({
    where: {
      id: args.programId,
      workspaceId: args.workspaceId,
    },
    data: {
      archivedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Program not found.",
    };
  }

  return {
    status: "archived",
    programId: args.programId,
  };
}
