"use server";
import { getOwnerGymWebsite, publishGymWebsite, saveGymWebsiteDraft, WebsiteError, websiteOfferFromPlan } from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
export interface WebsiteFormState { error: string | null; success: string | null }
export async function saveWebsiteAction(_state: WebsiteFormState, form: FormData): Promise<WebsiteFormState> {
  const context = await requireOwnerWorkspaceContext();
  const actor = { workspaceId: context.workspace.id, userId: context.session.userId };
  try {
    const data = await getOwnerGymWebsite(actor);
    const offers = data.plans.map((plan) => websiteOfferFromPlan(plan, { name: String(form.get(`name-${plan.id}`) ?? plan.name), description: String(form.get(`description-${plan.id}`) ?? ""), visible: form.get(`visible-${plan.id}`) === "on", highlighted: form.get("highlighted") === plan.id }));
    const content = Object.fromEntries(["title", "description", "headline", "introduction", "contactEmail", "seoTitle", "seoDescription", "shareImageUrl"].map((key) => [key, String(form.get(key) ?? "")]));
    await saveGymWebsiteDraft(actor, { slug: String(form.get("slug")), expectedVersion: Number(form.get("version")), content: { ...content, offers } });
    revalidatePath("/dashboard/website");
    return { error: null, success: "Draft saved. The public website has not changed." };
  } catch (error) { return { error: error instanceof WebsiteError ? error.message : "The draft could not be saved. Please try again.", success: null }; }
}
export async function publishWebsiteAction(_state: WebsiteFormState, form: FormData): Promise<WebsiteFormState> {
  const context = await requireOwnerWorkspaceContext();
  try {
    await publishGymWebsite({ workspaceId: context.workspace.id, userId: context.session.userId }, Number(form.get("version")), form.get("confirmed") === "on");
    revalidatePath("/dashboard/website");
    return { error: null, success: "Published. Visitors now see this reviewed version." };
  } catch (error) { return { error: error instanceof WebsiteError ? error.message : "The website could not be published. Please try again.", success: null }; }
}
