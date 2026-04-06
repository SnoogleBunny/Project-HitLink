import { describe, expect, it, vi } from "vitest";
import { archiveRoom, createRoom, updateRoom } from "./rooms";

function buildInput() {
  return {
    name: "  Main Mat  ",
    capacity: " 24 ",
    isActive: true,
  };
}

describe("room helpers", () => {
  it("creates a room scoped to the primary location and sanitizes capacity", async () => {
    const created = {
      data: null as Record<string, unknown> | null,
    };

    const db = {
      room: {
        create: vi.fn(async ({ data }) => {
          created.data = data;
          return {
            id: "room_1",
          };
        }),
        updateMany: vi.fn(),
      },
      classTemplate: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    await expect(
      createRoom({
        locationId: "location_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      roomId: "room_1",
    });

    expect(created.data).toEqual({
      locationId: "location_1",
      name: "Main Mat",
      capacity: 24,
      isActive: true,
    });
  });

  it("rejects invalid capacity values", async () => {
    const db = {
      room: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      classTemplate: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    await expect(
      createRoom({
        locationId: "location_1",
        input: {
          ...buildInput(),
          capacity: "0",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Capacity must be a positive whole number.",
    });
  });

  it("returns a friendly error when the location name uniqueness constraint is hit", async () => {
    const db = {
      room: {
        create: vi.fn(async () => {
          throw {
            code: "P2002",
            meta: {
              target: ["locationId", "name"],
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
      createRoom({
        locationId: "location_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Rooms in the same location must use unique names.",
    });
  });

  it("blocks room deactivation while an unarchived class template still uses the room", async () => {
    const db = {
      room: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      classTemplate: {
        count: vi.fn().mockResolvedValue(1),
      },
    };

    await expect(
      updateRoom({
        locationId: "location_1",
        roomId: "room_1",
        input: {
          name: "Secondary Mat",
          capacity: "",
          isActive: false,
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "This room is still used by active class templates. Archive or reassign those templates first.",
    });

    expect(db.room.updateMany).not.toHaveBeenCalled();
    expect(db.classTemplate.count).toHaveBeenCalledWith({
      where: {
        roomId: "room_1",
        archivedAt: null,
      },
    });
  });

  it("allows deactivation when only archived templates remain or none exist", async () => {
    const db = {
      room: {
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
      updateRoom({
        locationId: "location_1",
        roomId: "room_1",
        input: {
          name: "Secondary Mat",
          capacity: "",
          isActive: false,
        },
        db,
      }),
    ).resolves.toEqual({
      status: "updated",
      roomId: "room_1",
    });

    expect(db.room.updateMany).toHaveBeenCalledWith({
      where: {
        id: "room_1",
        locationId: "location_1",
      },
      data: {
        name: "Secondary Mat",
        capacity: null,
        isActive: false,
      },
    });
  });

  it("blocks room archive while an unarchived class template still uses the room", async () => {
    const db = {
      room: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      classTemplate: {
        count: vi.fn().mockResolvedValue(1),
      },
    };

    await expect(
      archiveRoom({
        locationId: "location_1",
        roomId: "room_1",
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "This room is still used by active class templates. Archive or reassign those templates first.",
    });

    expect(db.room.updateMany).not.toHaveBeenCalled();
    expect(db.classTemplate.count).toHaveBeenCalledWith({
      where: {
        roomId: "room_1",
        archivedAt: null,
      },
    });
  });

  it("archives a room when only archived templates remain or none exist", async () => {
    const db = {
      room: {
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
      archiveRoom({
        locationId: "location_1",
        roomId: "room_1",
        db,
      }),
    ).resolves.toEqual({
      status: "archived",
      roomId: "room_1",
    });

    expect(db.room.updateMany).toHaveBeenCalledWith({
      where: {
        id: "room_1",
        locationId: "location_1",
      },
      data: {
        isActive: false,
        archivedAt: expect.any(Date),
      },
    });
  });

  it("does not archive a room outside the current location scope", async () => {
    const db = {
      room: {
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
      archiveRoom({
        locationId: "location_1",
        roomId: "room_2",
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Room not found.",
    });

    expect(db.room.updateMany).toHaveBeenCalledWith({
      where: {
        id: "room_2",
        locationId: "location_1",
      },
      data: {
        isActive: false,
        archivedAt: expect.any(Date),
      },
    });
  });
});
