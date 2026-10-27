import { projectMembershipGraceReceipt } from "./membership-grace-projection.js";
import {
  projectFormRequirementTerms,
  projectFormBookingSnapshot,
  projectFormRecoveryEvidence,
  memberFormEventKinds,
  projectFormEvent,
} from "./form-export-projection.js";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import {
  memberExportFields,
  payerExportFields,
} from "./member-export-fields.js";
import { parseMembershipLifecyclePolicy } from "./membership-lifecycle-policy.js";
import { projectMemberProfileState } from "./profile-export-projection.js";
import { projectPaymentConfirmationSnapshot } from "./payment-confirmation-export-projection.js";
import {
  projectExportedWorkspaceEvent,
  projectSchedulingSnapshot,
  projectWaitlistHistory,
} from "./scheduling-export-projection.js";

export class MemberDataError extends Error {}
export type MemberDataScope = "MEMBER" | "PAYER";
type Row = Record<string, unknown>;
type File = {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  sha256: string;
  bytes: number;
  base64: string;
};
const fields: Record<string, readonly string[]> = {
  ...memberExportFields,
  ...payerExportFields,
};
const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const ids = (rows: Row[], key = "id") => [
  ...new Set(
    rows
      .map((row) => row[key])
      .filter((value): value is string => typeof value === "string"),
  ),
];
const normalized = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const termsKeys = [
  "version",
  "monthlyPriceCents",
  "priceCents",
  "currency",
  "weeklyClassLimit",
  "monthlyClassLimit",
  "allowanceCountingMode",
  "lateCancellationConsumesClass",
  "noShowConsumesClass",
  "programIds",
  "cancellationPolicyReference",
  "freezePolicyReference",
  "capturedAt",
  "originalPunches",
  "restrictionMode",
  "lateCancellationConsumesPunch",
  "noShowConsumesPunch",
  "oneTrialPerProgram",
  "trialProgramId",
];
function safeTerms(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Row;
  return {
    ...Object.fromEntries(
      termsKeys
        .filter((key) => key in source)
        .flatMap((key) => {
          const field = source[key];
          if (key === "programIds")
            return Array.isArray(field) &&
              field.every((value) => typeof value === "string")
              ? [[key, field]]
              : [];
          return field === null ||
            ["string", "number", "boolean"].includes(typeof field)
            ? [[key, field]]
            : [];
        }),
    ),
    ...(source.lifecyclePolicy
      ? {
          lifecyclePolicy: parseMembershipLifecyclePolicy(
            source.lifecyclePolicy,
          ),
        }
      : {}),
  };
}
function csvCell(value: unknown) {
  let cell =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s]*[=+@\-\t\r]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}
/** Caller supplies current target authorization and holds its scope locks in this transaction. */
export async function buildMemberDataArtifact(
  db: Prisma.TransactionClient,
  args: {
    workspaceId: string;
    scope: MemberDataScope;
    targetId: string;
    exportedAt: Date;
    includeEmergencyContacts?: boolean;
  },
) {
  const tables: Record<string, Row[]> = {},
    files: File[] = [];
  async function read(model: string, where: Row) {
    const selection = fields[model];
    if (!selection)
      throw new MemberDataError("This record type needs review before export.");
    const delegate = (
      db as unknown as Record<
        string,
        { findMany(args: unknown): Promise<Row[]> }
      >
    )[model[0]!.toLowerCase() + model.slice(1)]!;
    const rows = await delegate.findMany({
      where,
      select: Object.fromEntries(selection.map((key) => [key, true])),
      orderBy: { id: "asc" },
      take: 10001,
    });
    if (rows.length > 10000)
      throw new MemberDataError(
        "This record needs a larger export. Ask the named records contact to arrange it; no partial archive was created.",
      );
    for (const row of rows) {
      if (model === "FormRequirementRevision")
        row.terms = projectFormRequirementTerms(row.terms);
      if (model === "BookingFormRecovery")
        row.evidence = projectFormRecoveryEvidence(row.evidence);
      if (model === "ClassBooking")
        row.formRequirementSnapshot = projectFormBookingSnapshot(
          row.formRequirementSnapshot,
        );

      if (model === "MemberProfileEvent") {
        const emergency = String(row.kind).startsWith("EMERGENCY_CONTACT_");
        row.before = projectMemberProfileState(row.before, emergency);
        row.after = projectMemberProfileState(row.after, emergency);
      }
      if (model === "PaymentConfirmation")
        row.snapshot = projectPaymentConfirmationSnapshot(row.snapshot);
      if (model === "ClassBooking" || model === "WaitlistEntry")
        row.schedulingPolicySnapshot =
          row.schedulingPolicySnapshot == null
            ? null
            : projectSchedulingSnapshot(row.schedulingPolicySnapshot);
      if (model === "WaitlistEntry")
        row.promotionHistory = projectWaitlistHistory(row.promotionHistory);
    }
    tables[model] = rows;
    return rows;
  }
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: args.workspaceId },
    select: { id: true, name: true },
  });
  tables.Workspace = [workspace];
  const scope = { workspaceId: args.workspaceId, memberId: args.targetId };
  if (args.scope === "MEMBER") {
    const [
      memberships,
      packs,
      bookings,
      attendance,
      waitlist,
      promotions,
      signed,
    ] = await Promise.all([
      read("MemberMembership", scope),
      read("MemberPunchCard", scope),
      read("ClassBooking", scope),
      read("AttendanceRecord", scope),
      read("WaitlistEntry", scope),
      read("ProgramPromotion", {
        ...scope,
        program: {
          workspaceId: args.workspaceId,
          progressTrackingEnabled: true,
        },
      }),
      read("SignedDocument", scope),
      read("Member", { workspaceId: args.workspaceId, id: args.targetId }),
      read("AttendanceEvent", scope),
    ]);
    const membershipIds = ids(memberships),
      cardIds = ids(packs),
      bookingIds = ids(bookings);
    await read("MemberProfileEvent", {
      ...scope,
      kind: {
        in: [
          "MEMBER_CREATED",
          "MEMBER_PROFILE_UPDATED",
          ...(args.includeEmergencyContacts
            ? [
                "EMERGENCY_CONTACT_ADDED",
                "EMERGENCY_CONTACT_UPDATED",
                "EMERGENCY_CONTACT_RETIRED",
              ]
            : []),
        ],
      },
    });
    if (args.includeEmergencyContacts)
      await read("MemberEmergencyContact", { ...scope, retiredAt: null });

    const recoveries = await read("BookingFormRecovery", {
      workspaceId: args.workspaceId,
      bookingId: { in: bookingIds },
      booking: { workspaceId: args.workspaceId, memberId: args.targetId },
    });
    const formRevisionIds = [
      ...new Set([
        ...ids(signed, "requirementRevisionId"),
        ...ids(recoveries, "requirementRevisionId"),
        ...bookings.flatMap((booking) => {
          const snapshot = booking.formRequirementSnapshot as {
            requirements?: Row[];
          } | null;
          return snapshot?.requirements
            ? ids(snapshot.requirements, "requirementRevisionId")
            : [];
        }),
      ]),
    ];
    await read("FormRequirementRevision", {
      workspaceId: args.workspaceId,
      id: { in: formRevisionIds },
    });
    if (bookingIds.length) {
      // Exact retained booking IDs bind these immutable per-funding-revision receipts.
      const receipts = await db.$queryRaw<Row[]>`
        SELECT id, "workspaceId", kind, metadata, "createdAt"
        FROM workspace_data_events
        WHERE "workspaceId" = ${args.workspaceId} AND (kind IN ('SCHEDULING_POLICY_APPLIED', 'MEMBERSHIP_GRACE_BOOKING_RELEASED') OR kind = ANY(${[...memberFormEventKinds]}::text[]))
          AND metadata->>'bookingId' = ANY(${bookingIds}::text[])
        ORDER BY id LIMIT 10001
      `;
      if (receipts.length > 10000)
        throw new MemberDataError(
          "This scheduling history needs a larger export. Ask the named records contact to arrange it; no partial archive was created.",
        );
      tables.WorkspaceDataEvent = receipts.map((row) => ({
        ...row,
        metadata: (memberFormEventKinds as readonly string[]).includes(
          String(row.kind),
        )
          ? projectFormEvent(String(row.kind), row.metadata, true)
          : row.kind === "MEMBERSHIP_GRACE_BOOKING_RELEASED" ? projectMembershipGraceReceipt(row.metadata, true) : projectExportedWorkspaceEvent(String(row.kind), row.metadata),
      }));
    }
    const importedSignatures = await read("ImportedSignatureEvidence", {
      ...scope,
      signedDocumentId: { in: ids(signed) },
    });
    const lifecycle = await read("MembershipLifecycleRequest", {
      workspaceId: args.workspaceId,
      membershipId: { in: membershipIds },
    });
    await Promise.all([
      read("MembershipLifecycleEvent", {
        request: { workspaceId: args.workspaceId },
        requestId: { in: ids(lifecycle) },
      }),
      read("SourceMembershipLifecycleEvidence", {
        workspaceId: args.workspaceId,
        membershipId: { in: membershipIds },
        requestId: { in: ids(lifecycle) },
        request: {
          workspaceId: args.workspaceId,
          membershipId: { in: membershipIds },
        },
      }),
      read("SourceBillingEvidence", {
        workspaceId: args.workspaceId,
        memberMembershipId: { in: membershipIds },
      }),
      read("MembershipAllowanceOpeningBalance", {
        workspaceId: args.workspaceId,
        memberMembershipId: { in: membershipIds },
      }),
    ]);
    const [allocations, templates, instances, revisions, versions] =
      await Promise.all([
        read("MembershipAllowanceAllocation", {
          ...scope,
          memberMembershipId: { in: membershipIds },
          bookingId: { in: bookingIds },
        }),
        read("ClassTemplate", {
          workspaceId: args.workspaceId,
          id: {
            in: ids(
              [...bookings, ...attendance, ...waitlist],
              "classTemplateId",
            ),
          },
        }),
        read("ClassInstance", {
          workspaceId: args.workspaceId,
          id: { in: ids([...bookings, ...attendance], "classInstanceId") },
        }),
        read("ClassScheduleRevision", {
          workspaceId: args.workspaceId,
          classTemplateId: {
            in: ids(
              [...bookings, ...attendance, ...waitlist],
              "classTemplateId",
            ),
          },
        }),
        read("FormVersion", {
          workspaceId: args.workspaceId,
          id: { in: ids(signed, "formVersionId") },
        }),
        read("MembershipPlan", {
          workspaceId: args.workspaceId,
          id: { in: ids(memberships, "membershipPlanId") },
        }),
        read("PunchCardProduct", {
          workspaceId: args.workspaceId,
          id: { in: ids(packs, "punchCardProductId") },
        }),
        read("MembershipAllowanceAdjustment", {
          ...scope,
          memberMembershipId: { in: membershipIds },
        }),
        read("PunchCardEntry", {
          ...scope,
          memberPunchCardId: { in: cardIds },
        }),
        read("ClassBookingMove", {
          ...scope,
          originalBookingId: { in: bookingIds },
          targetBookingId: { in: bookingIds },
        }),
        read("SignatureRequest", {
          ...scope,
          id: { in: ids(signed, "signedFromRequestId") },
        }),
      ]);
    if (versions.length !== ids(signed, "formVersionId").length)
      throw new MemberDataError(
        "A signed document is missing its exact file version. The records contact must resolve it before export.",
      );
    await Promise.all([
      read("MembershipAllowanceEntry", {
        workspaceId: args.workspaceId,
        allocationId: { in: ids(allocations) },
      }),
      read("Program", {
        workspaceId: args.workspaceId,
        id: {
          in: ids(
            [...templates, ...instances, ...revisions, ...promotions],
            "programId",
          ),
        },
      }),
      read("Room", {
        location: { workspaceId: args.workspaceId },
        id: { in: ids([...templates, ...instances, ...revisions], "roomId") },
      }),
      read("Location", { workspaceId: args.workspaceId }),
      read("FormDocument", {
        workspaceId: args.workspaceId,
        id: { in: ids(versions, "formDocumentId") },
      }),
    ]);
    for (const row of [...memberships, ...packs])
      row.acceptedTerms = safeTerms(row.acceptedTerms);
    for (const row of bookings)
      row.acceptedPolicy = safeTerms(row.acceptedPolicy);
    for (const row of versions) {
      const bytes = Buffer.from(row.fileData as Uint8Array),
        sha256 = digest(bytes);
      if (sha256 !== row.fileSha256 || bytes.length !== row.fileSizeBytes)
        throw new MemberDataError(
          "A signed file failed its checksum check. Ask the records contact to restore the exact version before retrying.",
        );
      const path = `files/${String(row.id)}.pdf`;
      files.push({
        id: String(row.id),
        path,
        name: String(row.fileName),
        mimeType: String(row.mimeType),
        sha256,
        bytes: bytes.length,
        base64: bytes.toString("base64"),
      });
      delete row.fileData;
      row.fileReference = path;
    }
    for (const row of importedSignatures) {
      const signedRecord = signed.find(
          (item) => item.id === row.signedDocumentId,
        ),
        version = versions.find((item) => item.id === row.formVersionId);
      const bytes = Buffer.from(row.signatureReceiptData as Uint8Array),
        sha256 = digest(bytes);
      if (
        !signedRecord ||
        signedRecord.formVersionId !== row.formVersionId ||
        !version ||
        version.fileSha256 !== row.sourceDocumentHash ||
        sha256 !== row.signatureReceiptHash
      )
        throw new MemberDataError(
          "An imported signature receipt does not match its signed document. Ask the records contact to review the source evidence.",
        );
      const path = `files/signature-receipts/${String(row.id)}`;
      files.push({
        id: String(row.id),
        path,
        name: `signature-receipt-${String(row.id)}`,
        mimeType: "application/octet-stream",
        sha256,
        bytes: bytes.length,
        base64: bytes.toString("base64"),
      });
      delete row.signatureReceiptData;
      row.fileReference = path;
    }
  } else {
    const payerScope = {
      workspaceId: args.workspaceId,
      payerAccountId: args.targetId,
    };
    const [invoices, payments, credits, operations] = await Promise.all([
      read("Invoice", payerScope),
      read("Payment", payerScope),
      read("AccountCredit", payerScope),
      read("FinancialOperation", payerScope),
      read("FinancialAccount", {
        workspaceId: args.workspaceId,
        id: args.targetId,
      }),
    ]);
    const payerIdentity = await db.financialAccount.findFirst({
      where: { workspaceId: args.workspaceId, id: args.targetId },
      select: { userId: true },
    });
    if (!payerIdentity)
      throw new MemberDataError(
        "This payer account is unavailable for export.",
      );
    await read("PaymentConfirmation", {
      ...payerScope,
      payerUserId: payerIdentity.userId,
      paymentId: { in: ids(payments) },
    });
    await Promise.all([
      read("InvoiceLineItem", {
        workspaceId: args.workspaceId,
        invoiceId: { in: ids(invoices) },
      }),
      read("Refund", {
        workspaceId: args.workspaceId,
        paymentId: { in: ids(payments) },
      }),
      read("FinancialOperationEvent", {
        workspaceId: args.workspaceId,
        operationId: { in: ids(operations) },
      }),
    ]);
    const payer = tables.FinancialAccount?.[0];
    const refunds = tables.Refund ?? [];
    const sourceEvidence = await read("ImportedFinancialEvidence", {
      workspaceId: args.workspaceId,
      payerMemberId: payer?.memberId,
      OR: [
        { invoiceId: { in: ids(invoices) } },
        { paymentId: { in: ids(payments) } },
        { refundId: { in: ids(refunds) } },
      ],
    });
    const sourceIds = new Set(ids(sourceEvidence));
    for (const proof of sourceEvidence) {
      for (const [key, records] of [
        ["invoiceId", invoices],
        ["paymentId", payments],
        ["refundId", refunds],
      ] as const) {
        if (proof[key] == null) continue;
        const financial = records.find((record) => record.id === proof[key]);
        const beneficiary =
          key === "refundId"
            ? payments.find((payment) => payment.id === financial?.paymentId)
                ?.memberId
            : financial?.memberId;
        if (!financial || beneficiary !== proof.beneficiaryMemberId)
          throw new MemberDataError(
            "An imported payment receipt has an inconsistent payer or beneficiary. Ask the records contact to reconcile it before export.",
          );
      }
      if (
        proof.parentEvidenceId &&
        !sourceIds.has(String(proof.parentEvidenceId))
      )
        throw new MemberDataError(
          "An imported payment receipt is missing its verified payer history. Ask the records contact to reconcile it before export.",
        );
    }
    const beneficiaries = ids([...invoices, ...payments], "memberId").concat(
      ids(operations, "beneficiaryMemberId"),
    );
    tables.Beneficiary = await db.member.findMany({
      where: { workspaceId: args.workspaceId, id: { in: beneficiaries } },
      select: { id: true, fullName: true },
      orderBy: { id: "asc" },
    });
    for (const operation of operations) {
      operation.accountCreditId =
        ["ISSUE_CREDIT", "APPLY_CREDIT"].includes(String(operation.kind)) &&
        ids(credits).includes(String(operation.targetId))
          ? operation.targetId
          : null;
      delete operation.targetId;
    }
  }
  const data = normalized(tables);
  const dictionary = Object.fromEntries(
    Object.entries(data).map(([name, rows]) => {
      const metadata = Prisma.dmmf.datamodel.models.find(
        (model) => model.name === name,
      );
      const selected =
        fields[name]?.filter(
          (field) =>
            !["fileData", "signatureReceiptData"].includes(field) &&
            !(name === "FinancialOperation" && field === "targetId"),
        ) ?? Object.keys(rows[0] ?? {});
      const names = [
        ...new Set([...selected, ...rows.flatMap((row) => Object.keys(row))]),
      ];
      return [
        name,
        names.map((name) => {
          const definition = metadata?.fields.find(
            (field) => field.name === name,
          );
          return {
            name,
            type: definition?.type ?? "String",
            optional: definition ? !definition.isRequired : true,
            units:
              name.endsWith("Cents") || name.endsWith("Minor")
                ? "integer minor currency units; use currency or purchaseCurrency"
                : definition?.type === "DateTime"
                  ? "ISO 8601; date-only values represent a calendar date, not a local midnight instant"
                  : [
                        "delta",
                        "usedDelta",
                        "reservedDelta",
                        "remainingPunches",
                        "originalPunches",
                        "limit",
                        "units",
                      ].includes(name)
                    ? "whole class or product units"
                    : undefined,
          };
        }),
      ];
    }),
  );
  const csv = Object.fromEntries(
    Object.entries(data).map(([name, rows]) => {
      const names = dictionary[name]!.map((field) => field.name);
      return [
        `${name}.csv`,
        [
          names.map(csvCell).join(","),
          ...rows.map((row) =>
            names.map((field) => csvCell(row[field])).join(","),
          ),
        ].join("\r\n"),
      ];
    }),
  );
  const manifest = {
    format: "HitLink scoped records",
    version: 1,
    scope: args.scope,
    targetId: args.targetId,
    workspaceId: args.workspaceId,
    exportedAt: args.exportedAt.toISOString(),
    requiresEmergencyContactAccess:
      args.scope === "MEMBER" && args.includeEmergencyContacts === true,
    tables: Object.fromEntries(
      Object.entries(data).map(([name, rows]) => [name, rows.length]),
    ),
    files: files.map((file) => ({
      id: file.id,
      path: file.path,
      name: file.name,
      mimeType: file.mimeType,
      sha256: file.sha256,
      bytes: file.bytes,
    })),
    sourceHash: digest(JSON.stringify({ tables: data, files })),
    exclusions: [
      "Other household members and payers",
      "Internal staff notes and authentication/security metadata",
      "All coaching intake, notes, plans and appointments: use the client's separate coaching export",
      args.scope === "MEMBER"
        ? "Payer invoices, payments, refunds and monetary credits"
        : "Attendance, bookings, forms, goals, member profiles, emergency contacts and member service history",
      ...(args.scope === "MEMBER" && !args.includeEmergencyContacts
        ? [
            "Emergency contact details and history without current separate authority",
          ]
        : []),
      "Unattributed legacy money records awaiting payer verification",
    ],
    relationships:
      "IDs join the named tables. SignedDocument.formVersionId identifies its exact FormVersion; fileReference resolves to a base64 file with its own SHA-256. Beneficiary contains only names and IDs appearing in this payer's financial records. FinancialOperation.accountCreditId links credit issuance/application; operations are not cash receipts. ImportedFinancialEvidence preserves source payment status and amounts, with parentEvidenceId linking the exact source invoice/payment/refund history; it does not assert a destination processor charge. Private source files and free-text evidence are excluded from payer archives.",
    encoding:
      "UTF-8 JSON with CSV copies; CSV formula-leading strings are prefixed with an apostrophe, while JSON retains original text. File payloads are base64. The .json.gz container uses gzip.",
  };
  const source = JSON.stringify({
    manifest,
    dictionary,
    tables: data,
    files,
    csv,
  });
  if (Buffer.byteLength(source) > 100 * 1024 * 1024)
    throw new MemberDataError(
      "This archive needs a larger export. Ask the records contact to arrange it; no partial archive was created.",
    );
  const bytes = gzipSync(source);
  return { bytes, sha256: digest(bytes), manifest, byteCount: bytes.length };
}
