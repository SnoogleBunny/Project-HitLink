import React, { type FormEvent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  save: vi.fn(), publish: vi.fn(), nativeSave: vi.fn(), nativePublish: vi.fn(), nativeDispatch: vi.fn(), actionHook: vi.fn(), assign: vi.fn(),
  values: [] as unknown[], refs: [] as Array<{ current: unknown }>, stateCursor: 0, refCursor: 0, nativePending: false,
  fallback: { error: null as string | null, success: null, completion: null },
}));
vi.mock("./actions", () => ({ saveWebsiteAction: mocks.save, publishWebsiteAction: mocks.publish, saveWebsiteFallbackAction: mocks.nativeSave, publishWebsiteFallbackAction: mocks.nativePublish }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: (...args: unknown[]) => { mocks.actionHook(...args); return [mocks.fallback, mocks.nativeDispatch, mocks.nativePending]; },
  useEffect: () => {},
  useRef: (initial: unknown) => { const index = mocks.refCursor++; return mocks.refs[index] ?? (mocks.refs[index] = { current: initial }); },
  useState: (initial: unknown) => { const index = mocks.stateCursor++; if (!(index in mocks.values)) mocks.values[index] = initial; return [mocks.values[index], (value: unknown) => { mocks.values[index] = value; }]; },
}));
import { WebsiteDraftForm, WebsitePublishForm } from "./forms";
const NativeFormData = globalThis.FormData;
type FormProps = { action: unknown; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; onReset: (event: { preventDefault(): void }) => void; children: ReactNode };
function renderForm(kind: "saved" | "published", version = 3) {
  mocks.stateCursor = 0; mocks.refCursor = 0;
  const outer = kind === "saved" ? WebsiteDraftForm({ version, children: <input name="title" defaultValue="Typed draft" /> }) : WebsitePublishForm({ version });
  return (outer.type as (props: Record<string, unknown>) => ReactElement<FormProps>)(outer.props);
}
function submission() {
  const fields = { version: "3", title: "Typed draft", introduction: "Typed introduction", confirmed: "on" };
  return { fields, event: { preventDefault: vi.fn(), currentTarget: { fields } } as unknown as FormEvent<HTMLFormElement> };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.values = []; mocks.refs = []; mocks.stateCursor = 0; mocks.refCursor = 0; mocks.nativePending = false;
  mocks.fallback = { error: null, success: null, completion: null };
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  vi.stubGlobal("window", { location: { hash: "#discovery", assign: mocks.assign } });
  vi.stubGlobal("FormData", class extends NativeFormData {
    constructor(form?: { fields: Record<string, string> }) { super(); for (const [key, value] of Object.entries(form?.fields ?? {})) this.set(key, value); }
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
describe("website hydrated completion and progressive fallback", () => {
  it("keeps native action/permalink wiring and exact publication consent available for progressive fallback", () => {
    const form = renderForm("published"), html = renderToStaticMarkup(form);
    expect(form.props.action).toBe(mocks.nativeDispatch);
    expect(mocks.actionHook).toHaveBeenCalledWith(mocks.nativePublish, { error: null, success: null, completion: null }, "/dashboard/website");
    expect(html).toContain('name="version" value="3"'); expect(html).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*name="confirmed")(?=[^>]*required="")[^>]*>/);
    expect(html).toContain("I reviewed this draft and its prices, class limits and operational cancellation terms.");
  });
  it("prevents React/native submission before invoking the direct action exactly once and ignores a double submit", async () => {
    let settle!: (value: unknown) => void;
    mocks.save.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    const form = renderForm("saved"), one = submission(), two = submission();
    const request = form.props.onSubmit(one.event), duplicate = form.props.onSubmit(two.event);
    expect(one.event.preventDefault).toHaveBeenCalledTimes(1); expect(two.event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.nativeDispatch).not.toHaveBeenCalled(); expect(mocks.nativeSave).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(renderForm("saved"))).toContain("Saving…");
    settle({ error: null, success: null, completion: { kind: "saved", version: 4, publicVersion: 2 } });
    await Promise.all([request, duplicate]);
    expect(mocks.assign).toHaveBeenCalledTimes(1);
    expect(mocks.assign).toHaveBeenCalledWith("/dashboard/website?websiteResult=saved&version=4&publicVersion=2#discovery");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("navigates to the confirmed publication version only after its direct action resolves", async () => {
    mocks.publish.mockResolvedValue({ error: null, success: null, completion: { kind: "published", version: 3, publicVersion: 3 } });
    await renderForm("published").props.onSubmit(submission().event);
    expect(mocks.publish).toHaveBeenCalledTimes(1); expect(mocks.assign).toHaveBeenCalledWith("/dashboard/website?websiteResult=published&version=3&publicVersion=3#discovery");
    expect(mocks.nativeDispatch).not.toHaveBeenCalled();
  });
  it("retains typed entries, original version and active tab on a stale rejection without navigating or retrying", async () => {
    mocks.save.mockResolvedValue({ error: "This draft changed. Reload it before saving.", success: null, completion: null });
    const input = submission(); await renderForm("saved").props.onSubmit(input.event);
    const html = renderToStaticMarkup(renderForm("saved", 99));
    expect(html).toContain('name="version" value="3"'); expect(html).toContain("This draft changed."); expect(html).toContain('role="alert"');
    expect(input.fields).toEqual({ version: "3", title: "Typed draft", introduction: "Typed introduction", confirmed: "on" });
    expect(window.location.hash).toBe("#discovery"); expect(mocks.assign).not.toHaveBeenCalled(); expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(html).not.toContain("Saving…");
  });
  it("preserves entries with a bounded uncertain-error message and never automatically replays", async () => {
    mocks.save.mockRejectedValue(new Error("FICTIONAL_PRIVATE_TRANSPORT_DETAILS"));
    const input = submission(); await renderForm("saved").props.onSubmit(input.event);
    const html = renderToStaticMarkup(renderForm("saved"));
    expect(html).toContain("could not be confirmed"); expect(html).not.toContain("FICTIONAL_PRIVATE_TRANSPORT_DETAILS");
    expect(input.fields.title).toBe("Typed draft"); expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("prevents native/React form reset so an error cannot clear the uncontrolled draft", () => {
    const preventDefault = vi.fn(); renderForm("saved").props.onReset({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
  it("does not issue a hydrated command over an already pending progressive submission", async () => {
    mocks.nativePending = true; const input = submission(); await renderForm("saved").props.onSubmit(input.event);
    expect(input.event.preventDefault).toHaveBeenCalledTimes(1); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("does not navigate on an invalid or wrong-kind completion object", async () => {
    for (const completion of [null, { kind: "published", version: 3, publicVersion: 3 }, { kind: "saved", version: 0, publicVersion: null }]) {
      mocks.save.mockResolvedValueOnce({ error: null, success: "Untrusted success text", completion });
      await renderForm("saved").props.onSubmit(submission().event);
    }
    expect(mocks.assign).not.toHaveBeenCalled(); expect(mocks.nativeDispatch).not.toHaveBeenCalled();
  });
});
