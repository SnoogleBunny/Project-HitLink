"use client";
import { useActionState } from "react";
import { Notice } from "@flowstate/ui";
import { workspaceSetupAction, type SetupState } from "./actions";

const serviceLabels: Record<string, string> = {
  MARTIAL_ARTS: "Martial arts and classes",
  COACHING: "Adult life coaching only",
  HYBRID: "Martial arts and adult life coaching",
};
export function SetupForm({
  ownerEmail,
  ownerVerified,
}: {
  ownerEmail: string;
  ownerVerified: boolean;
}) {
  const [state, action, pending] = useActionState(workspaceSetupAction, {
    error: null,
    message: null,
    review: null,
  } as SetupState);
  const review = state.review;
  return (
    <div className="form-stack">
      {state.error ? (
        <div role="alert">
          <Notice tone="danger">{state.error}</Notice>
        </div>
      ) : null}
      {state.message ? (
        <div role="status">
          <Notice>{state.message}</Notice>
        </div>
      ) : null}
      <section className="management-card form-stack">
        <h2>Verify owner access</h2>
        <p>
          Verify {ownerEmail} with a single-use email link. Activation needs
          verification from the last 15 minutes; the link expires after 30
          minutes.
        </p>
        <p>
          {ownerVerified
            ? "Owner email is freshly verified."
            : "Owner email verification is required."}
        </p>
        <form action={action}>
          <input name="step" type="hidden" value="request" />
          <button
            type="submit"
            className="button button-secondary"
            disabled={pending}
          >
            {pending ? "Requesting…" : "Request owner verification"}
          </button>
        </form>
      </section>
      <section className="management-card form-stack">
        <h2>Review business setup</h2>
        <p>
          Activation opens your workspace. Add actual programs, rooms or
          coaching offers when needed; no sample service or import is required.
          Online payments and customer emails stay unavailable until their
          providers are configured.
        </p>
        <form action={action}>
          <input name="step" type="hidden" value="preview" />
          <button type="submit" className="button" disabled={pending}>
            {pending ? "Reviewing…" : "Review setup for activation"}
          </button>
        </form>
        {review ? (
          <section className="form-stack" aria-label="Business setup preview">
            <h3>{review.snapshot.businessName}</h3>
            <dl className="billing-detail-grid">
              <div>
                <dt>Services</dt>
                <dd>{serviceLabels[review.snapshot.serviceMode]}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{review.snapshot.timezone}</dd>
              </div>
              <div>
                <dt>Currency and locale</dt>
                <dd>
                  {review.snapshot.currency.toUpperCase()} ·{" "}
                  {review.snapshot.locale}
                </dd>
              </div>
              <div>
                <dt>Contact email</dt>
                <dd>{review.snapshot.contactEmail}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>
                  {review.snapshot.address.join(", ") ||
                    "Virtual business; no address published"}
                </dd>
              </div>
            </dl>
            <p>
              {review.snapshot.configuredPrograms} programs,{" "}
              {review.snapshot.configuredRooms} rooms and{" "}
              {review.snapshot.configuredCoachingTemplates} coaching templates
              configured. Empty service catalogs are allowed.
            </p>
            <Notice tone="warning">
              {review.snapshot.onlinePaymentsReady
                ? "A payment account is connected. Each sale still requires its configured offer, terms and verified payment."
                : "Online payments are not connected. Activation does not enable charging."}
            </Notice>
            {review.errors.map((error) => (
              <Notice key={error} tone="danger">
                {error}
              </Notice>
            ))}
            {review.ok ? (
              <form action={action} className="form-stack">
                <input type="hidden" name="step" value="activate" />
                <input
                  name="snapshotHash"
                  type="hidden"
                  value={review.snapshotHash}
                />
                <input name="version" type="hidden" value={review.version} />
                <label className="field-checkbox">
                  <input name="confirmSetup" type="checkbox" required />
                  <span>
                    I reviewed these exact business details and authorize
                    activation.
                  </span>
                </label>
                <button type="submit" className="button" disabled={pending}>
                  {pending ? "Activating…" : "Activate new business"}
                </button>
              </form>
            ) : null}
          </section>
        ) : null}
      </section>
    </div>
  );
}
