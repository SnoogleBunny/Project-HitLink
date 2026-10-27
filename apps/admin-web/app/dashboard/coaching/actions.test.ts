import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  context: vi.fn(),
  command: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@flowstate/db", () => ({
  CoachingError: class CoachingError extends Error {},
  runCoachingCommand: mock.command,
  getZonedDateTimeAsUtc: vi.fn(),
  isUnambiguousClassTime: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("../../../lib/operations-workspace", () => ({
  requireOperationsWorkspaceContext: mock.context,
}));
import { CoachingError } from "@flowstate/db";
import { coachingAction } from "./actions";
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    enrollmentId: "enrollment",
    kind: "saveDailyNote",
    operationId: "operation",
    expectedVersion: "2",
    ...values,
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.context.mockResolvedValue({
    workspace: { id: "gym" },
    session: { userId: "accepted-coach" },
    location: { timezone: "UTC" },
  });
  mock.command.mockResolvedValue({ id: "enrollment" });
});
describe("coaching action destinations", () => {
  it("returns a note mutation to Notes using the authenticated workspace and actor", async () => {
    await expect(
      coachingAction(
        form({
          workspaceId: "foreign-gym",
          userId: "owner",
          returnView: "notes",
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/enrollment?view=notes&saved=1",
    );
    expect(mock.command).toHaveBeenCalledWith(
      { workspaceId: "gym", userId: "accepted-coach" },
      expect.objectContaining({
        kind: "saveDailyNote",
        enrollmentId: "enrollment",
        expectedVersion: 2,
      }),
    );
  });
  it("keeps a rejected publication in Notes with its exact review error", async () => {
    mock.command.mockRejectedValue(
      new CoachingError("Reload this note before publishing."),
    );
    await expect(
      coachingAction(form({ kind: "publishDailyNote", returnView: "notes" })),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/enrollment?view=notes&error=Reload+this+note+before+publishing.",
    );
  });
  it("does not accept a crafted external return URL or view", async () => {
    await expect(
      coachingAction(
        form({
          enrollmentId: "id?x=1/other",
          returnView: "//outside.example/path",
          returnUrl: "https://outside.example",
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/id%3Fx%3D1%2Fother?view=plan&saved=1",
    );
  });
  it("keeps exceptional-review actions in their exact encoded review route", async () => {
    await expect(
      coachingAction(
        form({ kind: "approveRecordReview", returnReviewId: "grant/one?x=1" }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/reviews/grant%2Fone%3Fx%3D1?saved=1",
    );
    await expect(
      coachingAction(
        form({ kind: "saveDailyNote", returnReviewId: "foreign-grant" }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/enrollment?view=notes&saved=1",
    );
  });
  it("returns a newly offered program to its encoded Plan route", async () => {
    mock.command.mockResolvedValue({ id: "new/enrollment" });
    await expect(
      coachingAction(form({ kind: "enroll", enrollmentId: "" })),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/new%2Fenrollment?view=plan&saved=1",
    );
  });
  it("passes dated local availability to the authorized domain instead of converting it using the current clock", async () => {
    mock.context.mockResolvedValue({workspace:{id:"gym"},session:{userId:"accepted-coach"},location:{timezone:"UTC"}});
    await expect(coachingAction(form({kind:"createAvailability",enrollmentId:"",startsAt:"2030-01-10T12:00",endsAt:"2030-01-10T13:00",roomId:"room",bufferMinutes:"15"}))).rejects.toThrow("REDIRECT:/dashboard/coaching?saved=1");
    expect(mock.command).toHaveBeenCalledWith({workspaceId:"gym",userId:"accepted-coach"},expect.objectContaining({kind:"createAvailability",enrollmentId:undefined,input:expect.objectContaining({startsAt:"2030-01-10T12:00",endsAt:"2030-01-10T13:00",roomId:"room",bufferMinutes:"15"})}));
  });
});
