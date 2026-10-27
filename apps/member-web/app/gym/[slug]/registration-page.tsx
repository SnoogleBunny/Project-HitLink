import Link from "next/link";
import { cookies } from "next/headers";
import { publicEnrollmentFormsFailure } from "../../../lib/public-enrollment-form-failures";
import { notFound } from "next/navigation";
import { getSession, MEMBER_SESSION_COOKIE_NAME } from "@flowstate/auth";
import {
  getPublishedGymWebsite,
  getPublicEnrollment,
  getPublicEnrollmentForms,
  readPublicParticipant,
  prisma,
  type WebsiteOffer,
} from "@flowstate/db";
import { Money } from "@flowstate/ui";
import { registrationCookie } from "../../../lib/public-registration";
import { listTrialBookingOptions } from "../../../lib/trial-booking";
import {
  RegistrationActionForm,
  RegistrationDetails,
  RegistrationStepFocus,
  RefreshRegistrationForms,
} from "./registration-form";
import "./registration.css";

function MembershipSummary({ offer }: { offer: WebsiteOffer }) {
  const policy = offer.lifecyclePolicy;
  return (
    <aside className="registration-card registration-summary">
      <h2>{offer.name}</h2>
      <p>
        <Money
          amountMinor={offer.monthlyPriceCents}
          currency={offer.currency}
        />{" "}
        per billing month
      </p>
      <p>
        {offer.weeklyClassLimit
          ? `${offer.weeklyClassLimit} classes per week. `
          : ""}
        {offer.monthlyClassLimit
          ? `${offer.monthlyClassLimit} classes per billing month.`
          : !offer.weeklyClassLimit
            ? "Unlimited classes."
            : ""}{" "}
        Weekly limits restart within each billing month.
      </p>
      <p>
        Classes are counted by{" "}
        {offer.allowanceCountingMode === "RESERVATION"
          ? "reservations"
          : "attendance"}
        . Late cancellations{" "}
        {offer.lateCancellationConsumesClass ? "use" : "do not use"} a class;
        no-shows {offer.noShowConsumesClass ? "use" : "do not use"} a class.
      </p>
      <h2>Cancellation and freezes</h2>
      {policy ? (
        <>
          <p>
            Give {policy.noticeLength}{" "}
            {policy.noticeUnit === "CALENDAR_MONTHS"
              ? "calendar months"
              : policy.noticeUnit === "BILLING_CYCLES"
                ? "billing cycles"
                : "days"}{" "}
            of cancellation notice.{" "}
            {policy.alignment === "NEXT_BILLING_BOUNDARY"
              ? "Membership ends at the next billing boundary after that notice."
              : "Membership ends when that notice period ends."}{" "}
            {policy.noticeBilling === "OWNER_REVIEW"
              ? "The gym reviews billing during the notice period."
              : "Billing continues during the notice period."}
          </p>
          <p>
            {policy.freezeEnabled
              ? `Approved freezes cover whole billing cycles, up to ${policy.freezeMaxCycles} cycles. Classes are not booked again automatically when the freeze ends.`
              : "This plan does not include membership freezes."}
          </p>
        </>
      ) : (
        <p>
          {offer.cancellationPolicyReference ??
            "Contact the gym to confirm cancellation terms."}
        </p>
      )}
      <p>{offer.freezePolicyReference}</p>
      <p>
        Payment starts a recurring monthly membership. Review the amount on the
        secure payment page before paying.
      </p>
    </aside>
  );
}
export default async function PublicRegistrationPage({
  slug,
  kind,
  offerId = "",
}: {
  slug: string;
  kind: "TRIAL" | "MEMBERSHIP";
  offerId?: string;
}) {
  const site = await getPublishedGymWebsite(slug);
  if (!site) notFound();
  const offer =
    kind === "MEMBERSHIP"
      ? site.content.offers.find((item) => item.id === offerId)
      : undefined;
  if (kind === "MEMBERSHIP" && !offer) notFound();
  const jar = await cookies(),
    token = jar.get(registrationCookie(slug, kind))?.value ?? "";
  const stored = await getPublicEnrollment({
    workspaceId: site.workspaceId,
    token,
  });
  const enrollment =
    stored?.kind === kind &&
    (kind === "TRIAL" || readPublicParticipant(stored).offerId === offerId)
      ? stored
      : null;
  const participant = enrollment ? readPublicParticipant(enrollment) : null;
  const session = await getSession({
    cookieStore: jar,
    cookieName: MEMBER_SESSION_COOKIE_NAME,
  });
  const actionProps = { slug, kind, offerId };
  const step = !enrollment
    ? 1
    : !enrollment.verifiedAt
      ? 2
      : !enrollment.memberId
        ? 3
        : 4;
  const options =
    kind === "TRIAL" && !enrollment
      ? await listTrialBookingOptions({ workspaceId: site.workspaceId })
      : null;
  const trialOptions =
    options?.status === "available"
      ? options.templates.flatMap((template) =>
          template.dateOptions.map((date) => ({
            value: `${template.id}|${date.scheduledForDate}`,
            label: `${date.details?.displayTitle ?? template.displayTitle} · ${date.label}`,
          })),
        )
      : [];
  let forms: Awaited<ReturnType<typeof getPublicEnrollmentForms>> = [],
    authorityError: string | null = null;
  if (
    enrollment?.memberId &&
    session &&
    session.userId === participant?.accountUserId
  ) {
    try {
      forms = await getPublicEnrollmentForms({
        workspaceId: site.workspaceId,
        enrollmentId: enrollment.id,
        actorUserId: session.userId,
      });
    } catch (error) {
      authorityError = publicEnrollmentFormsFailure(error).message;
    }
  }
  const operation =
    enrollment?.operationId &&
    session &&
    session.userId === participant?.accountUserId
      ? await prisma.financialOperation.findFirst({
          where: {
            id: enrollment.operationId,
            workspaceId: site.workspaceId,
            payerAccount: { userId: session.userId },
          },
        })
      : null;
  const accepted = !!(
    enrollment?.acceptedTerms as { membership?: unknown } | null
  )?.membership;
  const needsFormRequests = forms.some(
    (form) => !form.signed && !form.requestId,
  );
  return (
    <>
      <RegistrationStepFocus step={step} />
      <ol className="registration-steps" aria-label="Registration progress">
        {[
          "Details",
          "Verify email",
          "Your account",
          kind === "TRIAL" ? "Book trial" : "Forms and payment",
        ].map((label, index) => (
          <li
            key={label}
            aria-current={step === index + 1 ? "step" : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <div
        className={
          offer
            ? "registration-layout"
            : "registration-layout registration-trial"
        }
      >
        <section className="registration-card">
          <h1>{kind === "TRIAL" ? "Try a class" : "Join the gym"}</h1>
          {!enrollment ? (
            kind === "TRIAL" && !trialOptions.length ? (
              <p>
                No trial dates are available. Contact{" "}
                <a href={`mailto:${site.content.contactEmail}`}>
                  {site.content.title}
                </a>{" "}
                for the next class.
              </p>
            ) : (
              <RegistrationDetails
                {...actionProps}
                fingerprint={offer?.termsFingerprint}
                options={trialOptions}
              />
            )
          ) : !enrollment.verifiedAt ? (
            <>
              <h2>Verify your email</h2>
              <p>
                Your verification email is queued for {enrollment.email}. Enter
                its six-digit code below. The code lasts 10 minutes.
              </p>
              <RegistrationActionForm
                {...actionProps}
                step="verify"
                label="Verify email"
              >
                <label>
                  Verification code
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </label>
              </RegistrationActionForm>
            </>
          ) : !enrollment.memberId ? (
            <>
              <h2>Your account</h2>
              <p>Verified email: {enrollment.email}</p>
              <p>
                {session
                  ? "Continue with your signed-in account."
                  : "Use your existing password, or choose a password if this is your first account."}
              </p>
              <RegistrationActionForm
                {...actionProps}
                step="account"
                label={session ? "Continue with my account" : "Continue"}
              >
                {!session ? (
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      maxLength={128}
                      aria-describedby="registration-password-help"
                      required
                    />
                    <span id="registration-password-help">
                      Use your existing password. New passwords need at least 12
                      characters and no more than 72 bytes; accented characters
                      and emoji can use more than one byte.
                    </span>
                  </label>
                ) : null}
              </RegistrationActionForm>
            </>
          ) : session?.userId !== participant?.accountUserId ? (
            <p>
              <Link href="/login">Sign in</Link> to continue this registration,
              then return to this page.
            </p>
          ) : (
            <>
              <h2>{participant?.fullName}</h2>
              {kind === "TRIAL" ? (
                <p>Selected class date: {participant?.scheduledForDate}</p>
              ) : null}
              {enrollment.status === "COMPLETE" ? (
                <div role="status">
                  <p>
                    {kind === "TRIAL"
                      ? "Your trial is booked. Check your forms again if the gym publishes an update before class."
                      : "Payment confirmed. Your membership is ready."}
                  </p>
                  <Link className="button" href="/app/schedule">
                    View classes
                  </Link>
                </div>
              ) : authorityError ? (
                <>
                  <p role="status">{authorityError}</p>
                  <p>
                    Contact{" "}
                    <a href={`mailto:${site.content.contactEmail}`}>
                      {site.content.contactEmail}
                    </a>
                    . Your participant details are saved.
                  </p>
                  <RegistrationActionForm
                    {...actionProps}
                    step="prepare"
                    label="Check access again"
                  >
                    {kind === "MEMBERSHIP" ? (
                      <label className="registration-check">
                        <input
                          type="checkbox"
                          name="acceptMembership"
                          required
                        />
                        <span>
                          I accept the displayed membership terms for{" "}
                          {participant?.fullName}.
                        </span>
                      </label>
                    ) : null}
                  </RegistrationActionForm>
                </>
              ) : operation ? (
                <>
                  <p role="status">
                    {operation.status === "SUCCEEDED"
                      ? "Payment confirmed. Your membership is ready."
                      : operation.status === "REVIEW_REQUIRED"
                        ? "The gym is reviewing this payment and membership. Please do not pay again."
                        : operation.status === "FAILED"
                          ? "This checkout ended without a confirmed membership. You can start a new registration."
                          : "Your payment is not confirmed yet. Continue the same payment or check its status."}
                  </p>
                  <p>
                    <Money
                      amountMinor={operation.amountCents ?? 0}
                      currency={operation.currency ?? "cad"}
                    />
                  </p>
                  {["RESERVED", "SUBMITTED"].includes(operation.status) ? (
                    <RegistrationActionForm
                      {...actionProps}
                      step="payment"
                      label="Continue or check payment"
                    />
                  ) : null}
                  <Link href="/app/billing">View payments</Link>
                </>
              ) : (
                <>
                  {(kind === "MEMBERSHIP" && !accepted) || needsFormRequests ? (
                    <RegistrationActionForm
                      {...actionProps}
                      step="prepare"
                      label="Review required forms"
                    >
                      {kind === "MEMBERSHIP" ? (
                        <label className="registration-check">
                          <input
                            name="acceptMembership"
                            type="checkbox"
                            required
                          />
                          <span>
                            I accept the displayed price, class allowance,
                            recurring billing, cancellation and freeze terms for{" "}
                            {participant?.fullName}.
                          </span>
                        </label>
                      ) : (
                        <p>
                          Review the current forms for {participant?.fullName}.
                        </p>
                      )}
                    </RegistrationActionForm>
                  ) : forms.some((form) => !form.signed) ? (
                    <p role="status">
                      Sign the current required forms below before continuing to
                      {kind === "TRIAL" ? " book your trial." : " payment."}
                    </p>
                  ) : kind === "TRIAL" ? (
                    <RegistrationActionForm
                      {...actionProps}
                      step="book"
                      label={`Book trial for ${participant?.fullName}`}
                    />
                  ) : (
                    <RegistrationActionForm
                      {...actionProps}
                      step="payment"
                      label="Continue to secure payment"
                    />
                  )}
                </>
              )}
              {forms.length ? (
                <>
                  <h2 style={{ marginTop: 26 }}>Required forms</h2>
                  <ul className="registration-forms">
                    {forms.map((form) => (
                      <li key={`${form.name}:${form.version}`}>
                        {form.name} · version {form.version} —{" "}
                        {form.signed ? (
                          "Signed"
                        ) : form.requestId ? (
                          <Link
                            href={`/app/forms/${form.requestId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Read and sign
                          </Link>
                        ) : (
                          "Ready to review"
                        )}
                      </li>
                    ))}
                  </ul>
                  {forms.some((form) => !form.signed) ? (
                    <>
                      <p>
                        Forms open in a separate tab. Return here after signing.
                      </p>
                      <RefreshRegistrationForms />
                    </>
                  ) : (
                    <p>All current required forms are signed.</p>
                  )}
                </>
              ) : null}
            </>
          )}
          {enrollment && !operation && enrollment.status !== "COMPLETE" ? (
            <RegistrationActionForm
              {...actionProps}
              step="restart"
              label="Start again"
              secondary
            />
          ) : null}
          {operation?.status === "FAILED" ? (
            <RegistrationActionForm
              {...actionProps}
              step="restart"
              label="Start again"
              secondary
            />
          ) : null}
        </section>
        {offer ? (
          <MembershipSummary offer={offer} />
        ) : (
          <aside className="registration-card registration-summary">
            <h2>Your first class</h2>
            <p>
              Choose a date, verify your email, and book. Your place is
              confirmed only after booking succeeds.
            </p>
            <p>
              Required forms must be signed before attendance. The gym will
              check guardian access for a child.
            </p>
            <p>
              Questions?{" "}
              <a href={`mailto:${site.content.contactEmail}`}>
                Contact the gym
              </a>
              .
            </p>
          </aside>
        )}
      </div>
    </>
  );
}
