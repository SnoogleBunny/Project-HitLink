import Link from "next/link";
import {
  isPublishedOfferCurrent,
  parseGymWebsiteContent,
  prisma,
} from "@flowstate/db";
import { Money } from "@flowstate/ui";

export async function VerifiedMembershipEnrollment({
  workspaceId,
  memberName,
  formsPending,
}: {
  workspaceId: string;
  memberName: string;
  formsPending: boolean;
}) {
  const [website, plans] = await Promise.all([
    prisma.workspaceWebsite.findUnique({ where: { workspaceId } }),
    prisma.membershipPlan.findMany({
      where: { workspaceId, archivedAt: null },
      include: { programRestrictions: true },
    }),
  ]);
  const published =
    website?.published && website.publishedAt
      ? parseGymWebsiteContent(website.published)
      : null;
  const offers =
    published?.offers.filter(
      (offer) =>
        offer.visible &&
        plans.some(
          (plan) =>
            plan.id === offer.membershipPlanId &&
            isPublishedOfferCurrent(offer, plan),
        ),
    ) ?? [];
  const origin = process.env.NEXT_PUBLIC_MEMBER_WEB_URL?.replace(/\/$/, "");
  return (
    <section className="management-card">
      <h3>Start a membership</h3>
      <p>
        Give {memberName} or their verified guardian an enrollment link. They
        confirm their account, accept the current terms, sign required forms and
        pay. Access starts after payment is confirmed.
      </p>
      {formsPending ? (
        <p className="info-callout">
          Required forms are completed during enrollment.
        </p>
      ) : null}
      {origin && website && offers.length ? (
        <div className="stack-list">
          {offers.map((offer) => (
            <article className="stack-item" key={offer.id}>
              <div className="stack-item-copy">
                <h4>{offer.name}</h4>
                <p>
                  <Money
                    amountMinor={offer.monthlyPriceCents}
                    currency={offer.currency}
                  />{" "}
                  per billing month
                </p>
                <a
                  className="text-link"
                  href={`${origin}/gym/${website.slug}/join/${encodeURIComponent(offer.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open enrollment for {offer.name}
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>
          No current enrollment links are available. Review the published plans
          and the member website address in Website settings.
        </p>
      )}
      <Link className="text-link" href="/dashboard/website">
        Manage enrollment links
      </Link>
    </section>
  );
}
