import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  detail: vi.fn(),
  context: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@flowstate/db", () => ({
  getCoachingDetail: mock.detail,
  getCoachingWorkspace: vi
    .fn()
    .mockResolvedValue({ coaches: [], programs: [] }),
  getCoachingSettlement: vi.fn().mockResolvedValue(null),
  getCoachingExportHistory: vi.fn().mockResolvedValue([]),
  getWorkspaceDateString: () => "2026-10-25",
}));
vi.mock("../../../../lib/operations-workspace", () => ({
  requireOperationsWorkspaceContext: mock.context,
}));
vi.mock("../../../_components/admin-shell", () => ({
  AdminShell: ({ children, title }: PropsWithChildren<{ title: string }>) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("../form", () => ({
  CoachingForm: ({
    children,
    kind,
    returnView,
    submit,
  }: PropsWithChildren<{
    kind: string;
    returnView?: string;
    submit?: string;
  }>) => (
    <form data-kind={kind}>
      <input name="returnView" value={returnView} readOnly />
      {children}
      <button>{submit}</button>
    </form>
  ),
}));
vi.mock("./records-panel", () => ({
  CoachingRecordsPanel: () => <section>Record review controls</section>,
}));
import CoachingClientPage from "./page";

function detail() {
  return {
    version: 2,
    memberId: "adult",
    memberName: "Adult Client",
    programName: "Steady program",
    coachName: "Accepted Coach",
    coach: true,
    owner: false,
    status: "ACTIVE",
    paymentState: "PAID",
    settlementState: "NONE",
    includedUnits: 1,
    reservedOrUsedUnits: 0,
    startsOn: new Date("2026-10-01Z"),
    endsOn: new Date("2026-11-01Z"),
    timezone: "UTC",
    closedAt: null,
    plan: {
      number: 1,
      goals: "Accepted shared goal",
      responseHours: 48,
      priceCents: 10000,
      currency: "cad",
      terms: "Accepted terms",
    },
    intake: { content: "Authorized intake" },
    milestones: [],
    drafts: [
      {
        id: "draft",
        localDate: new Date("2026-10-25Z"),
        status: "DRAFT",
        draftBody: "Unpublished client draft",
        version: 1,
        publishedAt: null,
      },
    ],
    privateNotes: [
      {
        id: "private",
        localDate: new Date("2026-10-25Z"),
        body: "Author private working text",
        version: 1,
      },
    ],
    published: [
      {
        id: "published",
        localDate: new Date("2026-10-24Z"),
        status: "PUBLISHED",
        revisions: [
          {
            number: 1,
            publishedAt: new Date("2026-10-24Z"),
            body: "Authorized published note",
          },
        ],
      },
    ],
    appointments: [],
    availability: [],
    deliveryExceptions: [],
  };
}
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  vi.clearAllMocks();
  mock.context.mockResolvedValue({
    workspace: { id: "gym", name: "Gym" },
    session: { userId: "coach" },
  });
  mock.detail.mockResolvedValue(detail());
});
const render = async (view?: string) =>
  renderToStaticMarkup(
    await CoachingClientPage({
      params: Promise.resolve({ id: "enrollment" }),
      searchParams: Promise.resolve({ view }),
    }),
  );

describe("focused coaching client sections", () => {
  it("uses the configured locale for visible program dates", async () => {
    mock.context.mockResolvedValue({
      workspace: { id: "gym", name: "Gym", settings: { locale: "de-DE" } },
      session: { userId: "coach" },
    });
    const html = await render();
    expect(html).toContain("01.10.2026");
  });

  it("starts at Plan without serializing draft/private notes or appointment forms into that view", async () => {
    const html = await render();
    expect(html).toContain("Authorized intake");
    expect(html).toContain("Accepted shared goal");
    expect(html).not.toContain("Unpublished client draft");
    expect(html).not.toContain("Author private working text");
    expect(html).not.toContain('data-kind="bookAppointment"');
    expect(mock.detail).toHaveBeenCalledWith(
      { workspaceId: "gym", userId: "coach" },
      "enrollment",
    );
  });
  it("renders authored client drafts and clearly separate private notes only in Notes", async () => {
    const html = await render("notes");
    expect(html).toContain("Unpublished client draft");
    expect(html).toContain("Author private working text");
    expect(html).toContain("Authorized published note");
    expect(html).not.toContain("Authorized intake");
    expect(html).not.toContain("Accepted shared goal");
    expect(html).not.toContain('data-kind="bookAppointment"');
    expect(html).toContain('value="notes"');
  });
  it("renders appointment operations without mixing notes or program administration", async () => {
    const html = await render("appointments");
    expect(html).toContain('data-kind="bookAppointment"');
    expect(html).not.toContain("Unpublished client draft");
    expect(html).not.toContain("Author private working text");
    expect(html).not.toContain("Program administration");
  });
  it("resolves a notes-only program's old appointment view to Plan", async () => {
    mock.detail.mockResolvedValue({ ...detail(), includedUnits: 0 });
    await expect(render("appointments")).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/enrollment?view=plan",
    );
  });
  it("does not grant a metadata-only owner a Notes view or private content", async () => {
    mock.detail.mockResolvedValue({
      ...detail(),
      coach: false,
      owner: true,
      plan: null,
      intake: null,
    });
    await expect(render("notes")).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/enrollment?view=plan",
    );
    const html = await render("manage");
    expect(html).toContain("Program administration");
    expect(html).not.toContain("Unpublished client draft");
    expect(html).not.toContain("Author private working text");
    expect(html).not.toContain("Authorized published note");
  });
  it("keeps owner-only program actions unavailable to a coach", async () => {
    await expect(render("manage")).rejects.toThrow(
      "REDIRECT:/dashboard/coaching/enrollment?view=plan",
    );
  });
});
