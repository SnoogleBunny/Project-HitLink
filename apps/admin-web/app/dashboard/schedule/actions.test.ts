import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  archiveClassTemplateMock,
  createClassTemplateMock,
  redirectMock,
  requireOwnerWorkspaceContextMock,
  updateClassTemplateMock,
} = vi.hoisted(() => ({
  archiveClassTemplateMock: vi.fn(),
  createClassTemplateMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  requireOwnerWorkspaceContextMock: vi.fn(),
  updateClassTemplateMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: requireOwnerWorkspaceContextMock,
}));

vi.mock("../../../lib/class-templates", () => ({
  archiveClassTemplate: archiveClassTemplateMock,
  createClassTemplate: createClassTemplateMock,
  updateClassTemplate: updateClassTemplateMock,
}));

import {
  archiveClassTemplateAction,
  createClassTemplateAction,
  updateClassTemplateAction,
} from "./actions";

function buildFormData() {
  const formData = new FormData();
  formData.set("programId", "program_1");
  formData.set("roomId", "room_1");
  formData.set("coachWorkspaceUserId", "workspace_user_1");
  formData.set("title", "Morning Fundamentals");
  formData.set("weekday", "MONDAY");
  formData.set("startTime", "09:00");
  formData.set("endTime", "10:00");
  formData.set("capacityOverride", "18");
  formData.set("bookingCutoffMinutes", "60");
  formData.set("cancellationCutoffMinutes", "120");

  return formData;
}

describe("class template schedule actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerWorkspaceContextMock.mockResolvedValue({
      session: {
        userId: "owner_1",
        email: "owner@example.com",
        displayName: "Dana Owner",
        workspaceId: "workspace_1",
        role: "OWNER",
      },
      workspace: {
        id: "workspace_1",
        name: "Sahara Muay Thai",
      },
      location: {
        id: "location_1",
      },
    });
  });

  it("returns inline validation errors during create", async () => {
    createClassTemplateMock.mockResolvedValue({
      status: "error",
      message: "Select an active program in this workspace.",
    });

    await expect(
      createClassTemplateAction(
        {
          error: null,
        },
        buildFormData(),
      ),
    ).resolves.toEqual({
      error: "Select an active program in this workspace.",
    });

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to the schedule board after a successful create", async () => {
    createClassTemplateMock.mockResolvedValue({
      status: "created",
      templateId: "template_1",
    });

    await expect(
      createClassTemplateAction(
        {
          error: null,
        },
        buildFormData(),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard/schedule");

    expect(createClassTemplateMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      locationId: "location_1",
      input: {
        programId: "program_1",
        roomId: "room_1",
        coachWorkspaceUserId: "workspace_user_1",
        title: "Morning Fundamentals",
        weekday: "MONDAY",
        startTime: "09:00",
        endTime: "10:00",
        capacityOverride: "18",
        bookingCutoffMinutes: "60",
        cancellationCutoffMinutes: "120",
      },
    });
  });

  it("redirects to the schedule board after a successful update", async () => {
    const formData = buildFormData();
    formData.set("templateId", "template_1");
    updateClassTemplateMock.mockResolvedValue({
      status: "updated",
      templateId: "template_1",
    });

    await expect(
      updateClassTemplateAction(
        {
          error: null,
        },
        formData,
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard/schedule");

    expect(updateClassTemplateMock).toHaveBeenCalledWith({
      templateId: "template_1",
      workspaceId: "workspace_1",
      locationId: "location_1",
      input: {
        programId: "program_1",
        roomId: "room_1",
        coachWorkspaceUserId: "workspace_user_1",
        title: "Morning Fundamentals",
        weekday: "MONDAY",
        startTime: "09:00",
        endTime: "10:00",
        capacityOverride: "18",
        bookingCutoffMinutes: "60",
        cancellationCutoffMinutes: "120",
      },
    });
  });

  it("redirects to the schedule board after archive", async () => {
    const formData = new FormData();
    formData.set("templateId", "template_1");
    archiveClassTemplateMock.mockResolvedValue({
      status: "archived",
      templateId: "template_1",
    });

    await expect(archiveClassTemplateAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/schedule",
    );

    expect(archiveClassTemplateMock).toHaveBeenCalledWith({
      templateId: "template_1",
      workspaceId: "workspace_1",
    });
  });
});
