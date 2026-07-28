const migrationCorrectionEnvironmentKey =
  "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL";

export type MigrationCorrectionPhase = "pre-lock" | "post-lock";

export type MigrationCorrectionChannelProjection =
  | {
      status: "available";
      recipient: string;
      href: string;
      label: string;
      helper: string;
    }
  | {
      status: "unavailable";
      reason: "correction-channel-unavailable";
      message: string;
    };

const preLockBody = [
  "I found a problem in the migration summary before acknowledgment.",
  "",
  "Section that looks wrong:",
  "",
  "Do not include member data, credentials, export files, or private links.",
].join("\n");

const postLockBody = [
  "I found a problem after the migration summary was locked.",
  "",
  "Section that looks wrong:",
  "",
  "Do not include member data, credentials, export files, or private links.",
].join("\n");

function encodeMailtoComponent(value: string) {
  return encodeURIComponent(value);
}

function getConfiguredRecipient(): string | null {
  if (typeof window !== "undefined") {
    return null;
  }

  const configuredRecipient = process.env[migrationCorrectionEnvironmentKey];

  if (!configuredRecipient || /[\p{Cc}\p{Cf}]/u.test(configuredRecipient)) {
    return null;
  }

  const recipient = configuredRecipient.trim();

  if (!recipient || recipient.length > 254 || /[\s,;?#]/u.test(recipient)) {
    return null;
  }

  const separatorIndex = recipient.indexOf("@");
  if (
    separatorIndex < 1 ||
    separatorIndex !== recipient.lastIndexOf("@") ||
    separatorIndex > 64
  ) {
    return null;
  }

  const localPart = recipient.slice(0, separatorIndex);
  const domain = recipient.slice(separatorIndex + 1);
  const validLocalPart =
    /^[A-Za-z0-9.!$%&'*+/=_`{|}~^-]+$/u.test(localPart) &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !localPart.includes("..");
  const validDomain = domain
    .split(".")
    .every((label) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label),
    );

  return validLocalPart && validDomain ? recipient : null;
}

export function isMigrationCorrectionChannelAvailable() {
  return getConfiguredRecipient() !== null;
}

function sanitizeGymDisplayName(value: string) {
  const normalized = value
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return Array.from(normalized).slice(0, 80).join("") || "Gym";
}

export function getMigrationCorrectionChannelProjection(args: {
  gymDisplayName: string;
  phase: MigrationCorrectionPhase;
}): MigrationCorrectionChannelProjection {
  const recipient = getConfiguredRecipient();

  if (!recipient) {
    return {
      status: "unavailable",
      reason: "correction-channel-unavailable",
      message:
        args.phase === "pre-lock"
          ? "The migration correction channel is unavailable. Do not acknowledge this summary. Flowstate must make the contact channel available before owner review can continue."
          : "The migration correction channel is unavailable. The locked summary has not changed.",
    };
  }

  const subject = `Migration correction — ${sanitizeGymDisplayName(args.gymDisplayName)}`;
  const body = args.phase === "pre-lock" ? preLockBody : postLockBody;
  const href = `mailto:${encodeMailtoComponent(recipient)}?subject=${encodeMailtoComponent(subject)}&body=${encodeMailtoComponent(body)}`;

  if (args.phase === "post-lock") {
    return {
      status: "available",
      recipient,
      href,
      label: "Email a problem with the locked summary",
      helper: `Send to ${recipient}. The locked summary cannot be edited from this page. This email reports a problem; it does not unlock the snapshot, guarantee a change, or set a response time. Do not include member data, credentials, export files, or private links.`,
    };
  }

  return {
    status: "available",
    recipient,
    href,
    label: "Email a correction before acknowledging",
    helper: `Send to ${recipient}. This opens your email app. Describe only which part of the summary looks wrong. Do not include member data, credentials, export files, or private links. Do not acknowledge until a corrected summary appears here.`,
  };
}
