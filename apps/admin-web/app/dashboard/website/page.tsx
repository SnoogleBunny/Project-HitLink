import Link from "next/link";
import { getOwnerGymWebsite, websiteOfferFromPlan } from "@flowstate/db";
import { Badge, Money, Notice } from "@flowstate/ui";
import { readWebsiteCompletionNotice } from "./completion-notice";
import type { WebsiteCompletionQuery } from "./completion";
import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { WebsiteDraftForm, WebsitePublishForm } from "./forms";
import { WebsiteEditor } from "./editor";
function Field({
  label,
  name,
  value = "",
  long = false,
  maxLength,
}: {
  label: string;
  name: string;
  value?: string;
  long?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {long ? (
        <textarea
          name={name}
          defaultValue={value}
          rows={3}
          maxLength={maxLength}
        />
      ) : (
        <input name={name} defaultValue={value} maxLength={maxLength} />
      )}
    </label>
  );
}
export default async function WebsitePage({ searchParams }: { searchParams?: Promise<WebsiteCompletionQuery> } = {}) {
  const context = await requireOwnerWorkspaceContext();
  const data = await getOwnerGymWebsite({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  const completionNotice = await readWebsiteCompletionNotice({ workspaceId: context.workspace.id, userId: context.session.userId }, (await searchParams) ?? {});
  const content = data.draft;
  const publicationSummary = data.website?.publishedVersion
    ? context.workspace.status === "ACTIVE"
      ? `Visitors see version ${data.website.publishedVersion}.`
      : context.workspace.status === "SETUP_INCOMPLETE"
        ? `Version ${data.website.publishedVersion} is published for launch. It becomes public when your workspace is active.`
        : `Published version ${data.website.publishedVersion} is currently hidden.`
    : "Your gym website has not been published.";
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Website"
      description="Edit your gym's public membership offers and search preview."
    >
      {completionNotice ? <Notice tone="success">{completionNotice}</Notice> : null}
      <section className="management-card">
        <h2>Publication</h2>
        <p>
          {publicationSummary}{" "}
          {data.website
            ? `Draft version ${data.website.draftVersion}.`
            : "Save a first draft to preview it."}
        </p>
        {data.website ? (
          <>
            <Link href="/dashboard/website/preview" target="_blank">
              Preview saved draft
            </Link>
            <WebsitePublishForm version={data.website.draftVersion} />
          </>
        ) : null}
      </section>
      <WebsiteDraftForm version={data.website?.draftVersion ?? 0}>
        <WebsiteEditor
          pricing={
            <section className="management-card form-stack">
              <h2>Pricing</h2>
              <p>
                Prices, class limits and policies come from your operational
                membership plans. Change those under{" "}
                <Link href="/dashboard/membership-plans">Plans</Link>, then save
                a refreshed website draft.
              </p>
              <label>
                <input
                  type="radio"
                  name="highlighted"
                  value=""
                  defaultChecked={
                    !content?.offers.some((offer) => offer.highlighted)
                  }
                />{" "}
                No highlighted plan
              </label>
              {data.plans.map((plan) => {
                const offer =
                  content?.offers.find(
                    (item) => item.membershipPlanId === plan.id,
                  ) ?? websiteOfferFromPlan(plan);
                return (
                  <fieldset key={plan.id} className="form-stack">
                    <legend>{plan.name}</legend>
                    <p>
                      <Money
                        amountMinor={plan.monthlyPriceCents}
                        currency={plan.currency}
                      />{" "}
                      / billing month · terms version {plan.termsVersion}
                    </p>
                    <p>
                      {plan.weeklyClassLimit
                        ? `${plan.weeklyClassLimit} classes each week. `
                        : ""}
                      {plan.monthlyClassLimit
                        ? `${plan.monthlyClassLimit} classes each billing month.`
                        : !plan.weeklyClassLimit
                          ? "Unlimited classes."
                          : ""}
                    </p>
                    {!plan.cancellationPolicyReference ? (
                      <Badge tone="warning">
                        Cancellation policy needed before publishing
                      </Badge>
                    ) : null}
                    <Field
                      label="Public plan name"
                      name={`name-${plan.id}`}
                      value={offer.name}
                      maxLength={120}
                    />
                    <Field
                      label="Short plan description"
                      name={`description-${plan.id}`}
                      value={offer.description}
                      long
                      maxLength={1000}
                    />
                    <label>
                      <input
                        type="checkbox"
                        name={`visible-${plan.id}`}
                        defaultChecked={offer.visible}
                      />{" "}
                      Show on website
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="highlighted"
                        value={plan.id}
                        defaultChecked={offer.highlighted}
                      />{" "}
                      Highlight this plan
                    </label>
                  </fieldset>
                );
              })}
            </section>
          }
          discovery={
            <>
              <section className="management-card form-stack">
                <h2>Gym details</h2>
                <Field
                  label="Website address name"
                  name="slug"
                  value={
                    data.website?.slug ??
                    context.workspace.name
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                  }
                  maxLength={60}
                />
                <Field
                  label="Public gym name"
                  name="title"
                  value={content?.title ?? context.workspace.name}
                  maxLength={120}
                />
                <Field
                  label="Short description"
                  name="description"
                  value={content?.description}
                  maxLength={300}
                />
                <Field
                  label="Main headline"
                  name="headline"
                  value={
                    content?.headline ?? `Train at ${context.workspace.name}`
                  }
                  maxLength={160}
                />
                <Field
                  label="Introduction"
                  name="introduction"
                  value={content?.introduction}
                  long
                  maxLength={3000}
                />
                <Field
                  label="Public contact email"
                  name="contactEmail"
                  value={content?.contactEmail}
                />
              </section>
              <section className="management-card form-stack">
                <h2>Search and sharing</h2>
                <Field
                  label="Search title (up to 70 characters)"
                  name="seoTitle"
                  value={content?.seoTitle ?? context.workspace.name}
                  maxLength={70}
                />
                <Field
                  label="Search description (up to 170 characters)"
                  name="seoDescription"
                  value={content?.seoDescription}
                  long
                  maxLength={170}
                />
                <Field
                  label="Public HTTPS sharing image URL (optional)"
                  name="shareImageUrl"
                  value={content?.shareImageUrl}
                />
                <p>
                  Leave the image blank to use the gym name sharing card.
                  Preview pages remain hidden from search.
                </p>
              </section>
            </>
          }
        />
      </WebsiteDraftForm>
    </AdminShell>
  );
}
