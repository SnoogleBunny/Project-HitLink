"use client";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Notice } from "@flowstate/ui";
import { publishWebsiteAction, saveWebsiteAction } from "./actions";
function Submit({ label }: { label: string }) { const { pending } = useFormStatus(); return <button className="button" disabled={pending} type="submit">{pending ? "Saving…" : label}</button>; }
export function WebsiteDraftForm({ children, version }: { children: ReactNode; version: number }) {
  const [state, action] = useActionState(saveWebsiteAction, { error: null, success: null });
  return <form action={action} className="form-stack"><input type="hidden" name="version" value={version} />{state.error ? <Notice tone="danger">{state.error}</Notice> : state.success ? <Notice tone="success">{state.success}</Notice> : null}{children}<div className="dashboard-actions"><Submit label="Save draft" /></div></form>;
}
export function WebsitePublishForm({ version }: { version: number }) {
  const [state, action] = useActionState(publishWebsiteAction, { error: null, success: null });
  return <form action={action} className="form-stack"><input type="hidden" name="version" value={version} />{state.error ? <Notice tone="danger">{state.error}</Notice> : state.success ? <Notice tone="success">{state.success}</Notice> : null}<label><input type="checkbox" name="confirmed" required /> I reviewed this draft and its prices, class limits and operational cancellation terms.</label><div className="dashboard-actions"><Submit label="Publish reviewed draft" /></div></form>;
}
