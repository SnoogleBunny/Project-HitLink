import { createHash } from "node:crypto";
import { Prisma, type MembershipPlan } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { parseMembershipLifecyclePolicy, type MembershipLifecyclePolicy } from "./membership-lifecycle-policy.js";

export class WebsiteError extends Error {}
export interface WebsiteOffer {
  id: string;
  membershipPlanId: string;
  termsVersion: number;
  name: string;
  description: string;
  visible: boolean;
  highlighted: boolean;
  monthlyPriceCents: number;
  currency: string;
  weeklyClassLimit: number | null;
  monthlyClassLimit: number | null;
  allowanceCountingMode: string;
  lateCancellationConsumesClass: boolean;
  noShowConsumesClass: boolean;
  cancellationPolicyReference: string | null;
  freezePolicyReference: string | null;
  programIds: string[];
  termsFingerprint: string;
  lifecyclePolicy?: MembershipLifecyclePolicy | null;
}
export interface GymWebsiteContent {
  title: string;
  description: string;
  headline: string;
  introduction: string;
  contactEmail: string;
  seoTitle: string;
  seoDescription: string;
  shareImageUrl: string;
  offers: WebsiteOffer[];
}
type PlanWithPrograms = MembershipPlan & { programRestrictions: Array<{ programId: string }> };
function operationalTerms(plan: PlanWithPrograms) {
  return { membershipPlanId: plan.id, termsVersion: plan.termsVersion, monthlyPriceCents: plan.monthlyPriceCents, currency: plan.currency.toLowerCase(), weeklyClassLimit: plan.weeklyClassLimit, monthlyClassLimit: plan.monthlyClassLimit, allowanceCountingMode: plan.allowanceCountingMode, lateCancellationConsumesClass: plan.lateCancellationConsumesClass, noShowConsumesClass: plan.noShowConsumesClass, cancellationPolicyReference: plan.cancellationPolicyReference, freezePolicyReference: plan.freezePolicyReference, lifecyclePolicy: parseMembershipLifecyclePolicy(plan.lifecyclePolicy), programIds: plan.programRestrictions.map((item) => item.programId).sort() };
}
export function websiteOfferFromPlan(plan: PlanWithPrograms, display?: Partial<Pick<WebsiteOffer, "name" | "description" | "visible" | "highlighted">>): WebsiteOffer {
  const terms = operationalTerms(plan);
  return { id: plan.id, ...terms, name: display?.name ?? plan.name, description: display?.description ?? plan.description ?? "", visible: display?.visible ?? false, highlighted: !!display?.visible && !!display?.highlighted, termsFingerprint: createHash("sha256").update(JSON.stringify(terms)).digest("hex") };
}
export function isPublishedOfferCurrent(offer: WebsiteOffer, plan: PlanWithPrograms): boolean {
  return !plan.archivedAt && offer.membershipPlanId === plan.id && offer.termsFingerprint === websiteOfferFromPlan(plan).termsFingerprint;
}
function required(value: unknown, label: string, max: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) throw new WebsiteError(`${label} is required and must be ${max} characters or fewer.`);
  return result;
}
export function parseGymWebsiteContent(value: unknown): GymWebsiteContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WebsiteError("Website content is invalid.");
  const input = value as Record<string, unknown>;
  const contactEmail = required(input.contactEmail, "Public contact email", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new WebsiteError("Enter a valid public contact email.");
  const shareImageUrl = String(input.shareImageUrl ?? "").trim();
  if (shareImageUrl) {
    const image = new URL(shareImageUrl);
    if (image.protocol !== "https:" || image.username || image.password) throw new WebsiteError("Use a public HTTPS sharing image URL.");
  }
  if (!Array.isArray(input.offers) || input.offers.length > 100) throw new WebsiteError("Choose up to 100 membership offers.");
  const offers = input.offers.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new WebsiteError("An offer is invalid.");
    const offer = entry as WebsiteOffer;
    return { ...offer, id: required(offer.id, "Offer ID", 150), membershipPlanId: required(offer.membershipPlanId, "Membership plan", 150), name: required(offer.name, "Offer name", 120), description: String(offer.description ?? "").trim().slice(0, 1000), visible: offer.visible === true, highlighted: offer.visible === true && offer.highlighted === true };
  });
  if (new Set(offers.map((offer) => offer.membershipPlanId)).size !== offers.length) throw new WebsiteError("A plan can appear only once.");
  if (offers.filter((offer) => offer.highlighted).length > 1) throw new WebsiteError("Highlight one visible plan or none.");
  return { title: required(input.title, "Gym name", 120), description: required(input.description, "Short gym description", 300), headline: required(input.headline, "Headline", 160), introduction: required(input.introduction, "Introduction", 3000), contactEmail, seoTitle: required(input.seoTitle, "Search title", 70), seoDescription: required(input.seoDescription, "Search description", 170), shareImageUrl, offers };
}
export async function getOwnerGymWebsite(actor: { workspaceId: string; userId: string }) {
  const owner = await prisma.workspaceUser.findFirst({ where: { workspaceId: actor.workspaceId, userId: actor.userId, role: "OWNER", isActive: true } });
  if (!owner) throw new WebsiteError("Only the owner can manage this website.");
  const [website, plans, workspace] = await Promise.all([
    prisma.workspaceWebsite.findUnique({ where: { workspaceId: actor.workspaceId } }),
    prisma.membershipPlan.findMany({ where: { workspaceId: actor.workspaceId, archivedAt: null }, include: { programRestrictions: { select: { programId: true } } }, orderBy: { name: "asc" } }),
    prisma.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId }, select: { name: true } }),
  ]);
  const draft = website ? parseGymWebsiteContent(website.draft) : null;
  return { website: website ? { id: website.id, slug: website.slug, draftVersion: website.draftVersion, publishedVersion: website.publishedVersion, publishedAt: website.publishedAt } : null, draft, plans, workspaceName: workspace.name };
}
export async function saveGymWebsiteDraft(actor: { workspaceId: string; userId: string }, input: { slug: string; expectedVersion: number; content: unknown }) {
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 60) throw new WebsiteError("Use a 3–60 character website name with lowercase letters, numbers and hyphens.");
  const draft = parseGymWebsiteContent(input.content);
  return prisma.$transaction(async (db) => {
    await lockClassSchedule(db, actor.workspaceId);
    if (!await db.workspaceUser.findFirst({ where: { workspaceId: actor.workspaceId, userId: actor.userId, role: "OWNER", isActive: true } })) throw new WebsiteError("Only the owner can edit this website.");
    const previous = await db.workspaceWebsite.findUnique({ where: { workspaceId: actor.workspaceId } });
    if ((previous?.draftVersion ?? 0) !== input.expectedVersion) throw new WebsiteError("This draft changed. Reload it before saving.");
    if (previous?.publishedAt && previous.slug !== slug) throw new WebsiteError("A published website keeps its address. Contact support before changing it.");
    if (await db.workspaceWebsite.findFirst({ where: { slug, workspaceId: { not: actor.workspaceId } } })) throw new WebsiteError("That website address is already in use.");
    const plans = await db.membershipPlan.findMany({ where: { workspaceId: actor.workspaceId, archivedAt: null }, include: { programRestrictions: { select: { programId: true } } } });
    const offers = draft.offers.map((display) => {
      const plan = plans.find((candidate) => candidate.id === display.membershipPlanId);
      if (!plan) throw new WebsiteError("A selected plan is unavailable. Refresh the draft before saving.");
      return websiteOfferFromPlan(plan, display);
    });
    const content = { ...draft, offers } as unknown as Prisma.InputJsonObject;
    return previous ? db.workspaceWebsite.update({ where: { id: previous.id, draftVersion: input.expectedVersion }, data: { draft: content, draftVersion: { increment: 1 } } }) : db.workspaceWebsite.create({ data: { workspaceId: actor.workspaceId, slug, draft: content } });
  });
}
export async function publishGymWebsite(actor: { workspaceId: string; userId: string }, expectedVersion: number, confirmed: boolean) {
  if (!confirmed) throw new WebsiteError("Review the preview and confirm the operational terms before publishing.");
  return prisma.$transaction(async (db) => {
    await lockClassSchedule(db, actor.workspaceId);
    if (!await db.workspaceUser.findFirst({ where: { workspaceId: actor.workspaceId, userId: actor.userId, role: "OWNER", isActive: true } })) throw new WebsiteError("Only the owner can publish this website.");
    const website = await db.workspaceWebsite.findUnique({ where: { workspaceId: actor.workspaceId } });
    if (!website || website.draftVersion !== expectedVersion) throw new WebsiteError("This draft changed. Reload and preview it again.");
    if (website.publishedVersion === expectedVersion) return website;
    const content = parseGymWebsiteContent(website.draft);
    const plans = await db.membershipPlan.findMany({ where: { workspaceId: actor.workspaceId, archivedAt: null }, include: { programRestrictions: { select: { programId: true } } } });
    for (const offer of content.offers.filter((item) => item.visible)) {
      const plan = plans.find((candidate) => candidate.id === offer.membershipPlanId);
      if (!plan || !isPublishedOfferCurrent(offer, plan)) throw new WebsiteError(`The operational terms for ${offer.name} changed. Save and preview a refreshed draft before publishing.`);
      if (!offer.cancellationPolicyReference) throw new WebsiteError(`Set the cancellation policy for ${offer.name} before publishing it.`);
    }
    await db.websitePublication.create({ data: { workspaceId: actor.workspaceId, websiteId: website.id, version: expectedVersion, snapshot: website.draft as Prisma.InputJsonValue, actorUserId: actor.userId } });
    return db.workspaceWebsite.update({ where: { id: website.id }, data: { published: website.draft as Prisma.InputJsonValue, publishedVersion: expectedVersion, publishedAt: new Date() } });
  });
}
export async function getPublishedGymWebsite(slug: string) {
  const website = await prisma.workspaceWebsite.findUnique({ where: { slug }, select: { workspaceId: true, slug: true, published: true, publishedVersion: true, publishedAt: true, workspace: { select: { status: true } } } });
  if (!website?.published || !website.publishedVersion || website.workspace.status !== "ACTIVE") return null;
  const content = parseGymWebsiteContent(website.published);
  return { workspaceId: website.workspaceId, slug: website.slug, publishedVersion: website.publishedVersion, publishedAt: website.publishedAt, content: { ...content, offers: content.offers.filter((offer) => offer.visible) } };
}
