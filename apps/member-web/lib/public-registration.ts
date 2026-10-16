import { createHash } from "node:crypto";
export function registrationCookie(slug: string, kind: string) { return `hitlink_registration_${createHash("sha256").update(`${slug}:${kind}`).digest("hex").slice(0, 16)}`; }
export function registrationPath(slug: string, kind: string, offerId = "") { return kind === "TRIAL" ? `/gym/${encodeURIComponent(slug)}/trial` : `/gym/${encodeURIComponent(slug)}/join/${encodeURIComponent(offerId)}`; }
