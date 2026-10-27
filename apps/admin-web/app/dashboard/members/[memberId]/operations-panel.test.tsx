import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CurrentMemberOperation,
  MemberOperationsView,
} from "@flowstate/db";
import {
  initialMemberOperationsFormState,
  memberOperationsScopeKey,
} from "./operations-state";
const mocks = vi.hoisted(() => ({
  state: undefined as unknown,
  notice: null as unknown,
}));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useActionState: (_action: unknown, initial: unknown) => [
      mocks.state ?? initial,
      vi.fn(),
      false,
    ],
    useState: (initial: unknown) =>
      initial === null ? [mocks.notice, vi.fn()] : original.useState(initial),
  };
});
vi.mock("./operations-actions", () => ({
  changeMemberOperationsAction: vi.fn(),
}));
import { MemberOperationsPanel, OperationsForm } from "./operations-panel";
const key = "note:00000000-0000-4000-8000-000000000001";
const scope = { memberId: "member-1" };
const record: CurrentMemberOperation = {
  recordKey: key,
  recordKind: "NOTE",
  version: 2,
  visibility: "ASSIGNED_OPERATIONS",
  noteBody: "Latest published class instruction",
  tagLabel: null,
  tagPurpose: null,
  actorName: "Fictional owner",
  createdAt: "2026-11-02T12:00:00Z",
  canAmend: true,
};
const view: MemberOperationsView = {
  memberId: scope.memberId,
  memberName: "Fictional participant",
  canChooseVisibility: true,
  canWrite: true,
  notes: [record],
  tags: [],
  nextNotesCursor: null,
};
beforeEach(() => {
  mocks.state = undefined;
  mocks.notice = null;
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
});
describe("operational editor renders acknowledged draft authority", () => {
  it("warns on newer server props without silently changing hidden draft version, record or operation identity", () => {
    mocks.state = initialMemberOperationsFormState({
      baseVersion: 1,
      recordKey: key,
      operationId: "original-draft-operation",
    });
    const html = renderToStaticMarkup(
      <OperationsForm
        scope={scope}
        operationId="new-rsc-operation"
        recordKey={key}
        record={record}
        kind="NOTE"
        canChooseVisibility
        onOutcome={vi.fn()}
      />,
    );
    expect(html).toContain('name="expectedVersion" value="1"');
    expect(html).not.toContain('name="expectedVersion" value="2"');
    expect(html).toContain(
      'name="operationId" value="original-draft-operation"',
    );
    expect(html).not.toContain('name="operationId" value="new-rsc-operation"');
    expect(html).toContain("A newer version of this record is available");
    expect(html).toContain("This draft still uses version 1");
  });
  it("renders a new form from the confirmed next request tuple rather than revalidation's random props", () => {
    mocks.state = {
      ...initialMemberOperationsFormState({
        baseVersion: 0,
        recordKey: "note:00000000-0000-4000-8000-000000000002",
        operationId: "confirmed-next-operation",
      }),
      confirmedVersion: 1,
      success: "Operational change saved with its author and history.",
    };
    const html = renderToStaticMarkup(
      <OperationsForm
        scope={scope}
        operationId="unrelated-rsc-request"
        recordKey="note:unrelated-rsc-prop"
        kind="NOTE"
        canChooseVisibility
        onOutcome={vi.fn()}
      />,
    );
    expect(html).toContain('name="expectedVersion" value="0"');
    expect(html).toContain(
      'name="operationId" value="confirmed-next-operation"',
    );
    expect(html).toContain(
      'name="recordKey" value="note:00000000-0000-4000-8000-000000000002"',
    );
    expect(html).not.toContain("A newer version of this record is available");
  });
  it("keeps the stable parent confirmation visible even after the saved/retracted row is absent from refreshed props", () => {
    mocks.notice = {
      scopeKey: memberOperationsScopeKey(scope),
      message: "Operational change saved with its author and history.",
    };
    const html = renderToStaticMarkup(
      <MemberOperationsPanel
        view={{ ...view, notes: [] }}
        scope={scope}
        operationIds={{ newNote: "new-rsc-note", newTag: "new-rsc-label" }}
        noteKey="note:00000000-0000-4000-8000-000000000003"
        locale="en-CA"
        timezone="UTC"
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(
      "Operational change saved with its author and history.",
    );
    expect(html).toContain("No current operational notes.");
  });
  it("does not carry a prior member's save announcement into another explicit target", () => {
    mocks.notice = {
      scopeKey: memberOperationsScopeKey({ memberId: "other-member" }),
      message: "Prior target confirmation",
    };
    const html = renderToStaticMarkup(
      <MemberOperationsPanel
        view={view}
        scope={scope}
        operationIds={{
          [key]: "edit-rsc",
          newNote: "new-rsc-note",
          newTag: "new-rsc-label",
        }}
        noteKey="note:00000000-0000-4000-8000-000000000003"
        locale="en-CA"
        timezone="UTC"
      />,
    );
    expect(html).not.toContain("Prior target confirmation");
    expect(html).not.toContain('role="status"');
  });
});
