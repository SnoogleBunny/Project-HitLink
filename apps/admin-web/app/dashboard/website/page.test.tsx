import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), load: vi.fn(), head: vi.fn() }));
vi.mock("../../../lib/owner-workspace", () => ({ requireOwnerWorkspaceContext: mocks.owner }));
vi.mock("@flowstate/db", () => ({ getOwnerGymWebsite: mocks.load, websiteOfferFromPlan: vi.fn(), prisma: { workspaceWebsite: { findFirst: mocks.head } } }));
vi.mock("../../_components/admin-shell", () => ({ AdminShell: ({ children }: PropsWithChildren) => <main>{children}</main> }));
vi.mock("next/link", () => ({ default: ({ children, href }: PropsWithChildren<{ href: string }>) => <a href={href}>{children}</a> }));
vi.mock("@flowstate/ui", () => ({ Badge: ({ children }: PropsWithChildren) => <span>{children}</span>, Money: () => null, Notice: ({ children }: PropsWithChildren) => <div role="status">{children}</div> }));
vi.mock("./editor", () => ({ WebsiteEditor: ({ pricing, discovery }: { pricing: ReactNode; discovery: ReactNode }) => <>{pricing}{discovery}</> }));
vi.mock("./forms", () => ({ WebsiteDraftForm: ({ children, version }: PropsWithChildren<{ version: number }>) => <form data-draft-version={version}>{children}</form>, WebsitePublishForm: ({ version }: { version: number }) => <form data-review-version={version} /> }));
import WebsitePage from "./page";
function owner(status = "ACTIVE") {
  mocks.owner.mockResolvedValue({ workspace: { id: "workspace", name: "Fictional gym", status }, session: { userId: "owner" } });
}
function published(status = "ACTIVE", matching = true) {
  const snapshot = { title: "Reviewed public terms" };
  owner(status);
  mocks.load.mockResolvedValue({ website: { id: "website", slug: "fictional-gym", draftVersion: 1, publishedVersion: 1, publishedAt: new Date() }, draft: null, plans: [] });
  mocks.head.mockResolvedValue({ draftVersion: 1, publishedVersion: 1, publishedAt: new Date(), published: snapshot, publications: [{ version: 1, snapshot: matching ? snapshot : { title: "Other terms" } }], workspace: { status } });
}
const publicationQuery = { websiteResult: "published", version: "1", publicVersion: "1" };
beforeEach(() => {
  vi.resetAllMocks(); (globalThis as typeof globalThis & { React: typeof React }).React = React;
  owner();
  mocks.load.mockResolvedValue({ website: { id: "website", slug: "fictional-gym", draftVersion: 1, publishedVersion: null, publishedAt: null }, draft: null, plans: [] });
});
describe("website document completion rendering", () => {
  it.each(["ACTIVE", "SETUP_INCOMPLETE"])("renders saved feedback and current form version after the persisted head matches in %s", async (status) => {
    owner(status);
    mocks.head.mockResolvedValue({ draftVersion: 1, publishedVersion: null, workspace: { status } });
    const html = renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve({ websiteResult: "saved", version: "1", publicVersion: "0" }) }));
    expect(html).toContain("Draft saved. The public website has not changed.");
    expect(html).toContain('data-draft-version="1"'); expect(html).toContain('role="status"');
    expect(mocks.head.mock.calls[0]?.[0].where.workspaceId).toBe("workspace");
  });
  it("does not treat a manually supplied positive URL as proof when the persisted version differs", async () => {
    mocks.head.mockResolvedValue({ draftVersion: 2, publishedVersion: null, workspace: { status: "ACTIVE" } });
    const html = renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve({ websiteResult: "saved", version: "1", publicVersion: "0" }) }));
    expect(html).not.toContain("Draft saved."); expect(html).not.toContain('role="status"');
  });
  it.each([true, false])("publication feedback requires exact immutable snapshot evidence, matching=%s", async (matching) => {
    published("ACTIVE", matching);
    const html = renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve(publicationQuery) }));
    expect(html.includes("Published. Visitors now see this reviewed version.")).toBe(matching);
    expect(html).toContain("Visitors see version 1.");
  });
  it("shows committed setup publication and summary without claiming current public visibility", async () => {
    published("SETUP_INCOMPLETE");
    const html = renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve(publicationQuery) }));
    expect(html).toContain("Published. This reviewed version will become public when your workspace is active.");
    expect(html).toContain("Version 1 is published for launch. It becomes public when your workspace is active.");
    expect(html).not.toContain("Visitors now see"); expect(html).not.toContain("Visitors see version");
  });
  it("denies disabled completion feedback and does not describe the saved version as public", async () => {
    published("DISABLED");
    const html = renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve(publicationQuery) }));
    expect(html).not.toContain('role="status"');
    expect(html).toContain("Published version 1 is currently hidden.");
    expect(html).not.toContain("Visitors now see"); expect(html).not.toContain("Visitors see version");
  });
  it("changes notice and summary with current server/database status on later document GETs", async () => {
    published("ACTIVE");
    const active = renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve(publicationQuery) }));
    published("SETUP_INCOMPLETE");
    const setup = renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve(publicationQuery) }));
    expect(active).toContain("Visitors now see"); expect(active).toContain("Visitors see version 1.");
    expect(setup).toContain("will become public when your workspace is active.");
    expect(setup).not.toContain("Visitors now see"); expect(setup).not.toContain("Visitors see version");
  });
});
