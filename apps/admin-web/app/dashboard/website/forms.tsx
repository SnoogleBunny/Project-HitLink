"use client";
import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { publishWebsiteAction, publishWebsiteFallbackAction, saveWebsiteAction, saveWebsiteFallbackAction, type WebsiteFormState } from "./actions";
import { websiteCompletionUrl } from "./completion";

const initialState: WebsiteFormState = { error: null, success: null, completion: null };
function WebsiteForm({ children, version, kind }: { children?: ReactNode; version: number; kind: "saved" | "published" }) {
  // This hook supplies progressive enhancement only; hydrated completion never
  // dispatches it or depends on its pending/result transition.
  const [fallback, nativeAction, nativePending] = useActionState(kind === "saved" ? saveWebsiteFallbackAction : publishWebsiteFallbackAction, initialState, "/dashboard/website");
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const originalVersion = useRef(version), inFlight = useRef(false), errorElement = useRef<HTMLParagraphElement>(null);
  const message = error ?? fallback.error;
  useEffect(() => { if (message) errorElement.current?.focus(); }, [message]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || nativePending) return;
    inFlight.current = true;
    const form = new FormData(event.currentTarget);
    setError(null); setPending(true);
    let navigating = false;
    try {
      const result = await (kind === "saved" ? saveWebsiteAction : publishWebsiteAction)(initialState, form);
      if (result.error || !result.completion || result.completion.kind !== kind) {
        setError(result.error ?? "The website change could not be confirmed. Your entries are still here. Reload before trying again.");
        return;
      }
      const destination = websiteCompletionUrl(result.completion, window.location.hash);
      window.location.assign(destination);
      navigating = true;
    } catch {
      setError("The website change could not be confirmed. Your entries are still here. Reload before trying again.");
    } finally {
      if (!navigating) { inFlight.current = false; setPending(false); }
    }
  }
  return <form action={nativeAction} onSubmit={submit} onReset={(event) => event.preventDefault()} className="form-stack">
    <input type="hidden" name="version" value={originalVersion.current} />
    <input type="hidden" name="section" value="pricing" />
    {message ? <p className="form-error" role="alert" tabIndex={-1} ref={errorElement}>{message}</p> : null}
    {children}
    {kind === "published" ? <label><input type="checkbox" name="confirmed" required /> I reviewed this draft and its prices, class limits and operational cancellation terms.</label> : null}
    <div className="dashboard-actions"><button className="button" disabled={pending || nativePending} type="submit">{pending || nativePending ? "Saving…" : kind === "saved" ? "Save draft" : "Publish reviewed draft"}</button></div>
  </form>;
}
export function WebsiteDraftForm({ children, version }: { children: ReactNode; version: number }) { return <WebsiteForm version={version} kind="saved">{children}</WebsiteForm>; }
export function WebsitePublishForm({ version }: { version: number }) { return <WebsiteForm version={version} kind="published" />; }
