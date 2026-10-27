"use server";
import { getOwnerGymWebsite, publishGymWebsite, saveGymWebsiteDraft, WebsiteError, websiteOfferFromPlan } from "@flowstate/db";
import { redirect } from "next/navigation";
import { websiteCompletionUrl, type WebsiteCompletion } from "./completion";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
export interface WebsiteFormState { error: string | null; success: string | null; completion: WebsiteCompletion | null }
export async function saveWebsiteAction(_state: WebsiteFormState, form: FormData): Promise<WebsiteFormState> {
  const context = await requireOwnerWorkspaceContext();
  const actor = { workspaceId: context.workspace.id, userId: context.session.userId };
  try {
    const data = await getOwnerGymWebsite(actor);
    const offers = data.plans.map((plan) => websiteOfferFromPlan(plan, { name: String(form.get(`name-${plan.id}`) ?? plan.name), description: String(form.get(`description-${plan.id}`) ?? ""), visible: form.get(`visible-${plan.id}`) === "on", highlighted: form.get("highlighted") === plan.id }));
    const content = Object.fromEntries(["title", "description", "headline", "introduction", "contactEmail", "seoTitle", "seoDescription", "shareImageUrl"].map((key) => [key, String(form.get(key) ?? "")]));
    const saved = await saveGymWebsiteDraft(actor, { slug: String(form.get("slug")), expectedVersion: Number(form.get("version")), content: { ...content, offers } });
    return { error: null, success: null, completion: { kind: "saved", version: saved.draftVersion, publicVersion: saved.publishedVersion } };
  } catch (error) { return { error: error instanceof WebsiteError ? error.message : "The draft could not be saved. Please try again.", success: null, completion: null }; }
}
export async function publishWebsiteAction(_state: WebsiteFormState, form: FormData): Promise<WebsiteFormState> {
  const context = await requireOwnerWorkspaceContext();
  try {
    const published = await publishGymWebsite({ workspaceId: context.workspace.id, userId: context.session.userId }, Number(form.get("version")), form.get("confirmed") === "on");
    if (published.publishedVersion === null) throw new Error("Missing committed publication version.");
    return { error: null, success: null, completion: { kind: "published", version: published.publishedVersion, publicVersion: published.publishedVersion } };
  } catch (error) { return { error: error instanceof WebsiteError ? error.message : "The website could not be published. Please try again.", success: null, completion: null }; }
}

/** Native/pre-hydration fallback only. Hydrated forms prevent this dispatch. */
export async function saveWebsiteFallbackAction(state: WebsiteFormState, form: FormData): Promise<WebsiteFormState> {
  const result = await saveWebsiteAction(state, form);
  if (result.completion && !result.error) redirect(websiteCompletionUrl(result.completion, String(form.get("section") ?? "pricing")));
  return result;
}
export async function publishWebsiteFallbackAction(state: WebsiteFormState, form: FormData): Promise<WebsiteFormState> {
  const result = await publishWebsiteAction(state, form);
  if (result.completion && !result.error) redirect(websiteCompletionUrl(result.completion, String(form.get("section") ?? "pricing")));
  return result;
}
