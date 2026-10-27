export function projectSetupSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const fields = new Set([
    "businessName",
    "businessType",
    "serviceMode",
    "timezone",
    "currency",
    "locale",
    "contactEmail",
    "onlinePaymentsReady",
    "configuredPrograms",
    "configuredRooms",
    "configuredCoachingTemplates",
  ]);
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) =>
        (fields.has(key) &&
          (item === null ||
            ["string", "number", "boolean"].includes(typeof item))) ||
        (["address", "ownerUserIds"].includes(key) &&
          Array.isArray(item) &&
          item.every((part) => typeof part === "string")),
    ),
  );
}
