"use client";

import { useActionState } from "react";
import { Notice } from "@flowstate/ui";
import type { BusinessSettingsInput } from "../../../../lib/business-settings";
import { saveBusinessSettingsAction } from "./actions";

export function BusinessSettingsForm({
  initial,
  version,
  currencyLocked,
}: {
  initial: BusinessSettingsInput;
  version: number;
  currencyLocked: boolean;
}) {
  const [state, action, pending] = useActionState(saveBusinessSettingsAction, {
    error: null,
    success: null,
  });
  const field = (
    name: keyof BusinessSettingsInput,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={initial[name]}
        required={required}
        maxLength={name === "contactEmail" ? 254 : 200}
      />
    </label>
  );
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="version" value={version} />
      {state.error ? (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      ) : state.success ? (
        <Notice tone="success" role="status">
          {state.success}
        </Notice>
      ) : null}
      <section className="management-card form-stack">
        <h2>Business identity</h2>
        {field("name", "Business name", "text", true)}
        {field("businessType", "Business type")}
        <div className="field-row">
          {field("contactEmail", "Contact email", "email")}
          {field("contactPhone", "Contact phone", "tel")}
        </div>
        <p className="management-copy">
          Your public website uses its reviewed, published contact details.
          Publish a refreshed website draft when those details change.
        </p>
      </section>
      <section className="management-card form-stack">
        <h2>Business address</h2>
        <p className="management-copy">
          All address fields are optional for a virtual coaching business.
        </p>
        {field("addressLine1", "Address line 1")}
        {field("addressLine2", "Address line 2")}
        <div className="field-row">
          {field("city", "City")}
          {field("region", "Province, state or region")}
        </div>
        <div className="field-row">
          {field("postalCode", "Postal or ZIP code")}
          {field("countryCode", "Country code")}
        </div>
      </section>
      <section className="management-card form-stack">
        <h2>Currency and locale</h2>
        <label className="field">
          <span>Business currency</span>
          <select
            name="currency"
            defaultValue={initial.currency}
            disabled={currencyLocked}
            required
          >
            <option value="">Choose currency</option>
            {["cad", "usd", "eur", "gbp", "aud", "nzd", "jpy", "krw"].map(
              (code) => (
                <option key={code} value={code}>
                  {code.toUpperCase()}
                </option>
              ),
            )}
          </select>
        </label>
        {currencyLocked ? (
          <>
            <input type="hidden" name="currency" value={initial.currency} />
            <p className="management-copy">
              Currency is locked because financial activity has been recorded.
            </p>
          </>
        ) : null}
        {field("locale", "Date and number locale", "text", true)}
        <p className="management-copy">
          Use a locale such as en-CA or de-DE for dates and monetary values.
          Interface text remains English. Accepted purchases retain their
          recorded currency and terms.
        </p>
      </section>
      <div className="dashboard-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save business settings"}
        </button>
      </div>
    </form>
  );
}
