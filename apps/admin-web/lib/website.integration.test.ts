import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient, GymWebsiteContent } from "@flowstate/db";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration("published gym websites", () => {
  let api: typeof import("@flowstate/db"), db: PrismaClient;
  const tag = `website-${randomUUID()}`;
  let workspaceId: string, ownerId: string, coachId: string, planId: string;
  let content: GymWebsiteContent;
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    api = await import("@flowstate/db"); db = api.prisma;
    const workspace = await db.workspace.create({ data: { name: "Website test gym", status: "ACTIVE" } }); workspaceId = workspace.id;
    const owner = await db.user.create({ data: { email: `${tag}-owner@example.test` } }); ownerId = owner.id;
    const coach = await db.user.create({ data: { email: `${tag}-coach@example.test` } }); coachId = coach.id;
    await db.workspaceUser.createMany({ data: [{ workspaceId, userId: ownerId, role: "OWNER" }, { workspaceId, userId: coachId, role: "COACH" }] });
    const plan = await db.membershipPlan.create({ data: { workspaceId, name: "Twice weekly", monthlyPriceCents: 9900, currency: "cad", weeklyClassLimit: 2, cancellationPolicyReference: "Two calendar months' notice; owner reviews billing", freezePolicyReference: "Finite approved freeze" }, include: { programRestrictions: true } }); planId = plan.id;
    content = { title: "Test gym", description: "Muay Thai classes", headline: "Train with us", introduction: "Small classes for consistent practice.", contactEmail: "gym@example.test", seoTitle: "Test gym — Muay Thai", seoDescription: "Muay Thai memberships and trial classes at Test gym.", shareImageUrl: "", offers: [api.websiteOfferFromPlan(plan, { visible: true, highlighted: true })] };
  });
  afterAll(async () => {
    if (!db) return;
    await db.websitePublication.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, coachId] } } });
  });
  it("keeps drafts private and publishes a stable, versioned operational snapshot", async () => {
    const actor = { workspaceId, userId: ownerId };
    await api.saveGymWebsiteDraft(actor, { slug: tag, expectedVersion: 0, content });
    expect(await api.getPublishedGymWebsite(tag)).toBeNull();
    await expect(api.publishGymWebsite(actor, 1, false)).rejects.toThrow("confirm");
    await api.publishGymWebsite(actor, 1, true);
    const published = await api.getPublishedGymWebsite(tag);
    expect(published?.content.title).toBe("Test gym");
    expect(published?.content.offers[0]).toMatchObject({ membershipPlanId: planId, monthlyPriceCents: 9900, weeklyClassLimit: 2, termsVersion: 1 });
    await api.saveGymWebsiteDraft(actor, { slug: tag, expectedVersion: 1, content: { ...content, title: "Private unsaved-to-public title" } });
    expect((await api.getPublishedGymWebsite(tag))?.content.title).toBe("Test gym");
    await expect(api.saveGymWebsiteDraft(actor, { slug: tag, expectedVersion: 1, content })).rejects.toThrow("changed");
    await api.publishGymWebsite(actor, 2, true);
    await api.publishGymWebsite(actor, 2, true);
    expect(await db.websitePublication.count({ where: { workspaceId } })).toBe(2);
  });
  it("refuses stale operational prices and requires refreshed review", async () => {
    await db.membershipPlan.update({ where: { id: planId }, data: { monthlyPriceCents: 10900, termsVersion: { increment: 1 } } });
    const actor = { workspaceId, userId: ownerId };
    await api.saveGymWebsiteDraft(actor, { slug: tag, expectedVersion: 2, content });
    await db.membershipPlan.update({ where: { id: planId }, data: { monthlyPriceCents: 11900, termsVersion: { increment: 1 } } });
    await expect(api.publishGymWebsite(actor, 3, true)).rejects.toThrow("operational terms");
    expect((await api.getPublishedGymWebsite(tag))?.content.offers[0]?.monthlyPriceCents).toBe(9900);
    const current = await db.membershipPlan.findUniqueOrThrow({ where: { id: planId }, include: { programRestrictions: true } });
    expect(api.isPublishedOfferCurrent(content.offers[0]!, current)).toBe(false);
  });
  it("requires active owner authority and never accepts another workspace's plan", async () => {
    await expect(api.publishGymWebsite({ workspaceId, userId: coachId }, 3, true)).rejects.toThrow("Only the owner");
    await expect(api.getOwnerGymWebsite({ workspaceId: "other-workspace", userId: ownerId })).rejects.toThrow("Only the owner");
    await expect(api.saveGymWebsiteDraft({ workspaceId, userId: ownerId }, { slug: tag, expectedVersion: 3, content: { ...content, offers: [{ ...content.offers[0], id: "other-plan", membershipPlanId: "other-plan" }] } })).rejects.toThrow("unavailable");
  });
  it("clears hidden highlights and blocks unsafe public image schemes", () => {
    const parsed = api.parseGymWebsiteContent({ ...content, offers: [{ ...content.offers[0], visible: false, highlighted: true }] });
    expect(parsed.offers[0]?.highlighted).toBe(false);
    expect(() => api.parseGymWebsiteContent({ ...content, shareImageUrl: "javascript:alert(1)" })).toThrow("HTTPS");
  });
});
