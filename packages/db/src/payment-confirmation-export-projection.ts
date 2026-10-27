/** A commercial confirmation never exports provider payloads or coaching content. */
export function projectPaymentConfirmationSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set([
    "businessName",
    "contactEmail",
    "contactPhone",
    "beneficiaryName",
    "description",
    "invoiceNumber",
    "providerReference",
    "timezone",
    "locale",
  ]);
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) =>
        (key === "version" && item === 1) ||
        (allowed.has(key) && (item === null || typeof item === "string")),
    ),
  );
}
