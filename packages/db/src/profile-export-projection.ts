const publicProfileFields = new Set([
  "fullName",
  "email",
  "phone",
  "dateOfBirth",
]);
const contactFields = new Set([
  ...publicProfileFields,
  "id",
  "relationshipLabel",
  "retiredAt",
  "version",
]);

/** Typed profile/contact facts only; internal notes and arbitrary history stay excluded. */
export function projectMemberProfileState(value: unknown, emergency: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = emergency ? contactFields : publicProfileFields;
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) =>
        allowed.has(key) &&
        (item === null ||
          typeof item === "string" ||
          (key === "version" &&
            typeof item === "number" &&
            Number.isSafeInteger(item))),
    ),
  );
}
