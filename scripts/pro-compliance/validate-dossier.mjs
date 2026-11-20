import { execFileSync } from "node:child_process";
import {
  lstat,
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const MANIFEST_PATH =
  "docs/compliance/flowstate-pro/dossier-manifest.json";
const REGISTER_PATH =
  "docs/compliance/flowstate-pro/change-control-register.json";
const MANIFEST_SCHEMA_PATH =
  "docs/compliance/flowstate-pro/schemas/dossier-document-metadata.schema.json";
const REGISTER_SCHEMA_PATH =
  "docs/compliance/flowstate-pro/schemas/change-control-record.schema.json";
const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";
const MANIFEST_SCHEMA_ID = "flowstate-pro/dossier-document-metadata.schema.json";
const REGISTER_SCHEMA_ID = "flowstate-pro/change-control-record.schema.json";
const CORE_PATHS = [
  MANIFEST_SCHEMA_PATH,
  REGISTER_SCHEMA_PATH,
  MANIFEST_PATH,
  REGISTER_PATH,
];
const REQUIRED_DOCUMENT_PATHS = [
  ...[
    "README.md",
    "competitor-parity-matrix.md",
    "control-and-evidence-matrix.md",
    "current-standard-baseline.md",
    "data-classification-and-flows.md",
    "decision-register-and-open-items.md",
    "evidence/README.md",
    "legal-applicability-matrix.md",
    "operations-and-governance.md",
    "product-requirements-document.md",
    "product-spec.md",
    "roadmap.md",
    "security-privacy-architecture.md",
    "system-design.md",
    "work-packets/WP0.1-freeze-evidence-and-boundaries.md",
    "work-packets/WP0.2-author-product-and-architecture-specifications.md",
    "work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md",
  ].map((file) => `docs/compliance/flowstate-pro/${file}`),
  "docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md",
];

const PROHIBITED_JSON_KEYS = new Set([
  "access_token",
  "agreement_body",
  "agreement_text",
  "client_secret",
  "contract_body",
  "contract_text",
  "legal_advice",
  "private_key",
  "refresh_token",
]);
const REDACTED_VALUES = new Set(["[REDACTED]", "REDACTED"]);
const PROFILE_PATTERN =
  /^(?:ALL|VIRGINIA|BC_PRIVATE_CLINIC|[A-Z][A-Z0-9._-]{2,63})$/;
const APPROVED_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "COUNSEL_REVIEW_REQUIRED",
  "OWNER_APPROVAL_REQUIRED",
  "APPROVED",
  "SPECIFIED",
  "IMPLEMENTED",
  "TECHNICALLY_VERIFIED",
  "OPERATIONALLY_EXERCISED",
  "EVIDENCE_COMPLETE",
  "LEGALLY_REVIEWED",
  "APPROVED_FOR_PROFILE",
  "BLOCKED",
  "NOT_APPLICABLE",
  "SUPERSEDED",
];
const ACCOUNTABLE_FUNCTIONS = [
  "Architecture/Backend",
  "Database",
  "Legal/Privacy",
  "Legal/counsel",
  "Operations",
  "Operations/QA-Assurance",
  "Product",
  "QA/Assurance",
  "Security/Privacy",
];
const asciiCasePair = (c) => `[${c.toUpperCase()}${c.toLowerCase()}]`;
const ACCOUNTABLE_NAME_PATTERN = `^(?:${ACCOUNTABLE_FUNCTIONS.join("|").replace(/[A-Za-z]/g, asciiCasePair)})$`;
const ACCOUNTABLE_NAME = new RegExp(ACCOUNTABLE_NAME_PATTERN, "u");
// ponytail: reject bounded title syntax; human reviewers verify the name against protected evidence.
const TITLE_MODIFIERS = "acting|interim|deputy|associate|assistant|senior|chief|general|legal|staff|in-house|privacy|security|compliance|product|data|protection|risk|operations|executive|corporate|outside|lead";
const TITLE_HEADS = "counsel|officer|director|owner|manager|lead|administrator";
const ROLE_ONLY = String.raw`tbd|unknown|n/a|legal|reviewer|redacted|\[redacted\]|(?:(?:${TITLE_MODIFIERS})\s+)*(?:${TITLE_HEADS})`;
const APPROVER_NAME_PATTERN = String.raw`^(?!(?:${ROLE_ONLY.replace(/(?<!\\)[a-z]/g, asciiCasePair)})$)\S(?:.*\S)?$`;
const APPROVER_NAME = new RegExp(APPROVER_NAME_PATTERN, "u");
const DOCUMENT_ID = /^[A-Z][A-Z0-9._-]{2,63}$/;
const CHANGE_ID = /^WP[0-9]+\.[0-9]+-CC-[0-9]{3}$/;
const REFERENCE_SCHEMA = {
  type: "string",
  maxLength: 256,
  anyOf: [
    {
      pattern:
        "^(?!/)(?!.*\\\\)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*\\u0000)(?=.{1,256}$)[^\\s]+/[^\\s]+$",
    },
    { pattern: "^[A-Za-z0-9][A-Za-z0-9._:+-]{1,255}$" },
  ],
};
const PROFILE_SCHEMA = {
  type: "string",
  pattern: "^(ALL|VIRGINIA|BC_PRIVATE_CLINIC|[A-Z][A-Z0-9._-]{2,63})$",
};
const NON_EMPTY_STRING_SCHEMA = {
  type: "string",
  minLength: 1,
  pattern: "\\S",
};
const SORTED_UNIQUE_STRINGS_SCHEMA = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: { $ref: "#/$defs/nonEmptyString" },
};
const REFERENCE_ARRAY_SCHEMA = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: { $ref: "#/$defs/reference" },
};
const ACCOUNTABLE_ARRAY_SCHEMA = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: { $ref: "#/$defs/accountableFunction" },
};
const DATE_SCHEMA = {
  type: "string",
  format: "date",
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
};
const TIMESTAMP_HOUR = "(?:[01][0-9]|2[0-3])";
const TIMESTAMP_PATTERN = String.raw`^([0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01]))[Tt]${TIMESTAMP_HOUR}:[0-5][0-9]:([0-5][0-9]|60)(?:\.[0-9]+)?(?:[Zz]|[+-]${TIMESTAMP_HOUR}:[0-5][0-9])$`;
const TIMESTAMP = new RegExp(TIMESTAMP_PATTERN);
const TRANSITION_RULES = {
  adjacent: [
    ["DRAFT", "SPECIFIED"],
    ["SPECIFIED", "IMPLEMENTED"],
    ["IMPLEMENTED", "TECHNICALLY_VERIFIED"],
    ["TECHNICALLY_VERIFIED", "OPERATIONALLY_EXERCISED"],
    ["OPERATIONALLY_EXERCISED", "EVIDENCE_COMPLETE"],
    ["COUNSEL_REVIEW_REQUIRED", "LEGALLY_REVIEWED"],
    ["OWNER_APPROVAL_REQUIRED", "APPROVED"],
  ],
  approved_for_profile_from: "OWNER_APPROVAL_REQUIRED",
  approved_for_profile_prerequisites: [
    "SPECIFIED",
    "IMPLEMENTED",
    "TECHNICALLY_VERIFIED",
    "OPERATIONALLY_EXERCISED",
    "EVIDENCE_COMPLETE",
    "LEGALLY_REVIEWED",
    "OWNER_APPROVAL_REQUIRED",
  ],
  approval_required_to_statuses: [
    "APPROVED",
    "LEGALLY_REVIEWED",
    "APPROVED_FOR_PROFILE",
  ],
  terminal_dispositions: ["BLOCKED", "NOT_APPLICABLE", "SUPERSEDED"],
};
const APPROVAL_STATUSES = TRANSITION_RULES.approval_required_to_statuses;
const TERMINAL_STATUSES = TRANSITION_RULES.terminal_dispositions;
const TRANSITION_GRAPH = {
  if: { properties: { to_status: { enum: TERMINAL_STATUSES } }, required: ["to_status"] },
  then: {
    anyOf: APPROVED_STATUSES.filter((status) => !TERMINAL_STATUSES.includes(status)).map((status) => ({
      properties: { from_status: { const: status }, prerequisite_evidence: { required: [status] } },
    })),
  },
  else: {
    anyOf: [
      ...TRANSITION_RULES.adjacent.map(([from, to]) => ({
        properties: { from_status: { const: from }, to_status: { const: to } },
      })),
      { properties: {
        from_status: { const: TRANSITION_RULES.approved_for_profile_from },
        to_status: { const: "APPROVED_FOR_PROFILE" },
        prerequisite_evidence: { required: TRANSITION_RULES.approved_for_profile_prerequisites },
      } },
    ],
  },
};
const LEGAL_APPROVAL_STATUSES = ["APPROVED", "LEGALLY_REVIEWED"];
const RECORD_APPROVAL_CONDITION = {
  anyOf: [
    { properties: { status: { const: "APPROVED_FOR_PROFILE" } }, required: ["status"] },
    {
      properties: { legal_value: { const: true }, status: { enum: LEGAL_APPROVAL_STATUSES } },
      required: ["legal_value", "status"],
    },
  ],
};
const MANIFEST_REQUIRED = [
  "document_id",
  "path",
  "title",
  "status",
  "owner",
  "source",
  "affected_profiles",
  "effective_date",
  "required_review",
  "evidence_references",
  "latest_change_id",
];
const REGISTER_REQUIRED = [
  "change_id",
  "document_ids",
  "status",
  "owner",
  "reason",
  "source",
  "affected_profiles",
  "effective_date",
  "superseded_text",
  "required_review",
  "evidence_references",
  "transition",
  "legal_value",
];
const TRANSITION_REQUIRED = ["from_status", "to_status", "prerequisite_evidence"];
const APPROVAL_REQUIRED = [
  "approver_name",
  "approver_role",
  "approved_at",
  "scope",
  "evidence_reference",
  "candidate_identity",
];
const COMMON_DEFS = {
  status: { enum: APPROVED_STATUSES },
  accountableFunction: { enum: ACCOUNTABLE_FUNCTIONS },
  profile: PROFILE_SCHEMA,
  nonEmptyString: NON_EMPTY_STRING_SCHEMA,
  nonEmptySortedUniqueStrings: SORTED_UNIQUE_STRINGS_SCHEMA,
  reference: REFERENCE_SCHEMA,
  referenceArray: REFERENCE_ARRAY_SCHEMA,
};
const MANIFEST_DOCUMENT_PATH_PATTERN = String.raw`^(?!/)(?!.*\\)(?!.*(?:^|/)\.\.?(?:/|$))(?!.*//)(?!.*\u0000)(?:docs/compliance/flowstate-pro/.+\.md|docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan\.md)$`;
const MANIFEST_DOCUMENT_PATH = new RegExp(MANIFEST_DOCUMENT_PATH_PATTERN);

const MANIFEST_SCHEMA_CONTRACT = {
  $schema: JSON_SCHEMA_DRAFT,
  $id: MANIFEST_SCHEMA_ID,
  title: "Flowstate Pro dossier manifest",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "documents"],
  properties: {
    schema_version: { const: 1 },
    documents: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/document" },
    },
  },
  $defs: {
    ...COMMON_DEFS,
    document: {
      type: "object",
      additionalProperties: false,
      required: MANIFEST_REQUIRED,
      properties: {
        document_id: {
          type: "string",
          pattern: "^[A-Z][A-Z0-9._-]{2,63}$",
        },
        path: {
          type: "string",
          pattern: MANIFEST_DOCUMENT_PATH_PATTERN,
        },
        title: { $ref: "#/$defs/nonEmptyString" },
        status: { $ref: "#/$defs/status" },
        owner: { $ref: "#/$defs/accountableFunction" },
        source: { $ref: "#/$defs/referenceArray" },
        affected_profiles: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { $ref: "#/$defs/profile" },
        },
        effective_date: DATE_SCHEMA,
        required_review: ACCOUNTABLE_ARRAY_SCHEMA,
        evidence_references: { $ref: "#/$defs/referenceArray" },
        latest_change_id: {
          type: "string",
          pattern: "^WP[0-9]+\\.[0-9]+-CC-[0-9]{3}$",
        },
      },
    },
  },
  "x-ordering": {
    documents: "path-ascending",
    array_fields: "lexicographic-ascending-unique",
  },
};
const REGISTER_SCHEMA_CONTRACT = {
  $schema: JSON_SCHEMA_DRAFT,
  $id: REGISTER_SCHEMA_ID,
  title: "Flowstate Pro change-control register",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "records"],
  properties: {
    schema_version: { const: 1 },
    records: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/record" },
    },
  },
  $defs: {
    ...COMMON_DEFS,
    approval: {
      type: "object",
      additionalProperties: false,
      required: APPROVAL_REQUIRED,
      properties: {
        approver_name: {
          type: "string",
          minLength: 1,
          pattern: APPROVER_NAME_PATTERN,
          not: { pattern: ACCOUNTABLE_NAME_PATTERN },
        },
        approver_role: { $ref: "#/$defs/accountableFunction" },
        approved_at: {
          type: "string",
          format: "date-time",
          pattern: TIMESTAMP_PATTERN,
          $comment: "The CLI checks Gregorian calendar dates and published leap seconds even when format is annotation-only.",
        },
        scope: { $ref: "#/$defs/nonEmptyString" },
        evidence_reference: { $ref: "#/$defs/reference" },
        candidate_identity: { $ref: "#/$defs/nonEmptyString" },
      },
    },
    transition: {
      type: "object",
      additionalProperties: false,
      required: TRANSITION_REQUIRED,
      properties: {
        from_status: { $ref: "#/$defs/status", not: { enum: TERMINAL_STATUSES } },
        to_status: { $ref: "#/$defs/status" },
        prerequisite_evidence: {
          $comment: "The CLI rejects reference reuse across status arrays; standard uniqueItems applies only within one array.",
          type: "object",
          minProperties: 1,
          propertyNames: { $ref: "#/$defs/status" },
          additionalProperties: { $ref: "#/$defs/referenceArray" },
        },
        approval_reference: { $ref: "#/$defs/reference" },
      },
      allOf: [
        {
          if: {
            properties: { to_status: { enum: APPROVAL_STATUSES } },
            required: ["to_status"],
          },
          then: { required: ["approval_reference"] },
          else: { not: { required: ["approval_reference"] } },
        },
        TRANSITION_GRAPH,
      ],
    },
    record: {
      type: "object",
      additionalProperties: false,
      required: REGISTER_REQUIRED,
      properties: {
        change_id: {
          type: "string",
          pattern: "^WP[0-9]+\\.[0-9]+-CC-[0-9]{3}$",
        },
        document_ids: { $ref: "#/$defs/nonEmptySortedUniqueStrings" },
        status: { $ref: "#/$defs/status" },
        owner: { $ref: "#/$defs/accountableFunction" },
        reason: { $ref: "#/$defs/nonEmptyString" },
        source: { $ref: "#/$defs/referenceArray" },
        affected_profiles: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { $ref: "#/$defs/profile" },
        },
        effective_date: DATE_SCHEMA,
        superseded_text: { $ref: "#/$defs/nonEmptyString" },
        required_review: ACCOUNTABLE_ARRAY_SCHEMA,
        evidence_references: { $ref: "#/$defs/referenceArray" },
        transition: { $ref: "#/$defs/transition" },
        legal_value: { type: "boolean" },
        approval: { $ref: "#/$defs/approval" },
      },
      oneOf: APPROVED_STATUSES.map((status) => ({
        properties: {
          status: { const: status },
          transition: { properties: { to_status: { const: status } } },
        },
      })),
      allOf: [
        {
          if: RECORD_APPROVAL_CONDITION,
          then: { required: ["approval"] },
          else: { not: { required: ["approval"] } },
        },
      ],
    },
  },
  "x-ordering": {
    records: "change_id-ascending",
    array_fields: "lexicographic-ascending-unique",
  },
  "x-transition-rules": TRANSITION_RULES,
};
const CREDENTIAL_KEY_SOURCE = "password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token";
const CREDENTIAL_KEY = new RegExp(`^(?:${CREDENTIAL_KEY_SOURCE})$`, "i");
const CREDENTIAL_MIN_LENGTH = 8;
const CONTENT_PATTERNS = [
  [
    "PRIVATE_KEY_HEADER",
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  ],
  ["AWS_ACCESS_KEY", /\bAKIA[0-9A-Z]{16}\b/g],
  [
    "GITHUB_TOKEN",
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
  ],
  ["STRIPE_LIVE_SECRET", /\bsk_live_[A-Za-z0-9]{16,}\b/g],
  ["GOOGLE_API_KEY", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  [
    "JWT",
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  ],
  [
    "BEARER_TOKEN",
    /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
  ],
  [
    "QUOTED_CREDENTIAL_ASSIGNMENT",
    new RegExp(String.raw`(["']?)\b(?:${CREDENTIAL_KEY_SOURCE})\1\s*[:=]\s*(["'])(?<value>(?:(?!\2)[^\\\r\n]|\\[^\r\n]){${CREDENTIAL_MIN_LENGTH},})\2`, "gi"),
  ],
  [
    "DATABASE_URL_CREDENTIALS",
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/(?<user>[^:\s/@]+):(?<value>[^@\s/]+)@[^\s]+/gi,
  ],
  [
    "CONTRACT_BODY_MARKER",
    /-----(?:BEGIN|END) (?:CONTRACT|AGREEMENT|BAA|DPA)-----/g,
  ],
];

class ToolingError extends Error {
  constructor(code, safePath = "repository") {
    super(code);
    this.code = code;
    this.safePath = safePath;
  }
}

function safeDiagnosticId(value) {
  if (typeof value !== "string") return undefined;
  if (!/^(?:[A-Z][A-Z0-9._-]{2,63}|WP[0-9]+\.[0-9]+-CC-[0-9]{3})$/.test(value)) {
    return "INVALID_ID";
  }
  return containsSensitiveDiagnosticValue(value) ? "INVALID_ID" : value;
}

function containsSensitiveDiagnosticValue(value) {
  if (typeof value !== "string") return false;
  for (const [, pattern] of CONTENT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) return true;
  }
  return !paymentCardMatches(value).next().done;
}

function safeDiagnosticToken(value, kind) {
  if (typeof value !== "string" || containsSensitiveDiagnosticValue(value)) {
    return `UNKNOWN_${kind.toUpperCase()}`;
  }
  if (
    kind === "field" &&
    (!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(value) ||
      /(?:secret|token|password|passwd|credential|payment|card|contract|agreement|private[_-]?key)/i.test(value))
  ) {
    return "UNKNOWN_FIELD";
  }
  if (kind === "path" && !/^[A-Za-z0-9._/+:-]+$/.test(value)) {
    return "UNKNOWN_PATH";
  }
  if (kind === "category" && !/^[A-Z][A-Z0-9_]{1,63}$/.test(value)) {
    return "UNKNOWN_CATEGORY";
  }
  return value;
}

function diagnostic(code, safePath, details = {}) {
  return {
    code,
    path: safeDiagnosticToken(safePath, "path"),
    id: safeDiagnosticId(details.id),
    field: details.field === undefined
      ? undefined
      : safeDiagnosticToken(details.field, "field"),
    category: details.category === undefined
      ? undefined
      : safeDiagnosticToken(details.category, "category"),
    line: details.line,
  };
}

function compareDiagnostics(left, right) {
  return ["code", "path", "id", "field", "category", "line"]
    .map((key) => String(left[key] ?? "").localeCompare(String(right[key] ?? "")))
    .find((value) => value !== 0) ?? 0;
}

export function formatDiagnostic(item) {
  const safePath = safeDiagnosticToken(item.path, "path");
  const safeId = safeDiagnosticId(item.id);
  const safeField = item.field === undefined
    ? undefined
    : safeDiagnosticToken(item.field, "field");
  const safeCategory = item.category === undefined
    ? undefined
    : safeDiagnosticToken(item.category, "category");
  const suffix = [
    safeId ? `id=${safeId}` : "",
    safeField ? `field=${safeField}` : "",
    safeCategory ? `category=${safeCategory}` : "",
    item.line ? `line=${item.line}` : "",
  ].filter(Boolean);
  return `${item.code} ${safePath}${suffix.length ? ` ${suffix.join(" ")}` : ""}`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

// ponytail: offline positive leap-second epochs from IANA leap-seconds.list;
// refresh when IERS publishes another leap second.
const LEAP_SECOND_EPOCHS = new Set([
  2287785600, 2303683200, 2335219200, 2366755200, 2398291200, 2429913600,
  2461449600, 2492985600, 2524521600, 2571782400, 2603318400, 2634854400,
  2698012800, 2776982400, 2840140800, 2871676800, 2918937600, 2950473600,
  2982009600, 3029443200, 3076704000, 3124137600, 3345062400, 3439756800,
  3550089600, 3644697600, 3692217600,
]);

function isValidTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }
  const match = value.match(TIMESTAMP);
  if (!match || !isValidDate(match[1])) return false;
  if (match[2] === "60") {
    const previousSecond = Date.parse(`${value.slice(0, 17)}59${value.slice(19)}`);
    return LEAP_SECOND_EPOCHS.has(Math.floor(previousSecond / 1000) + 1 + 2208988800);
  }
  return !Number.isNaN(Date.parse(value));
}

function isSortedUniqueStrings(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length &&
    value.every((item, index) => index === 0 || value[index - 1] < item)
  );
}

function isSortedUniqueProfiles(value) {
  return (
    isSortedUniqueStrings(value) &&
    value.every((item) => PROFILE_PATTERN.test(item))
  );
}

function isSortedUniqueAccountableFunctions(value, owners) {
  return isSortedUniqueStrings(value) && value.every((item) => owners.has(item));
}

function validateRelativePath(value) {
  if (!isNonEmptyString(value)) return "empty";
  if (value.includes("\0")) return "nul";
  if (value.includes("\\")) return "backslash";
  if (path.posix.isAbsolute(value)) return "absolute";
  const segments = value.split("/");
  if (segments.includes("..")) return "parent";
  if (path.posix.normalize(value) !== value || value === ".") return "noncanonical";
  return null;
}

function isManifestDocumentPath(value) {
  return typeof value === "string" && MANIFEST_DOCUMENT_PATH.test(value);
}

function isPathReference(value) {
  return typeof value === "string" && (value.includes("/") || value.startsWith("."));
}

function validateReference(value) {
  if (!isNonEmptyString(value)) return "empty";
  if (value.length > 256) return "length";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return "url";
  if (isPathReference(value)) {
    return /\s/.test(value) ? "whitespace" : validateRelativePath(value);
  }
  return /^[A-Za-z0-9][A-Za-z0-9._:+-]{1,255}$/.test(value)
    ? null
    : "identifier";
}

function addObjectShapeFindings({
  value,
  required,
  allowed,
  findings,
  codePrefix,
  safePath,
  id,
}) {
  if (!isObject(value)) {
    findings.push(diagnostic(`${codePrefix}_TYPE`, safePath, { id }));
    return false;
  }
  for (const field of required) {
    if (!Object.hasOwn(value, field)) {
      findings.push(
        diagnostic(`${codePrefix}_REQUIRED_FIELD`, safePath, { id, field }),
      );
    }
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      findings.push(
        diagnostic(`${codePrefix}_UNKNOWN_FIELD`, safePath, { id, field }),
      );
    }
  }
  return true;
}

function addStringFinding(findings, code, safePath, id, field, value) {
  if (!isNonEmptyString(value)) {
    findings.push(diagnostic(code, safePath, { id, field }));
  }
}

function addSortedArrayFinding(findings, code, safePath, id, field, value) {
  if (!isSortedUniqueStrings(value)) {
    findings.push(diagnostic(code, safePath, { id, field }));
  }
}

function addReferenceArrayFindings(findings, code, safePath, id, field, value) {
  addSortedArrayFinding(findings, code, safePath, id, field, value);
  if (!Array.isArray(value)) return;
  for (const reference of value) {
    if (validateReference(reference)) {
      findings.push(diagnostic(`${code}_REFERENCE`, safePath, { id, field }));
    }
  }
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function isRedactedCredential(value) {
  return /^(?:\[REDACTED\]|\*{3,})$/i.test(value);
}

function passesLuhn(digits) {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function* paymentCardMatches(text) {
  for (const run of text.matchAll(/\d+(?:[ -]\d+)*/g)) {
    const groups = [...run[0].matchAll(/\d+/g)];
    for (let start = 0; start < groups.length; start += 1) {
      let digits = "";
      for (let end = start; end < groups.length; end += 1) {
        const group = groups[end][0];
        if (digits.length + group.length > 19) break;
        digits += group;
        if (digits.length >= 13 && passesLuhn(digits)) {
          yield run.index + groups[start].index;
          break;
        }
      }
    }
  }
}

function checkPayloadMember(key, value, safePath, findings, details) {
  if (CREDENTIAL_KEY.test(key) && typeof value === "string" &&
    value.length >= CREDENTIAL_MIN_LENGTH && !isRedactedCredential(value)) {
    findings.push(diagnostic("PROHIBITED_CONTENT", safePath, {
      ...details, field: key, category: "QUOTED_CREDENTIAL_ASSIGNMENT",
    }));
  }
  if (!PROHIBITED_JSON_KEYS.has(key.toLowerCase()) || value === null) return;
  if (typeof value === "string" &&
    (!isNonEmptyString(value) || REDACTED_VALUES.has(value.trim().toUpperCase()))) return;
  if (Array.isArray(value) ? value.length === 0 : isObject(value) && Object.keys(value).length === 0) return;
  findings.push(diagnostic("PROHIBITED_JSON_PAYLOAD", safePath, {
    ...details, field: key, category: "PROHIBITED_PAYLOAD_KEY",
  }));
}

function scanMarkdownPayload(text, safePath, findings, id) {
  // ponytail: scan JSON member tokens throughout Markdown, not other serialization formats.
  // A container that does not immediately close is rejected without parsing its body.
  const char = String.raw`(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))`;
  const string = `"${char}*"`;
  const ws = String.raw`[ \t\r\n]*`;
  // A standalone JSON string occupies one line, with or without a fence.
  const strings = new RegExp(String.raw`[:,\[](?=${ws}(${string})${ws}[,}\]])|^(?=[ \t]*(${string})[ \t]*\r?$)`, "gm");
  for (const [, memberOrElement, standalone] of text.matchAll(strings)) {
    const token = memberOrElement ?? standalone;
    if (token.includes("\\")) scanDecodedString(JSON.parse(token), safePath, findings, id);
  }
  const scalar = String.raw`(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![\w.+-])`;
  const valueStart = String.raw`${string}|${scalar}|\[(?:${ws}\])?|\{(?:${ws}\})?`;
  // Probe each quote independently: surrounding Markdown can contain unmatched quotes.
  const valueAt = new RegExp(`${ws}:${ws}(${valueStart})`, "y");
  for (const match of text.matchAll(new RegExp(String.raw`(?<!\\)(?=(${string})${ws}:)`, "g"))) {
    const keyToken = match[1];
    const keyName = JSON.parse(keyToken);
    if (keyToken.includes("\\")) scanDecodedString(keyName, safePath, findings, id);
    if (!PROHIBITED_JSON_KEYS.has(keyName.toLowerCase()) && !CREDENTIAL_KEY.test(keyName)) continue;
    valueAt.lastIndex = match.index + match[1].length;
    const valueToken = valueAt.exec(text)?.[1];
    if (valueToken === undefined) continue;
    const value = valueToken === "[" || valueToken === "{" ? true : JSON.parse(valueToken);
    checkPayloadMember(keyName, value, safePath, findings, { id });
  }
}

function scanDecodedString(value, safePath, findings, id, field) {
  for (const item of scanContent(value, safePath)) {
    findings.push(diagnostic(item.code, safePath, { id, field, category: item.category }));
  }
}

function scanJsonPayload(value, safePath, findings, field, inheritedId) {
  if (typeof value === "string") return scanDecodedString(value, safePath, findings, inheritedId, field);
  if (Array.isArray(value)) {
    for (const entry of value) scanJsonPayload(entry, safePath, findings, field, inheritedId);
    return;
  }
  if (!isObject(value)) return;
  const currentId = value.change_id ?? value.document_id ?? inheritedId;
  for (const [key, child] of Object.entries(value)) {
    scanDecodedString(key, safePath, findings, currentId);
    checkPayloadMember(key, child, safePath, findings, { id: currentId });
    scanJsonPayload(child, safePath, findings, key, currentId);
  }
}

export function scanContent(text, safePath, parsedJson) {
  const findings = [];
  for (const [category, pattern] of CONTENT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      // Only named groups carry credential values; delimiters are not part of them.
      if (match.groups && Object.values(match.groups).every(isRedactedCredential)) continue;
      findings.push(
        diagnostic("PROHIBITED_CONTENT", safePath, {
          category,
          line: lineAt(text, match.index),
        }),
      );
    }
  }

  for (const index of paymentCardMatches(text)) {
    findings.push(
      diagnostic("PROHIBITED_CONTENT", safePath, {
        category: "PAYMENT_CARD_LUHN",
        line: lineAt(text, index),
      }),
    );
  }

  if (parsedJson !== undefined) {
    scanJsonPayload(parsedJson, safePath, findings);
  }
  return findings.sort(compareDiagnostics);
}

function schemaContract(manifestSchema, registerSchema, findings) {
  if (
    !isDeepStrictEqual(manifestSchema, MANIFEST_SCHEMA_CONTRACT) ||
    !isDeepStrictEqual(registerSchema, REGISTER_SCHEMA_CONTRACT)
  ) {
    findings.push(diagnostic("SCHEMA_CONTRACT_DRIFT", "schemas"));
    return null;
  }
  const { document: manifestDocument } = MANIFEST_SCHEMA_CONTRACT.$defs;
  const { record: registerRecord, transition, approval } = REGISTER_SCHEMA_CONTRACT.$defs;
  return {
    statuses: new Set(APPROVED_STATUSES),
    owners: new Set(ACCOUNTABLE_FUNCTIONS),
    manifestRequired: manifestDocument.required,
    manifestAllowed: new Set(Object.keys(manifestDocument.properties)),
    registerRequired: registerRecord.required,
    registerAllowed: new Set(Object.keys(registerRecord.properties)),
    transitionRequired: transition.required,
    transitionAllowed: new Set(Object.keys(transition.properties)),
    approvalRequired: approval.required,
    approvalAllowed: new Set(Object.keys(approval.properties)),
    rules: TRANSITION_RULES,
  };
}

export function validateManifest(manifest, contract, safePath = MANIFEST_PATH) {
  const findings = [];
  if (
    !addObjectShapeFindings({
      value: manifest,
      required: ["schema_version", "documents"],
      allowed: new Set(["schema_version", "documents"]),
      findings,
      codePrefix: "MANIFEST_ROOT",
      safePath,
    })
  ) {
    return findings;
  }
  if (manifest.schema_version !== 1) {
    findings.push(
      diagnostic("MANIFEST_SCHEMA_VERSION", safePath, {
        field: "schema_version",
      }),
    );
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    findings.push(
      diagnostic("MANIFEST_DOCUMENTS_TYPE", safePath, { field: "documents" }),
    );
    return findings;
  }

  const ids = new Set();
  const paths = new Set();
  let priorPath = "";
  for (const entry of manifest.documents) {
    const id = isObject(entry) && isNonEmptyString(entry.document_id)
      ? entry.document_id
      : undefined;
    if (
      !addObjectShapeFindings({
        value: entry,
        required: contract.manifestRequired,
        allowed: contract.manifestAllowed,
        findings,
        codePrefix: "MANIFEST",
        safePath,
        id,
      })
    ) {
      continue;
    }
    if (!id || !DOCUMENT_ID.test(id)) {
      findings.push(
        diagnostic("MANIFEST_DOCUMENT_ID", safePath, {
          id,
          field: "document_id",
        }),
      );
    } else if (ids.has(entry.document_id)) {
      findings.push(
        diagnostic("MANIFEST_DUPLICATE_DOCUMENT_ID", safePath, { id }),
      );
    }
    ids.add(entry.document_id);

    if (!isManifestDocumentPath(entry.path)) {
      findings.push(
        diagnostic("MANIFEST_PATH", safePath, { id, field: "path" }),
      );
    } else {
      const normalized = path.posix.normalize(entry.path);
      if (paths.has(normalized)) {
        findings.push(
          diagnostic("MANIFEST_DUPLICATE_PATH", safePath, {
            id,
            field: "path",
          }),
        );
      }
      paths.add(normalized);
      if (priorPath && priorPath >= entry.path) {
        findings.push(
          diagnostic("MANIFEST_ORDER", safePath, { id, field: "path" }),
        );
      }
      priorPath = entry.path;
    }

    addStringFinding(findings, "MANIFEST_STRING", safePath, id, "title", entry.title);
    if (!contract.owners.has(entry.owner)) {
      findings.push(
        diagnostic("MANIFEST_OWNER", safePath, { id, field: "owner" }),
      );
    }
    if (!contract.statuses.has(entry.status)) {
      findings.push(
        diagnostic("MANIFEST_STATUS", safePath, { id, field: "status" }),
      );
    }
    addReferenceArrayFindings(
      findings,
      "MANIFEST_SOURCE",
      safePath,
      id,
      "source",
      entry.source,
    );
    if (!isSortedUniqueProfiles(entry.affected_profiles)) {
      findings.push(
        diagnostic("MANIFEST_PROFILES", safePath, {
          id,
          field: "affected_profiles",
        }),
      );
    }
    if (!isValidDate(entry.effective_date)) {
      findings.push(
        diagnostic("MANIFEST_DATE", safePath, {
          id,
          field: "effective_date",
        }),
      );
    }
    if (!isSortedUniqueAccountableFunctions(entry.required_review, contract.owners)) {
      findings.push(
        diagnostic("MANIFEST_REVIEW", safePath, {
          id,
          field: "required_review",
        }),
      );
    }
    addReferenceArrayFindings(
      findings,
      "MANIFEST_EVIDENCE",
      safePath,
      id,
      "evidence_references",
      entry.evidence_references,
    );
    if (typeof entry.latest_change_id !== "string" || !CHANGE_ID.test(entry.latest_change_id)) {
      findings.push(
        diagnostic("MANIFEST_CHANGE_ID", safePath, {
          id,
          field: "latest_change_id",
        }),
      );
    }
  }
  return findings.sort(compareDiagnostics);
}

function validateApproval(approval, contract, safePath, id, findings) {
  if (
    !addObjectShapeFindings({
      value: approval,
      required: contract.approvalRequired,
      allowed: contract.approvalAllowed,
      findings,
      codePrefix: "APPROVAL",
      safePath,
      id,
    })
  ) {
    return;
  }
  for (const field of ["scope", "evidence_reference", "candidate_identity"]) {
    addStringFinding(findings, "APPROVAL_STRING", safePath, id, field, approval[field]);
  }
  if (!contract.owners.has(approval.approver_role)) {
    findings.push(
      diagnostic("APPROVAL_ROLE", safePath, {
        id,
        field: "approver_role",
      }),
    );
  }
  const name = approval.approver_name;
  if (typeof name !== "string" || !APPROVER_NAME.test(name) || ACCOUNTABLE_NAME.test(name)) {
    findings.push(
      diagnostic("APPROVAL_NAMED_PERSON", safePath, {
        id,
        field: "approver_name",
      }),
    );
  }
  if (!isValidTimestamp(approval.approved_at)) {
    findings.push(
      diagnostic("APPROVAL_TIMESTAMP", safePath, {
        id,
        field: "approved_at",
      }),
    );
  }
  if (validateReference(approval.evidence_reference)) {
    findings.push(
      diagnostic("APPROVAL_REFERENCE", safePath, {
        id,
        field: "evidence_reference",
      }),
    );
  }
}

function validateTransition(record, contract, safePath, id, findings, dispositionIds) {
  const transition = record.transition;
  if (
    !addObjectShapeFindings({
      value: transition,
      required: contract.transitionRequired,
      allowed: contract.transitionAllowed,
      findings,
      codePrefix: "TRANSITION",
      safePath,
      id,
    })
  ) {
    return;
  }
  if (!contract.statuses.has(transition.from_status)) {
    findings.push(
      diagnostic("TRANSITION_STATUS", safePath, {
        id,
        field: "from_status",
      }),
    );
  }
  if (
    !contract.statuses.has(transition.to_status) ||
    transition.to_status !== record.status
  ) {
    findings.push(
      diagnostic("TRANSITION_TO_STATUS", safePath, {
        id,
        field: "to_status",
      }),
    );
  }

  const prerequisites = transition.prerequisite_evidence;
  const nonDisposition = !contract.rules.terminal_dispositions.includes(record.status);
  const isDispositionEvidence = (reference) => nonDisposition && dispositionIds.has(reference);
  for (const [field, references] of [
    ["approval_reference", [transition.approval_reference]],
    ["approval.evidence_reference", [record.approval?.evidence_reference]],
    ["evidence_references", record.evidence_references],
  ]) {
    if (Array.isArray(references) && references.some(isDispositionEvidence)) {
      findings.push(diagnostic("TRANSITION_DISPOSITION_EVIDENCE", safePath, { id, field }));
    }
  }
  if (!isObject(prerequisites) || Object.keys(prerequisites).length === 0) {
    findings.push(
      diagnostic("TRANSITION_PREREQUISITES", safePath, {
        id,
        field: "prerequisite_evidence",
      }),
    );
  } else {
    const seenEvidence = new Set();
    for (const [status, references] of Object.entries(prerequisites)) {
      if (!contract.statuses.has(status) || !isSortedUniqueStrings(references)) {
        findings.push(
          diagnostic("TRANSITION_PREREQUISITE_ENTRY", safePath, {
            id,
            field: status,
          }),
        );
        continue;
      }
      for (const reference of references) {
        if (isDispositionEvidence(reference)) {
          findings.push(diagnostic("TRANSITION_DISPOSITION_EVIDENCE", safePath, { id, field: status }));
        }
        if (validateReference(reference)) {
          findings.push(
            diagnostic("TRANSITION_PREREQUISITE_REFERENCE", safePath, {
              id,
              field: status,
            }),
          );
        }
        if (seenEvidence.has(reference)) {
          findings.push(
            diagnostic("TRANSITION_PREREQUISITE_REUSE", safePath, {
              id,
              field: status,
            }),
          );
        }
        seenEvidence.add(reference);
      }
    }
  }

  const adjacent = contract.rules.adjacent.some(([from, to]) =>
    from === transition.from_status && to === transition.to_status);
  if (transition.to_status === "APPROVED_FOR_PROFILE") {
    if (
      transition.from_status !== contract.rules.approved_for_profile_from
    ) {
      findings.push(
        diagnostic("TRANSITION_APPROVED_FOR_PROFILE_SOURCE", safePath, {
          id,
          field: "from_status",
        }),
      );
    }
    for (const status of contract.rules.approved_for_profile_prerequisites) {
      if (!isSortedUniqueStrings(prerequisites?.[status])) {
        findings.push(
          diagnostic("TRANSITION_MISSING_PREREQUISITE", safePath, {
            id,
            field: status,
          }),
        );
      }
    }
  } else if (
    contract.rules.terminal_dispositions.includes(transition.to_status) &&
    contract.statuses.has(transition.from_status) &&
    !contract.rules.terminal_dispositions.includes(transition.from_status)
  ) {
    if (!isSortedUniqueStrings(prerequisites?.[transition.from_status])) {
      findings.push(diagnostic("TRANSITION_MISSING_PREREQUISITE", safePath, {
        id,
        field: transition.from_status,
      }));
    }
  } else if (!adjacent) {
    findings.push(
      diagnostic("TRANSITION_UNLISTED", safePath, { id, field: "transition" }),
    );
  }

  const requiresApprovalReference =
    contract.rules.approval_required_to_statuses.includes(transition.to_status);
  if (
    requiresApprovalReference &&
    (!isNonEmptyString(transition.approval_reference) ||
      validateReference(transition.approval_reference))
  ) {
    findings.push(
      diagnostic("TRANSITION_APPROVAL_REFERENCE_REQUIRED", safePath, {
        id,
        field: "approval_reference",
      }),
    );
  }
  if (!requiresApprovalReference && Object.hasOwn(transition, "approval_reference")) {
    findings.push(
      diagnostic("TRANSITION_APPROVAL_REFERENCE_FORBIDDEN", safePath, {
        id,
        field: "approval_reference",
      }),
    );
  }
}

export function validateRegister(
  register,
  manifest,
  contract,
  safePath = REGISTER_PATH,
) {
  const findings = [];
  if (
    !addObjectShapeFindings({
      value: register,
      required: ["schema_version", "records"],
      allowed: new Set(["schema_version", "records"]),
      findings,
      codePrefix: "REGISTER_ROOT",
      safePath,
    })
  ) {
    return findings;
  }
  if (register.schema_version !== 1) {
    findings.push(
      diagnostic("REGISTER_SCHEMA_VERSION", safePath, {
        field: "schema_version",
      }),
    );
  }
  if (!Array.isArray(register.records) || register.records.length === 0) {
    findings.push(
      diagnostic("REGISTER_RECORDS_TYPE", safePath, { field: "records" }),
    );
    return findings;
  }

  const documentIds = new Set(
    Array.isArray(manifest?.documents)
      ? manifest.documents.map((entry) => entry?.document_id)
      : [],
  );
  const changeIds = new Set();
  const dispositionIds = new Set(register.records
    .filter((record) => isObject(record) && contract.rules.terminal_dispositions.includes(record.status))
    .map((record) => record.change_id));
  let priorId = "";
  for (const record of register.records) {
    const id = isObject(record) && isNonEmptyString(record.change_id)
      ? record.change_id
      : undefined;
    if (
      !addObjectShapeFindings({
        value: record,
        required: contract.registerRequired,
        allowed: contract.registerAllowed,
        findings,
        codePrefix: "REGISTER",
        safePath,
        id,
      })
    ) {
      continue;
    }
    if (!id || !CHANGE_ID.test(id)) {
      findings.push(
        diagnostic("REGISTER_CHANGE_ID", safePath, {
          id,
          field: "change_id",
        }),
      );
    } else {
      if (changeIds.has(id)) {
        findings.push(diagnostic("REGISTER_DUPLICATE_CHANGE_ID", safePath, { id }));
      }
      changeIds.add(id);
      if (priorId && priorId >= id) {
        findings.push(diagnostic("REGISTER_ORDER", safePath, { id }));
      }
      priorId = id;
    }

    addSortedArrayFinding(
      findings,
      "REGISTER_DOCUMENT_IDS",
      safePath,
      id,
      "document_ids",
      record.document_ids,
    );
    if (Array.isArray(record.document_ids)) {
      for (const documentId of record.document_ids) {
        if (!documentIds.has(documentId)) {
          findings.push(
            diagnostic("REGISTER_UNKNOWN_DOCUMENT_ID", safePath, {
              id,
              field: "document_ids",
            }),
          );
        }
      }
    }
    if (!contract.statuses.has(record.status)) {
      findings.push(
        diagnostic("REGISTER_STATUS", safePath, { id, field: "status" }),
      );
    }
    if (!contract.owners.has(record.owner)) {
      findings.push(
        diagnostic("REGISTER_OWNER", safePath, { id, field: "owner" }),
      );
    }
    addStringFinding(findings, "REGISTER_STRING", safePath, id, "reason", record.reason);
    if (!isNonEmptyString(record.superseded_text)) {
      findings.push(
        diagnostic("REGISTER_SUPERSEDED_TEXT", safePath, {
          id,
          field: "superseded_text",
        }),
      );
    }
    addReferenceArrayFindings(
      findings,
      "REGISTER_SOURCE",
      safePath,
      id,
      "source",
      record.source,
    );
    if (!isSortedUniqueProfiles(record.affected_profiles)) {
      findings.push(
        diagnostic("REGISTER_PROFILES", safePath, {
          id,
          field: "affected_profiles",
        }),
      );
    }
    if (!isValidDate(record.effective_date)) {
      findings.push(
        diagnostic("REGISTER_DATE", safePath, {
          id,
          field: "effective_date",
        }),
      );
    }
    if (!isSortedUniqueAccountableFunctions(record.required_review, contract.owners)) {
      findings.push(
        diagnostic("REGISTER_REVIEW", safePath, {
          id,
          field: "required_review",
        }),
      );
    }
    addReferenceArrayFindings(
      findings,
      "REGISTER_EVIDENCE",
      safePath,
      id,
      "evidence_references",
      record.evidence_references,
    );
    if (typeof record.legal_value !== "boolean") {
      findings.push(
        diagnostic("REGISTER_LEGAL_VALUE", safePath, {
          id,
          field: "legal_value",
        }),
      );
    }

    validateTransition(record, contract, safePath, id, findings, dispositionIds);

    const approvalRequired = record.status === "APPROVED_FOR_PROFILE" ||
      (record.legal_value === true && LEGAL_APPROVAL_STATUSES.includes(record.status));
    if (approvalRequired) {
      if (!Object.hasOwn(record, "approval")) {
        findings.push(
          diagnostic("APPROVAL_REQUIRED", safePath, {
            id,
            field: "approval",
          }),
        );
      } else {
        validateApproval(record.approval, contract, safePath, id, findings);
      }
    } else if (Object.hasOwn(record, "approval")) {
      findings.push(
        diagnostic("APPROVAL_FORBIDDEN", safePath, {
          id,
          field: "approval",
        }),
      );
    }
  }
  return findings.sort(compareDiagnostics);
}

const DECLARED_STATUS_CONFLICT = Symbol("DECLARED_STATUS_CONFLICT");
const STATUS_LABEL_FORMAT = /\p{Cf}/gu;

const HTML_BLOCK_TAGS = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
const HTML_ATTRIBUTE_NAME = String.raw`[A-Za-z_:][A-Za-z0-9_.:-]*`;
const HTML_ATTRIBUTE_VALUE = String.raw`(?:[^\s"'=<>\x60]+|'[^']*'|"[^"]*")`;
const HTML_ATTRIBUTE = String.raw`(?:[ \t]+${HTML_ATTRIBUTE_NAME}(?:[ \t]*=[ \t]*${HTML_ATTRIBUTE_VALUE})?)`;
const COMPLETE_CUSTOM_OPEN_TAG = new RegExp(
  `^ {0,3}<[A-Za-z][A-Za-z0-9-]*${HTML_ATTRIBUTE}*[ \\t]*\\/?>` +
    String.raw`(?:[ \t]+.*)?$`,
);
const COMPLETE_CUSTOM_OPEN_TAG_WITH_CONTENT = new RegExp(
  `^ {0,3}<[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9-]+${HTML_ATTRIBUTE}*[ \\t]*\\/?>.*$`,
);
const COMPLETE_CUSTOM_CLOSE_TAG =
  /^ {0,3}<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>(?:[ \t]+.*)?$/;

function htmlBlockStart(line) {
  const indent = " {0,3}";
  if (new RegExp(`^${indent}<!--`).test(line)) return { end: /-->/ };
  if (new RegExp(`^${indent}<\\?`).test(line)) return { end: /\?>/ };
  if (new RegExp(`^${indent}<!\\[CDATA\\[`).test(line)) return { end: /\]\]>/ };
  if (new RegExp(`^${indent}<![A-Z]`).test(line)) return { end: />/ };
  const typeOne = line.match(/^ {0,3}<(script|pre|style|textarea)(?:[ \t]|>|$)/i);
  if (typeOne) return { end: new RegExp(`<\\/${typeOne[1]}[ \\t]*>`, "i") };
  if (
    new RegExp(`^${indent}<\\/?(?:${HTML_BLOCK_TAGS})(?:[ \\t]|\\/?>(?:.|$))`, "i").test(line)
  ) {
    return { blankEnds: true };
  }
  if (
    COMPLETE_CUSTOM_OPEN_TAG.test(line) ||
    COMPLETE_CUSTOM_OPEN_TAG_WITH_CONTENT.test(line) ||
    COMPLETE_CUSTOM_CLOSE_TAG.test(line)
  ) {
    return { blankEnds: true };
  }
  return null;
}

const REFERENCE_TITLE = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\))`;
const REFERENCE_TITLE_ONLY = new RegExp(`^ {0,3}${REFERENCE_TITLE}[ \\t]*$`);
const REFERENCE_TITLE_EXACT = new RegExp(`^${REFERENCE_TITLE}[ \\t]*$`);
const REFERENCE_TITLE_START = /^ {0,3}(["'(])(.*)$/;
const REFERENCE_TITLE_START_CONTENT = /^(["'(])(.*)$/;
const MAX_REFERENCE_DESTINATION_NESTING = 32;

function referenceDestinationEnd(value) {
  if (value.startsWith("<")) {
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const character = value[index];
      if (/[\u0000-\u0020\u007f]/u.test(character)) {
        return null;
      }
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "<") {
        return null;
      } else if (character === ">") {
        return index + 1;
      }
    }
    return null;
  }

  let depth = 0;
  let escaped = false;
  let index = 0;
  for (; index < value.length; index += 1) {
    const character = value[index];
    if (character === " " || character === "\t") break;
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "<" || character === ">") {
      return null;
    } else if (character === "(") {
      depth += 1;
      if (depth > MAX_REFERENCE_DESTINATION_NESTING) return null;
    } else if (character === ")") {
      if (depth === 0) return null;
      depth -= 1;
    } else if (/[\u0000-\u001f\u007f]/u.test(character)) {
      return null;
    }
  }
  return index > 0 && depth === 0 && !escaped ? index : null;
}

function referenceDestinationLineState(line) {
  const content = line.slice(line.match(/^ {0,3}/)[0].length);
  const destinationEnd = referenceDestinationEnd(content);
  if (destinationEnd === null) return null;
  const remainder = content.slice(destinationEnd);
  if (/^[ \t]*$/.test(remainder)) return { kind: "destination" };
  const separator = remainder.match(/^[ \t]+/);
  if (!separator) return null;
  const title = remainder.slice(separator[0].length);
  if (REFERENCE_TITLE_EXACT.test(title)) return { kind: "complete" };
  const titleEnd = referenceTitleEnd(title, REFERENCE_TITLE_START_CONTENT);
  return titleEnd ? { kind: "multiline-title", end: titleEnd } : null;
}

function referenceTitleEnd(line, pattern) {
  const match = line.match(pattern);
  if (!match) return null;
  const end = match[1] === "(" ? ")" : match[1];
  let escaped = false;
  for (const character of match[2]) {
    if (character === end && !escaped) return null;
    escaped = character === "\\" ? !escaped : false;
  }
  return end;
}

function terminatesReferenceContinuation(line) {
  return /^(?: {4}| {0,3}\t)/.test(line);
}

function referenceTitleLineState(line, end) {
  let escaped = false;
  const content = line.slice(line.match(/^ {0,3}/)[0].length);
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === end && !escaped) {
      return /^[ \t]*$/.test(content.slice(index + 1)) ? "close" : "terminate";
    }
    escaped = character === "\\" ? !escaped : false;
  }
  return "continue";
}

function scanMarkdownStructure(text) {
  const lines = text.split("\n").map((line) =>
    line.endsWith("\r") ? line.slice(0, -1) : line
  );
  const visible = [...lines];
  let fence = null;
  let html = null;
  let referenceContinuation = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      visible[index] = null;
      const closingFence = line.match(/^( {0,3})(`+|~+)[ \t]*$/);
      if (
        closingFence &&
        closingFence[2][0] === fence.marker &&
        closingFence[2].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    if (html) {
      if (html.blankEnds && line.trim() === "") {
        html = null;
      } else {
        visible[index] = null;
        if (html.end?.test(line)) html = null;
        continue;
      }
    }
    if (referenceContinuation) {
      if (line.trim() === "") {
        referenceContinuation = null;
      } else if (terminatesReferenceContinuation(line)) {
        referenceContinuation = null;
      } else if (referenceContinuation.kind === "multiline-title") {
        const lineState = referenceTitleLineState(line, referenceContinuation.end);
        if (lineState === "terminate") {
          referenceContinuation = null;
        } else {
          visible[index] = null;
          if (lineState === "close") referenceContinuation = null;
          continue;
        }
      } else if (referenceContinuation.kind === "footnote") {
        visible[index] = null;
        continue;
      } else if (referenceContinuation.kind === "destination") {
        const destination = referenceDestinationLineState(line);
        if (destination?.kind === "complete") {
          visible[index] = null;
          referenceContinuation = null;
          continue;
        }
        if (destination?.kind === "multiline-title") {
          visible[index] = null;
          referenceContinuation = destination;
          continue;
        }
        if (destination?.kind === "destination") {
          visible[index] = null;
          referenceContinuation = { kind: "title" };
          continue;
        }
        referenceContinuation = null;
      } else if (REFERENCE_TITLE_ONLY.test(line)) {
        visible[index] = null;
        referenceContinuation = null;
        continue;
      } else {
        const titleEnd = referenceTitleEnd(line, REFERENCE_TITLE_START);
        if (titleEnd) {
          visible[index] = null;
          referenceContinuation = { kind: "multiline-title", end: titleEnd };
          continue;
        }
        referenceContinuation = null;
      }
    }
    const openingFence = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
    if (
      openingFence &&
      !(openingFence[2][0] === "`" && openingFence[3].includes("`"))
    ) {
      fence = { marker: openingFence[2][0], length: openingFence[2].length };
      visible[index] = null;
      continue;
    }
    const openingHtml = htmlBlockStart(line);
    if (openingHtml) {
      visible[index] = null;
      if (!openingHtml.end || !openingHtml.end.test(line)) html = openingHtml;
      continue;
    }
    const reference = line.match(/^ {0,3}\[((?:\\.|[^\]\\])+)]\:[ \t]*(.*)$/);
    if (reference) {
      visible[index] = null;
      if (reference[2] === "") {
        referenceContinuation = {
          kind: reference[1].startsWith("^") ? "footnote" : "destination",
        };
      } else {
        const destination = referenceDestinationLineState(reference[2]);
        if (destination?.kind === "destination") referenceContinuation = { kind: "title" };
        if (destination?.kind === "multiline-title") referenceContinuation = destination;
      }
    }
  }
  return visible;
}

function isThematicBreak(line) {
  const match = line.match(/^ {0,3}([*_-])(?:[ \t]*\1){2,}[ \t]*$/);
  return match !== null;
}

function isLinkReferenceDefinition(line) {
  return /^ {0,3}\[(?:\\.|[^\]\\])+\]:[ \t]*(?:\S|$)/.test(line);
}

function isSetextHeadingContent(line) {
  return (
    /^ {0,3}\S.*$/.test(line) &&
    !/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line) &&
    !/^ {0,3}(?:>|[-+*](?:[ \t]+|$)|\d{1,9}[.)](?:[ \t]+|$))/.test(line) &&
    !/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) &&
    !isThematicBreak(line) &&
    !isLinkReferenceDefinition(line)
  );
}

function hasMarkdownH1(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (typeof line !== "string") continue;
    if (/^ {0,3}#(?!#)[ \t]+\S/.test(line)) return true;
    if (
      isSetextHeadingContent(line) &&
      typeof lines[index + 1] === "string" &&
      /^ {0,3}=+[ \t]*$/.test(lines[index + 1])
    ) {
      return true;
    }
  }
  return false;
}

function isStatusLabelToken(label) {
  return label.toLowerCase().replace(STATUS_LABEL_FORMAT, "").replace(/[^a-z]/g, "") ===
    "status";
}

function isStatusValueShape(line) {
  if (typeof line !== "string") return false;
  const value = line.trim();
  return (
    /^`.*`$/u.test(value) ||
    /^[A-Z][A-Z0-9_]*$/u.test(value) ||
    APPROVED_STATUSES.includes(value.toUpperCase())
  );
}

function normalizeDeclaredStatus(text) {
  const approvedProse = new Map([
    [
      "APPROVED PLANNING BASELINE — implementation and production approval remain separate",
      "APPROVED",
    ],
    [
      "APPROVED PLANNING BASELINE. Product and architecture decisions Q1–Q206 are approved; supporting specifications, legal values, vendor agreements, operating evidence, production activation, and public claims remain separately gated. This plan is not legal advice, certification, an executed agreement, or proof that Flowstate currently operates a compliant service.",
      "APPROVED",
    ],
    [
      "APPROVED PRODUCT/ARCHITECTURE DECISIONS; WP0.3 is complete; WP0.4 implementation is technically verified and awaiting independent reviews and human acceptance; legal, vendor, policy, accountable-human, evidence, and production approvals remain `BLOCKED`; G0 remains `BLOCKED`; WP1.x is unauthorized",
      "APPROVED",
    ],
    [
      "SPECIFIED BENCHMARK — G0 `BLOCKED`; WP1.x unauthorized; benchmark evidence only",
      "SPECIFIED",
    ],
    [
      "SPECIFIED on 2026-09-23; G0 remains `BLOCKED`; WP1.x is unauthorized",
      "SPECIFIED",
    ],
    [
      "`TECHNICALLY_VERIFIED` repository snapshot; root package gates are `BLOCKED` by missing local prerequisites  ",
      "TECHNICALLY_VERIFIED",
    ],
    [
      "SPECIFIED PLANNING TARGET — WP0.3 reconciled; field inventory, legal values, vendors, agreements, accountable humans and deployed evidence remain `BLOCKED`; G0 remains `BLOCKED`",
      "SPECIFIED",
    ],
    [
      "SPECIFIED counsel-input contract; all tenant/profile conclusions remain `COUNSEL_REVIEW_REQUIRED`; G0 remains `BLOCKED`",
      "SPECIFIED",
    ],
    [
      "SPECIFIED — G0 `BLOCKED`; WP1.x unauthorized; staffing, operating evidence, exercises, legal review, vendor approval, profile approval, and production authorization remain `BLOCKED`",
      "SPECIFIED",
    ],
    [
      "SPECIFIED — WP0.2 HUMAN REVIEWS ACCEPTED 2026-09-22; Gate G0 remains `BLOCKED`",
      "SPECIFIED",
    ],
    [
      "SPECIFIED PLANNING TARGET — Gate G0 remains `BLOCKED`; no current compliance, implementation, operational-evidence, or production-approval claim",
      "SPECIFIED",
    ],
    [
      "SPECIFIED PLANNING TARGET — Gate G0 remains `BLOCKED`; not implemented, deployed, legally reviewed, or approved for production",
      "SPECIFIED",
    ],
  ]);
  const headingProse = new Map([
    [
      "COMPLETED 2026-09-22 — TECHNICALLY VERIFIED; PROJECT OWNER ACCEPTED ALL FIVE REQUIRED WP0.2 REVIEW ROLES; G0 BLOCKED; PRE-EXISTING WP0.1 STATUS PATHS PRESENT",
      "APPROVED",
    ],
    [
      "COMPLETED 2026-09-23 — SPECIFICATION PASS; TECHNICAL QUALITY APPROVED; HUMAN ACCEPTANCE RECORDED; WP0.4 AUTHORIZED BUT NOT STARTED; COUNSEL VALUES UNRESOLVED; G0 BLOCKED; WP1.x UNAUTHORIZED",
      "APPROVED",
    ],
  ]);
  const canonical = (value) => {
    if (
      value.length === 0 ||
      (value.trim() !== value && !approvedProse.has(value)) ||
      /[\u200B-\u200D\u2060\uFEFF]/u.test(value)
    ) {
      return false;
    }
    if (APPROVED_STATUSES.includes(value)) return value;
    return approvedProse.get(value) ?? false;
  };

  const declarations = [];
  const lines = scanMarkdownStructure(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === null) continue;

    const heading = line.match(/^ {0,3}(#{1,6})([ \t]+)(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const separator = heading[2];
      const label = heading[3];
      let valueIndex = index + 1;
      while (valueIndex < lines.length && lines[valueIndex] === "") valueIndex += 1;
      const nextLineValue = lines[valueIndex];
      if (level === 2 && separator === " " && label === "Status") {
        const match = nextLineValue?.match(/^`([^`]+)`$/);
        declarations.push(
          match
            ? APPROVED_STATUSES.includes(match[1])
              ? match[1]
              : headingProse.get(match[1]) ?? false
            : false,
        );
        if (match) index = valueIndex;
      } else if (isStatusLabelToken(label) && (level === 2 || isStatusValueShape(nextLineValue))) {
        declarations.push(false);
      }
      continue;
    }

    const paragraph = line.match(/^[ \t]{0,3}(.*)$/);
    const emphasizedLabel = paragraph?.[1].match(
      /^((?:\\?[*_])+)([^*_\r\n]*?)((?:\\?[*_])+)([ \t]*)(.*)$/,
    );
    if (!emphasizedLabel || !isStatusLabelToken(emphasizedLabel[2])) continue;
    const [, opening, label, closing, separator, value] = emphasizedLabel;
    let valueIndex = index + 1;
    while (valueIndex < lines.length && lines[valueIndex] === "") valueIndex += 1;
    const nextLineValue = lines[valueIndex];
    if (
      opening === "**" &&
      closing === "**" &&
      label === "Status:" &&
      separator === " "
    ) {
      declarations.push(canonical(value));
    } else if (
      (opening === "**" && closing === "**") ||
      isStatusValueShape(value) ||
      isStatusValueShape(nextLineValue)
    ) {
      declarations.push(false);
    }
  }

  if (declarations.some((status) => status === false)) return false;
  if (new Set(declarations).size > 1) return DECLARED_STATUS_CONFLICT;
  return declarations[0] ?? null;
}

async function readUtf8File(fullPath, safePath) {
  let bytes;
  try {
    if (!(await stat(fullPath)).isFile()) throw new ToolingError("READ_FAILED", safePath);
    bytes = await readFile(fullPath);
  } catch {
    throw new ToolingError("READ_FAILED", safePath);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ToolingError("INVALID_UTF8", safePath);
  }
}

function hasDuplicateJsonMember(text) {
  // JSON.parse checks syntax; this walk retains object-member occurrences from the raw text.
  const objects = [];
  for (const [token, string, colon] of text.matchAll(/("[^"\\]*(?:\\[\s\S][^"\\]*)*")([ \t\r\n]*:)?|[{}]/g)) {
    if (token === "{") objects.push(new Set());
    else if (token === "}") objects.pop();
    else if (colon) {
      const members = objects.at(-1);
      const key = JSON.parse(string);
      if (members.has(key)) return true;
      members.add(key);
    }
  }
  return false;
}

async function readContainedUtf8(root, relativePath, findings, escapeCode, details, allowResolvedPath) {
  const fullPath = path.join(root, ...relativePath.split("/"));
  let resolved;
  try {
    resolved = await realpath(fullPath);
  } catch {
    throw new ToolingError("READ_FAILED", relativePath);
  }
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    findings.push(diagnostic(escapeCode, relativePath, details));
    return undefined;
  }
  if (allowResolvedPath && !allowResolvedPath(path.relative(root, resolved))) {
    findings.push(diagnostic(escapeCode, relativePath, details));
    return undefined;
  }
  // ponytail: require a stable checkout; realpath plus read is not an atomic containment check.
  return readUtf8File(resolved, relativePath);
}

async function parseGovernedJson(root, relativePath, findings) {
  const text = await readContainedUtf8(root, relativePath, findings, "GOVERNED_PATH_ESCAPE");
  if (text === undefined) return { text: "", value: undefined };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    findings.push(diagnostic("MALFORMED_JSON", relativePath));
    return { text, value: undefined };
  }
  if (hasDuplicateJsonMember(text)) {
    findings.push(diagnostic("DUPLICATE_JSON_MEMBER", relativePath));
    return { text, value: undefined };
  }
  return { text, value };
}

async function resolveRepositoryRoot(inputRoot) {
  let root;
  try {
    root = await realpath(path.resolve(inputRoot));
    if (!(await stat(root)).isDirectory()) throw new Error("not-directory");
  } catch {
    throw new ToolingError("ROOT_UNREADABLE", "repository");
  }
  try {
    await lstat(path.join(root, ".git"));
    return root;
  } catch {
    try {
      const discovered = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return await realpath(discovered);
    } catch {
      throw new ToolingError("NOT_A_REPOSITORY", "repository");
    }
  }
}

async function validateDocument(root, entry, findings) {
  const relativePath = entry.path;
  const pathError = validateRelativePath(relativePath);
  if (pathError) return;
  const text = await readContainedUtf8(
    root,
    relativePath,
    findings,
    "DOCUMENT_PATH_ESCAPE",
    { id: entry.document_id },
    (resolvedPath) => isManifestDocumentPath(resolvedPath.split(path.sep).join("/")),
  );
  if (text === undefined) return;
  const markdownLines = scanMarkdownStructure(text);
  if (!hasMarkdownH1(markdownLines)) {
    findings.push(
      diagnostic("DOCUMENT_H1_REQUIRED", relativePath, { id: entry.document_id }),
    );
  }
  const declaredStatus = normalizeDeclaredStatus(text);
  if (declaredStatus === false) {
    findings.push(
      diagnostic("DOCUMENT_STATUS_INVALID", relativePath, {
        id: entry.document_id,
        field: "status",
      }),
    );
  } else if (
    declaredStatus === DECLARED_STATUS_CONFLICT ||
    (declaredStatus && declaredStatus !== entry.status)
  ) {
    findings.push(
      diagnostic("DOCUMENT_STATUS_CONTRADICTION", relativePath, {
        id: entry.document_id,
        field: "status",
      }),
    );
  }
  scanMarkdownPayload(text, relativePath, findings, entry.document_id);
  findings.push(
    ...scanContent(text, relativePath).map((item) => ({
      ...item,
      id: item.id ?? entry.document_id,
    })),
  );
}

async function validateRepositoryReference(root, reference, safePath, id, field, findings) {
  if (!isPathReference(reference) || validateReference(reference)) return;
  const fullPath = path.join(root, ...reference.split("/"));
  let resolved;
  try {
    resolved = await realpath(fullPath);
  } catch {
    findings.push(diagnostic("REFERENCE_MISSING", safePath, { id, field }));
    return;
  }
  const rootPrefix = `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootPrefix)) {
    findings.push(diagnostic("REFERENCE_PATH_ESCAPE", safePath, { id, field }));
    return;
  }
  try {
    let current = root;
    for (const component of reference.split("/")) {
      current = path.join(current, component);
      if ((await lstat(current)).isSymbolicLink()) {
        findings.push(diagnostic("REFERENCE_SYMLINK", safePath, { id, field }));
        return;
      }
    }
    if (!(await stat(resolved)).isFile()) {
      findings.push(diagnostic("REFERENCE_NOT_FILE", safePath, { id, field }));
    }
  } catch {
    findings.push(diagnostic("REFERENCE_MISSING", safePath, { id, field }));
  }
}

async function validateRepositoryReferences(root, documents, records, findings) {
  const checks = [];
  const add = (references, safePath, id, field) => {
    const values = Array.isArray(references) ? references : [references];
    for (const reference of values) {
      if (typeof reference === "string") {
        checks.push(
          validateRepositoryReference(root, reference, safePath, id, field, findings),
        );
      }
    }
  };
  for (const entry of documents) {
    add(entry.source, MANIFEST_PATH, entry.document_id, "source");
    add(
      entry.evidence_references,
      MANIFEST_PATH,
      entry.document_id,
      "evidence_references",
    );
  }
  for (const record of records) {
    add(record.source, REGISTER_PATH, record.change_id, "source");
    add(
      record.evidence_references,
      REGISTER_PATH,
      record.change_id,
      "evidence_references",
    );
    add(
      record.transition?.approval_reference,
      REGISTER_PATH,
      record.change_id,
      "approval_reference",
    );
    for (const [status, references] of Object.entries(
      record.transition?.prerequisite_evidence ?? {},
    )) {
      add(references, REGISTER_PATH, record.change_id, status);
    }
    add(
      record.approval?.evidence_reference,
      REGISTER_PATH,
      record.change_id,
      "approval.evidence_reference",
    );
  }
  await Promise.all(checks);
}

export async function validateRepository(inputRoot = process.cwd()) {
  const root = await resolveRepositoryRoot(inputRoot);
  const findings = [];
  const parsed = new Map();
  for (const relativePath of CORE_PATHS) {
    const result = await parseGovernedJson(root, relativePath, findings);
    parsed.set(relativePath, result);
    findings.push(...scanContent(result.text, relativePath, result.value));
  }

  if ([...parsed.values()].some(({ value }) => value === undefined)) {
    return { root, findings: findings.sort(compareDiagnostics), documents: 0, records: 0, files: CORE_PATHS.length };
  }

  const manifestSchema = parsed.get(MANIFEST_SCHEMA_PATH).value;
  const registerSchema = parsed.get(REGISTER_SCHEMA_PATH).value;
  const manifest = parsed.get(MANIFEST_PATH).value;
  const register = parsed.get(REGISTER_PATH).value;
  const contract = schemaContract(manifestSchema, registerSchema, findings);
  if (!contract) {
    return {
      root,
      findings: findings.sort(compareDiagnostics),
      documents: 0,
      records: 0,
      files: CORE_PATHS.length,
    };
  }
  findings.push(...validateManifest(manifest, contract));
  findings.push(...validateRegister(register, manifest, contract));
  const documents = Array.isArray(manifest?.documents) ? manifest.documents : [];
  const records = Array.isArray(register?.records) ? register.records : [];
  const documentObjects = documents.filter(isObject);
  const recordObjects = records.filter(isObject);
  await validateRepositoryReferences(root, documentObjects, recordObjects, findings);

  const changes = new Map(recordObjects.map((record) => [record.change_id, record]));
  for (const entry of documentObjects) {
    const change = changes.get(entry.latest_change_id);
    if (!change) {
      findings.push(
        diagnostic("MANIFEST_UNKNOWN_CHANGE_ID", MANIFEST_PATH, {
          id: entry.document_id,
          field: "latest_change_id",
        }),
      );
    } else if (contract.rules.terminal_dispositions.includes(change.status) &&
      (entry.status !== change.status || !Array.isArray(change.document_ids) ||
        !change.document_ids.includes(entry.document_id))) {
      findings.push(diagnostic("MANIFEST_DISPOSITION_MISMATCH", MANIFEST_PATH, {
        id: entry.document_id,
        field: "latest_change_id",
      }));
    } else if (entry.status === "APPROVED_FOR_PROFILE" && (
      change.status !== entry.status || !Array.isArray(change.document_ids) ||
      !change.document_ids.includes(entry.document_id) || !Array.isArray(change.affected_profiles) ||
      !Array.isArray(entry.affected_profiles) ||
      !entry.affected_profiles.every((profile) => change.affected_profiles.includes(profile))
    )) {
      findings.push(diagnostic("MANIFEST_PROFILE_APPROVAL_MISMATCH", MANIFEST_PATH, {
        id: entry.document_id,
        field: "latest_change_id",
      }));
    }
  }

  const validEntries = documentObjects
    .filter((entry) => isManifestDocumentPath(entry.path))
    .sort((left, right) => left.path.localeCompare(right.path));
  const registeredPaths = new Set(validEntries.map((entry) => entry.path));
  for (const required of REQUIRED_DOCUMENT_PATHS) {
    if (!registeredPaths.has(required)) {
      findings.push(diagnostic("MANIFEST_REQUIRED_DOCUMENT", required));
    }
  }
  for (const entry of validEntries) {
    await validateDocument(root, entry, findings);
  }

  return {
    root,
    findings: findings.sort(compareDiagnostics),
    documents: documents.length,
    records: records.length,
    files: CORE_PATHS.length + validEntries.length,
  };
}

function parseArguments(argv) {
  if (argv.length === 0) return process.cwd();
  if (argv.length === 2 && argv[0] === "--root" && argv[1] && !argv[1].startsWith("-")) return argv[1];
  throw new ToolingError("USAGE", "command-line");
}

async function main() {
  try {
    const root = parseArguments(process.argv.slice(2));
    const result = await validateRepository(root);
    if (result.findings.length > 0) {
      for (const item of result.findings) {
        process.stderr.write(`${formatDiagnostic(item)}\n`);
      }
      process.stderr.write(`VALIDATION_FAILED count=${result.findings.length}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `VALIDATION_PASSED documents=${result.documents} records=${result.records} files=${result.files}\n`,
    );
  } catch (error) {
    if (error instanceof ToolingError) {
      process.stderr.write(
        `TOOLING_ERROR category=${error.code} path=${safeDiagnosticToken(error.safePath, "path")}\n`,
      );
    } else {
      process.stderr.write("TOOLING_ERROR category=UNEXPECTED path=repository\n");
    }
    process.exitCode = 2;
  }
}

const isCli = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) await main();
