import { prisma } from "@flowstate/db";

export interface RoomFormInput {
  name: string;
  capacity?: string;
  isActive: boolean;
}

interface RoomDatabase {
  room: {
    create(args: {
      data: {
        locationId: string;
        name: string;
        capacity: number | null;
        isActive: boolean;
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
        locationId: string;
      };
      data: {
        name?: string;
        capacity?: number | null;
        isActive?: boolean;
        archivedAt?: Date;
      };
    }): Promise<{
      count: number;
    }>;
  };
  classTemplate: {
    count(args: {
      where: {
        roomId: string;
        archivedAt: null;
      };
    }): Promise<number>;
  };
}

type RoomMutationResult =
  | {
      status: "created" | "updated" | "archived";
      roomId: string;
    }
  | {
      status: "error";
      message: string;
    };

const roomDatabase = prisma as unknown as RoomDatabase;
const duplicateRoomNameMessage =
  "Rooms in the same location must use unique names.";
const activeTemplateDependencyMessage =
  "This room is still used by active class templates. Archive or reassign those templates first.";

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function parseCapacity(value: string | undefined): number | null | "invalid" {
  const sanitizedValue = cleanNullable(value);

  if (!sanitizedValue) {
    return null;
  }

  const parsed = Number(sanitizedValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return "invalid";
  }

  return parsed;
}

function sanitizeRoomInput(input: RoomFormInput) {
  return {
    name: input.name.trim(),
    capacity: parseCapacity(input.capacity),
    isActive: input.isActive,
  };
}

function isRoomNameUniqueConstraint(error: unknown): boolean {
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
    maybeError.meta.target.includes("locationId") &&
    maybeError.meta.target.includes("name")
  );
}

export async function createRoom(args: {
  locationId: string;
  input: RoomFormInput;
  db?: RoomDatabase;
}): Promise<RoomMutationResult> {
  const input = sanitizeRoomInput(args.input);

  if (!input.name) {
    return {
      status: "error",
      message: "Room name is required.",
    };
  }

  if (input.capacity === "invalid") {
    return {
      status: "error",
      message: "Capacity must be a positive whole number.",
    };
  }

  const db = args.db ?? roomDatabase;

  try {
    const room = await db.room.create({
      data: {
        locationId: args.locationId,
        name: input.name,
        capacity: input.capacity,
        isActive: input.isActive,
      },
      select: {
        id: true,
      },
    });

    return {
      status: "created",
      roomId: room.id,
    };
  } catch (error) {
    if (isRoomNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: duplicateRoomNameMessage,
      };
    }

    throw error;
  }
}

export async function updateRoom(args: {
  roomId: string;
  locationId: string;
  input: RoomFormInput;
  db?: RoomDatabase;
}): Promise<RoomMutationResult> {
  const input = sanitizeRoomInput(args.input);

  if (!input.name) {
    return {
      status: "error",
      message: "Room name is required.",
    };
  }

  if (input.capacity === "invalid") {
    return {
      status: "error",
      message: "Capacity must be a positive whole number.",
    };
  }

  const db = args.db ?? roomDatabase;

  if (!input.isActive) {
    const activeTemplateCount = await db.classTemplate.count({
      where: {
        roomId: args.roomId,
        archivedAt: null,
      },
    });

    if (activeTemplateCount > 0) {
      return {
        status: "error",
        message: activeTemplateDependencyMessage,
      };
    }
  }

  try {
    const result = await db.room.updateMany({
      where: {
        id: args.roomId,
        locationId: args.locationId,
      },
      data: {
        name: input.name,
        capacity: input.capacity,
        isActive: input.isActive,
      },
    });

    if (result.count === 0) {
      return {
        status: "error",
        message: "Room not found.",
      };
    }

    return {
      status: "updated",
      roomId: args.roomId,
    };
  } catch (error) {
    if (isRoomNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: duplicateRoomNameMessage,
      };
    }

    throw error;
  }
}

export async function archiveRoom(args: {
  roomId: string;
  locationId: string;
  db?: RoomDatabase;
}): Promise<RoomMutationResult> {
  const db = args.db ?? roomDatabase;
  const activeTemplateCount = await db.classTemplate.count({
    where: {
      roomId: args.roomId,
      archivedAt: null,
    },
  });

  if (activeTemplateCount > 0) {
    return {
      status: "error",
      message: activeTemplateDependencyMessage,
    };
  }

  const result = await db.room.updateMany({
    where: {
      id: args.roomId,
      locationId: args.locationId,
    },
    data: {
      isActive: false,
      archivedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Room not found.",
    };
  }

  return {
    status: "archived",
    roomId: args.roomId,
  };
}
