"use client";
import {
  useActionState,
  useState,
  useEffect,
  useRef,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { publicRegistrationAction } from "./registration-actions";

export function RegistrationActionForm({
  slug,
  kind,
  offerId = "",
  step,
  label,
  children,
  secondary = false,
}: {
  slug: string;
  kind: string;
  offerId?: string;
  step: string;
  label: string;
  children?: ReactNode;
  secondary?: boolean;
}) {
  const [state, action, pending] = useActionState(publicRegistrationAction, {
    error: null,
  });
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);
  return (
    <form action={action} className="registration-form" aria-busy={pending}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="step" value={step} />
      {children}
      {state.error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          className="registration-error"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      <button
        className={secondary ? "button button-secondary" : "button"}
        disabled={pending}
        type="submit"
      >
        {pending ? "Please wait…" : label}
      </button>
    </form>
  );
}

export function RegistrationStepFocus({ step }: { step: number }) {
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current !== step) {
      const heading =
        document.querySelector<HTMLElement>(".registration-card h2") ??
        document.querySelector<HTMLElement>(".registration-card h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus();
      previous.current = step;
    }
  }, [step]);
  return null;
}

export function RefreshRegistrationForms() {
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        startTransition(() => router.refresh());
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [router]);
  return (
    <button
      className="button button-secondary"
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Checking forms…" : "Check signed forms"}
    </button>
  );
}
export function RegistrationDetails({
  slug,
  kind,
  offerId = "",
  fingerprint = "",
  options,
}: {
  slug: string;
  kind: string;
  offerId?: string;
  fingerprint?: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [child, setChild] = useState(false);
  return (
    <RegistrationActionForm
      slug={slug}
      kind={kind}
      offerId={offerId}
      step="start"
      label="Verify my email"
    >
      <input name="termsFingerprint" type="hidden" value={fingerprint} />
      {kind === "TRIAL" ? (
        options.length === 1 ? (
          <div>
            <h2>Your trial class</h2>
            <p>{options[0]!.label}</p>
            <input
              type="hidden"
              name="bookingOption"
              value={options[0]!.value}
            />
          </div>
        ) : (
          <label>
            Trial class
            <select
              aria-label="Trial class"
              name="bookingOption"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Choose a class date
              </option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )
      ) : null}
      <label>
        Who is joining?
        <select
          aria-label="Who is joining?"
          value={child ? "child" : "adult"}
          onChange={(event) => setChild(event.target.value === "child")}
        >
          <option value="adult">I am joining</option>
          <option value="child">My child is joining</option>
        </select>
      </label>
      <label>
        {child ? "Child’s full name" : "Your full name"}
        <input
          name="fullName"
          autoComplete={child ? "off" : "name"}
          maxLength={150}
          required
        />
      </label>
      <label>
        {child ? "Child’s date of birth" : "Your date of birth"}
        <input name="dateOfBirth" type="date" required />
      </label>
      {child ? (
        <>
          <label>
            Your full name
            <input
              name="guardianFullName"
              autoComplete="name"
              required
              maxLength={150}
            />
          </label>
          <label>
            Your relationship to the child
            <input name="relationshipLabel" required maxLength={80} />
          </label>
          <p>
            The gym will verify your guardian access before you can book, sign
            or pay for your child.
          </p>
        </>
      ) : null}
      <label>
        Your email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </label>
      <label>
        Your phone <span className="registration-optional">(optional)</span>
        <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
      </label>
      <label className="registration-check">
        <input name="serviceConsent" type="checkbox" required />
        <span>
          I agree to use these details to register with this gym and receive
          messages needed for my booking or membership.
        </span>
      </label>
      <label className="registration-check">
        <input name="marketingConsent" type="checkbox" />
        <span>Send me gym news and offers. Optional.</span>
      </label>
    </RegistrationActionForm>
  );
}
