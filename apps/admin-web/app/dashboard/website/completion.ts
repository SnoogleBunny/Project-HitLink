export type WebsiteCompletion = { kind: "saved" | "published"; version: number; publicVersion: number | null };
export type WebsiteCompletionQuery = Record<string, string | string[] | undefined>;
function positiveVersion(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}
export function parseWebsiteCompletion(query: WebsiteCompletionQuery): WebsiteCompletion | null {
  const scalar = (name: string) => typeof query[name] === "string" ? query[name] as string : undefined;
  const kind = scalar("websiteResult"), version = positiveVersion(scalar("version")), rawPublic = scalar("publicVersion");
  if ((kind !== "saved" && kind !== "published") || version === null || rawPublic === undefined) return null;
  const publicVersion = rawPublic === "0" ? null : positiveVersion(rawPublic);
  if (rawPublic !== "0" && publicVersion === null) return null;
  if (kind === "published" && publicVersion !== version) return null;
  return { kind, version, publicVersion };
}
/** Fixed local route; only committed public version numbers and a known editor tab enter the URL. */
export function websiteCompletionUrl(completion: WebsiteCompletion, section: string) {
  if (!Number.isSafeInteger(completion.version) || completion.version <= 0 || (completion.publicVersion !== null && (!Number.isSafeInteger(completion.publicVersion) || completion.publicVersion <= 0)) || (completion.kind !== "saved" && completion.kind !== "published") || (completion.kind === "published" && completion.publicVersion !== completion.version)) throw new Error("The committed website version could not be confirmed.");
  const params = new URLSearchParams({ websiteResult: completion.kind, version: String(completion.version), publicVersion: String(completion.publicVersion ?? 0) });
  return `/dashboard/website?${params}#${section === "#discovery" || section === "discovery" ? "discovery" : "pricing"}`;
}
