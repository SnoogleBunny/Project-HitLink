/** Export financial evidence, never arbitrary provider payload or dispute evidence text. */
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const select = (value: unknown, fields: string[]) =>
  Object.fromEntries(
    Object.entries(object(value)).filter(
      ([key, item]) =>
        fields.includes(key) &&
        (item === null ||
          ["string", "number", "boolean"].includes(typeof item)),
    ),
  );
export function projectDisputeEvidence(value: unknown) {
  const raw = object(value);
  return {
    ...select(raw, [
      "id",
      "accountId",
      "livemode",
      "chargeId",
      "paymentIntentId",
      "customerId",
      "status",
      "reason",
      "amountCents",
      "currency",
      "chargeAmountCents",
      "chargeRefundedCents",
      "isChargeRefundable",
      "evidenceDueAt",
    ]),
    refunds: Array.isArray(raw.refunds)
      ? raw.refunds.map((row) =>
          select(row, ["id", "amountCents", "currency", "status"]),
        )
      : [],
    balanceTransactions: Array.isArray(raw.balanceTransactions)
      ? raw.balanceTransactions.map((row) =>
          select(row, ["id", "amount", "fee", "net", "currency", "type"]),
        )
      : [],
    allocations: Array.isArray(raw.allocations)
      ? raw.allocations.map((row) =>
          select(row, ["id", "invoiceId", "amountCents", "customerId"]),
        )
      : [],
  };
}
export function projectDisputeState(value: unknown) {
  const result = select(value, [
    "version",
    "status",
    "evidenceHash",
    "accessState",
    "moneyState",
    "treatment",
    "reviewer",
    "resolvedAt",
  ]);
  for (const key of [
    "releasedBookingIds",
    "releasedAppointmentIds",
    "retiredCardIds",
    "closedEnrollmentIds",
  ]) {
    const item = object(value)[key];
    if (Array.isArray(item) && item.every((id) => typeof id === "string"))
      result[key] = item;
  }
  return result;
}
