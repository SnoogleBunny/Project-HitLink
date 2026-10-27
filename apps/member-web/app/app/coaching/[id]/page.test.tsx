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
  getCoachingSettlement: vi.fn().mockResolvedValue(null),
  getCoachingExportHistory: vi.fn().mockResolvedValue([]),
  getWorkspaceDateString: () => "2026-10-25",
}));
vi.mock("../../../../lib/member-auth", () => ({
  requireMemberPortalContext: mock.context,
}));
vi.mock("../../../_components/member-shell", () => ({
  MemberShell: ({ children, title }: PropsWithChildren<{ title: string }>) => (
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
  CoachingRecordsPanel: () => <section>Record consent controls</section>,
}));
vi.mock("../../../../lib/coaching-pause-fields", () => ({
  CoachingPauseFields: () => <div>Pause dates</div>,
}));
import CoachingProgramPage from "./page";
function detail() {
  return {
    version: 2,
    memberId: "adult",
    memberName: "Adult Client",
    programName: "Steady program",
    coachName: "Accepted Coach",
    status: "ACTIVE",
    paymentState: "PAID",
    settlementState: "NONE",
    includedUnits: 1,
    reservedOrUsedUnits: 0,
    startsOn: new Date("2026-10-01Z"),
    endsOn: new Date("2026-11-01Z"),
    timezone: "UTC",
    closedAt: null,
    accepted: true,
    coachAccepted: true,
    contactVerified: true,
    plan: {
      number: 1,
      goals: "Accepted shared goal",
      responseHours: 48,
      priceCents: 10000,
      currency: "cad",
      terms: "Accepted terms",
      deliveryWeekdays: [1, 3, 5],
    },
    intake: { content: "Authorized intake" },
    milestones: [
      { id: "milestone", title: "Accepted milestone", completedAt: null },
    ],
    published: [
      {
        id: "published",
        localDate: new Date("2026-10-25Z"),
        status: "PUBLISHED",
        publishedAt: new Date("2026-10-25Z"),
        revisions: [
          {
            number: 1,
            publishedAt: new Date("2026-10-25Z"),
            body: "Authorized published note",
          },
        ],
      },
    ],
    appointments: [],
    availability: [],
  };
}
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  vi.clearAllMocks();
  mock.context.mockResolvedValue({
    workspace: { id: "gym" },
    session: { userId: "adult-account" },
    member: { id: "selected-child" },
  });
  mock.detail.mockResolvedValue(detail());
});
const render = async (query: { view?: string; payment?: string } = {}) =>
  renderToStaticMarkup(
    await CoachingProgramPage({
      params: Promise.resolve({ id: "enrollment" }),
      searchParams: Promise.resolve(query),
    }),
  );
describe("client coaching destinations", () => {
  it("localizes visible delivery dates while retaining ISO acceptance inputs and My day keys", async () => {
    mock.context.mockResolvedValue({
      workspace: { id: "gym", settings: { locale: "de-DE" } },
      session: { userId: "adult-account" },
      member: { id: "adult" },
    });
    mock.detail.mockResolvedValue({
      ...detail(),
      proposedCoachName: "Next Coach",
    });
    const html = await render({ view: "program" });
    expect(html).toContain("01.10.2026");
    expect(html).toContain('name="historyFromDate"');
    expect(html).toContain('value="2026-10-01"');
    const day = await render();
    expect(day).toContain("25.10.2026");
    expect(day.match(/Authorized published note/g)).toHaveLength(1);
  });

  it("makes My day a published-note view distinct from plan approvals and account records", async () => {
    const html = await render();
    expect(html).toContain("<h1>My day</h1>");
    expect(html).toContain("Authorized published note");
    expect(html.match(/Authorized published note/g)).toHaveLength(1);
    expect(html).not.toContain("Authorized intake");
    expect(html).not.toContain("Accepted shared goal");
    expect(html).not.toContain("My program records");
    expect(html).not.toContain('data-kind="bookAppointment"');
    expect(mock.context).toHaveBeenCalledWith({ scope: "account" });
    expect(mock.detail).toHaveBeenCalledWith(
      { workspaceId: "gym", userId: "adult-account" },
      "enrollment",
    );
  });
  it("keeps accepted plan, intake, milestones, changes and records in My program", async () => {
    const html = await render({ view: "program" });
    expect(html).toContain("<h1>My program</h1>");
    expect(html).toContain("Accepted shared goal");
    expect(html).toContain("Authorized intake");
    expect(html).toContain("Accepted milestone");
    expect(html).toContain("Accepted program terms");
    expect(html).toContain("Accepted terms");
    expect(html).toContain("My program records");
    expect(html).not.toContain("Authorized published note");
    expect(html).not.toContain('data-kind="bookAppointment"');
    expect(html).toContain('value="program"');
  });
  it("renders the appointment destination separately when the program includes it", async () => {
    const html = await render({ view: "appointments" });
    expect(html).toContain("<h1>My appointment</h1>");
    expect(html).toContain('data-kind="bookAppointment"');
    expect(html).not.toContain("Authorized published note");
    expect(html).not.toContain("My program records");
  });
  it("omits appointment navigation for notes-only programs and resolves old links to My program", async () => {
    mock.detail.mockResolvedValue({ ...detail(), includedUnits: 0 });
    expect(await render()).not.toContain(">My appointment</a>");
    await expect(render({ view: "appointments" })).rejects.toThrow(
      "REDIRECT:/app/coaching/enrollment?view=program",
    );
  });
  it("returns hosted-payment recovery to My program without asserting activation", async () => {
    mock.detail.mockResolvedValue({
      ...detail(),
      status: "ONBOARDING",
      paymentState: "PENDING",
      checkoutAvailable: true,
    });
    const html = await render({ payment: "returned" });
    expect(html).toContain("<h1>My program</h1>");
    expect(html).toContain("Payment is awaiting confirmation");
    expect(html).toContain('data-kind="checkPayment"');
    expect(html).not.toContain("Payment confirmed.");
  });
  it("gives a not-yet-active client a named plan review instead of a blank daily feed", async () => {
    mock.detail.mockResolvedValue({
      ...detail(),
      status: "ONBOARDING",
      paymentState: "UNPAID",
      accepted: false,
    });
    const html = await render();
    expect(html).toContain("Review my program");
    expect(html).not.toContain('data-kind="acceptPlan"');
  });
});
