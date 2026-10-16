import { createHash } from "node:crypto";
import { type Prisma, type StagingRecord } from "@flowstate/db";
import { importPayloadHash } from "./migration-entitlements";
import {
  MigrationEntitlementError,
  type EntitlementStagedRow,
} from "./migration-entitlement-parser";
const digest = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
function fail(message: string): never {
  throw new MigrationEntitlementError(message);
}
function required(row: Record<string, string>, key: string) {
  const v = row[key]?.trim();
  if (!v) fail(`${key} is required from the source evidence.`);
  return v;
}
function number(row: Record<string, string>, key: string) {
  const v = required(row, key);
  if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)))
    fail(`${key} must be exact nonnegative cents.`);
  return Number(v);
}
function timestamp(row: Record<string, string>, key: string) {
  const v = required(row, key);
  if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) || !Number.isFinite(Date.parse(v)))
    fail(`${key} needs an exact timestamp with timezone.`);
  return new Date(v).toISOString();
}
function choose(row: Record<string, string>, key: string, choices: string[]) {
  const v = required(row, key);
  if (!choices.includes(v))
    fail(`Unsupported source ${key}. Expected ${choices.join(", ")}.`);
  return v;
}
export function buildSourceStagedRow(
  kind: "BILLING_HISTORY" | "SOURCE_SIGNATURE",
  row: Record<string, string>,
): EntitlementStagedRow {
  const externalId = row.external_id?.trim() || null;
  let data: Prisma.JsonObject = {};
  const issues: EntitlementStagedRow["issues"] = [];
  try {
    if (!externalId) fail("external_id is required for source replay.");
    data = {
      externalId,
      sourceSystem: required(row, "source_system"),
      sourceEvidence: required(row, "source_evidence"),
      memberExternalId: required(row, "member_external_id"),
    };
    if (kind === "BILLING_HISTORY") {
      const recordKind = choose(row, "record_kind", [
          "INVOICE",
          "PAYMENT",
          "REFUND",
        ]),
        status = choose(
          row,
          "source_status",
          recordKind === "INVOICE"
            ? ["OPEN", "PAID", "VOID", "UNCOLLECTIBLE"]
            : recordKind === "PAYMENT"
              ? ["SUCCEEDED", "FAILED", "PENDING"]
              : ["SUCCEEDED"],
        );
      const amount = number(row, "amount_cents"),
        tax = number(row, "tax_cents"),
        paid = number(row, "paid_cents"),
        refunded = number(row, "refunded_cents"),
        currency = required(row, "currency").toLowerCase();
      if (
        !/^[a-z]{3}$/.test(currency) ||
        paid > amount ||
        refunded > paid ||
        tax > amount
      )
        fail("Source money amounts or currency do not reconcile.");
      if (
        recordKind === "PAYMENT" &&
        ((status === "SUCCEEDED" && paid !== amount) ||
          (status !== "SUCCEEDED" && (paid !== 0 || refunded !== 0)))
      )
        fail(
          "Source payment status must agree with actual paid and refunded amounts.",
        );
      if (
        recordKind === "REFUND" &&
        (paid !== amount || refunded !== 0 || tax !== 0)
      )
        fail(
          "A verified source refund needs its exact returned amount, with paid_cents equal to amount_cents.",
        );
      if (
        recordKind === "INVOICE" &&
        ((status === "PAID" && paid !== amount) || refunded !== 0)
      )
        fail("The source invoice's paid total and status do not reconcile.");
      data = {
        ...data,
        recordKind,
        status,
        amount,
        tax,
        paid,
        refunded,
        currency,
        occurredAt: timestamp(row, "occurred_at"),
        sourceAccountReference: required(row, "source_account_reference"),
        payerExternalId: required(row, "payer_member_external_id"),
        payerAuthorityEvidence: required(row, "payer_authority_evidence"),
        billingOwner: choose(row, "billing_owner", ["SOURCE", "UNRESOLVED"]),
        refundOwner: choose(row, "refund_owner", ["SOURCE", "UNRESOLVED"]),
        parentExternalId:
          recordKind === "INVOICE" ? null : required(row, "parent_external_id"),
      };
    } else {
      const receipt = Buffer.from(
          required(row, "signature_receipt_base64"),
          "base64",
        ),
        receiptHash = required(row, "signature_receipt_sha256").toLowerCase();
      if (
        receipt.length < 8 ||
        receipt.length > 5_000_000 ||
        !receipt.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
        digest(receipt) !== receiptHash
      )
        fail(
          "Provide the original signed PDF receipt bytes with their exact SHA-256 hash.",
        );
      const signerKind = choose(row, "signer_kind", ["MEMBER", "GUARDIAN"]),
        documentHash = required(row, "source_document_sha256").toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(documentHash))
        fail(
          "source_document_sha256 must identify the exact accepted document bytes.",
        );
      data = {
        ...data,
        formVersionId: required(row, "form_version_id"),
        sourceDocumentHash: documentHash,
        receipt: receipt.toString("base64"),
        receiptHash,
        signerKind,
        guardianExternalId:
          signerKind === "GUARDIAN"
            ? required(row, "guardian_external_id")
            : null,
        signerName: required(row, "signer_name"),
        sourceSignerReference: required(row, "source_signer_reference"),
        sourceBeneficiaryReference: required(
          row,
          "source_beneficiary_reference",
        ),
        signerAuthorityEvidence: required(row, "signer_authority_evidence"),
        signedAt: timestamp(row, "signed_at"),
      };
    }
  } catch (error) {
    issues.push({
      severity: "ERROR",
      code: "SOURCE_EVIDENCE_REVIEW",
      message:
        error instanceof Error
          ? error.message
          : "Source evidence needs review.",
    });
  }
  return { externalId, rawData: row, mappedData: data, issues };
}
type Args = {
  db: Prisma.TransactionClient;
  workspaceId: string;
  importJobId: string;
  actorId: string;
  stagingRecord: StagingRecord;
};
export async function importSourceRecord(
  args: Args,
): Promise<"created" | "skipped"> {
  const workspace = await args.db.workspace.findUnique({
    where: { id: args.workspaceId },
    include: { migration: true },
  });
  if (
    !workspace ||
    workspace.status === "ACTIVE" ||
    !workspace.migration ||
    workspace.migration.stage === "COMPLETE" ||
    workspace.migration.ownerReviewAcknowledgedAt
  )
    fail("Source records can only be imported in reviewed staging.");
  const kind = args.stagingRecord.recordKind as
      | "BILLING_HISTORY"
      | "SOURCE_SIGNATURE",
    raw = args.stagingRecord.rawData;
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.values(raw).some((v) => typeof v !== "string")
  )
    fail("Preserve the source row.");
  const parsed = buildSourceStagedRow(kind, raw as Record<string, string>);
  if (parsed.issues.length) fail(parsed.issues[0]!.message);
  if (
    importPayloadHash(parsed.mappedData) !==
    importPayloadHash(args.stagingRecord.mappedData)
  )
    fail("Source mapping changed. Validate it again.");
  const d = parsed.mappedData as Record<string, string | number | null>,
    sourceRowHash = importPayloadHash(d);
  const sourceFile = await args.db.importSourceFile.findFirst({
    where: {
      id: args.stagingRecord.importSourceFileId ?? "",
      workspaceId: args.workspaceId,
      importJobId: args.importJobId,
    },
  });
  if (!sourceFile?.fileSha256) fail("Source file checksum is missing.");
  const proof = {
    workspaceId: args.workspaceId,
    sourceSystem: d.sourceSystem as string,
    sourceExternalId: d.externalId as string,
    sourceEvidence: d.sourceEvidence as string,
    sourceFileHash: sourceFile.fileSha256,
    sourceRowHash,
    importJobId: args.importJobId,
    stagingRecordId: args.stagingRecord.id,
    actorId: args.actorId,
  };
  async function linked(externalId: string, recordKind: "MEMBER" | "GUARDIAN") {
    const link = await args.db.migrationImportedRecord.findUnique({
      where: {
        workspaceId_recordKind_externalId: {
          workspaceId: args.workspaceId,
          recordKind,
          externalId,
        },
      },
    });
    if (!link)
      fail(`Map the exact source ${recordKind} identity ${externalId} first.`);
    return link.importedRecordId;
  }
  async function mark(model: string, id: string) {
    const key = {
      workspaceId: args.workspaceId,
      recordKind: kind,
      externalId:
        kind === "BILLING_HISTORY"
          ? `${d.recordKind}:${d.sourceSystem}:${d.externalId}`
          : `${d.sourceSystem}:${d.externalId}`,
    };
    await args.db.migrationImportedRecord.upsert({
      where: { workspaceId_recordKind_externalId: key },
      create: {
        ...key,
        importJobId: args.importJobId,
        stagingRecordId: args.stagingRecord.id,
        importedModel: model,
        importedRecordId: id,
      },
      update: {},
    });
    await args.db.stagingRecord.update({
      where: { id: args.stagingRecord.id },
      data: {
        importedAt: new Date(),
        importedModel: model,
        importedRecordId: id,
      },
    });
  }
  const memberId = await linked(d.memberExternalId as string, "MEMBER"),
    member = await args.db.member.findFirst({
      where: { id: memberId, workspaceId: args.workspaceId },
    });
  if (!member) fail("Beneficiary must belong to this workspace.");
  if (kind === "SOURCE_SIGNATURE") {
    const prior = await args.db.importedSignatureEvidence.findUnique({
      where: {
        workspaceId_sourceSystem_sourceExternalId: {
          workspaceId: args.workspaceId,
          sourceSystem: d.sourceSystem as string,
          sourceExternalId: d.externalId as string,
        },
      },
    });
    if (prior) {
      if (prior.sourceRowHash !== sourceRowHash)
        fail(
          "Source signature identity already records different bytes or signer details.",
        );
      await mark("ImportedSignatureEvidence", prior.id);
      return "skipped";
    }
    const version = await args.db.formVersion.findFirst({
      where: { id: d.formVersionId as string, workspaceId: args.workspaceId },
    });
    if (
      !version ||
      version.fileSha256 !== d.sourceDocumentHash ||
      digest(version.fileData) !== d.sourceDocumentHash
    )
      fail(
        "The mapped form version must contain the exact source document bytes/hash.",
      );
    const signedAt = new Date(d.signedAt as string);
    if (signedAt > new Date())
      fail("The source signature timestamp cannot be in the future.");
    const guardianId =
      d.signerKind === "GUARDIAN"
        ? await linked(d.guardianExternalId as string, "GUARDIAN")
        : null;
    const adultAtSigning = member.dateOfBirth
      ? new Date(
          Date.UTC(
            member.dateOfBirth.getUTCFullYear() + 18,
            member.dateOfBirth.getUTCMonth(),
            member.dateOfBirth.getUTCDate(),
          ),
        ) <= signedAt
      : false;
    if (d.signerKind === "MEMBER" && !adultAtSigning)
      fail(
        "An adult's own source signature needs a verified birth date. A child requires guardian authority evidence.",
      );
    if (
      guardianId &&
      (!(await args.db.familyLink.findFirst({
        where: {
          workspaceId: args.workspaceId,
          guardianId,
          childMemberId: memberId,
        },
      })) ||
        !(await args.db.memberPortalGrant.findFirst({
          where: {
            workspaceId: args.workspaceId,
            memberId,
            guardianId,
            revokedAt: null,
            canSign: true,
            user: {
              workspaceUsers: {
                some: {
                  workspaceId: args.workspaceId,
                  role: "CUSTOMER",
                  isActive: true,
                },
              },
            },
          },
        })))
    )
      fail(
        "Verify the exact guardian's current signing authority and family link before mapping consent.",
      );
    if (
      await args.db.signedDocument.findFirst({
        where: {
          workspaceId: args.workspaceId,
          memberId,
          formVersionId: version.id,
          signerKind: d.signerKind as "MEMBER" | "GUARDIAN",
        },
      })
    )
      fail(
        "A destination signature already exists for this person and version. Reconcile it without overwriting its evidence.",
      );
    const signed = await args.db.signedDocument.create({
      data: {
        workspaceId: args.workspaceId,
        memberId,
        guardianId,
        formVersionId: version.id,
        signerKind: d.signerKind as "MEMBER" | "GUARDIAN",
        signerNameSnapshot: d.signerName as string,
        signatureMethod: "SOURCE_VERIFIED_RECEIPT",
        providerReference: `${d.sourceSystem}:${d.externalId}`,
        signedAt,
      },
    });
    const receipt = await args.db.importedSignatureEvidence.create({
      data: {
        ...proof,
        memberId,
        guardianId,
        formVersionId: version.id,
        signedDocumentId: signed.id,
        sourceDocumentHash: d.sourceDocumentHash as string,
        signatureReceiptHash: d.receiptHash as string,
        signatureReceiptData: Buffer.from(d.receipt as string, "base64"),
        sourceSignerReference: d.sourceSignerReference as string,
        sourceBeneficiaryReference: d.sourceBeneficiaryReference as string,
        signerAuthorityEvidence: d.signerAuthorityEvidence as string,
        sourceSignedAt: signedAt,
      },
    });
    await mark("ImportedSignatureEvidence", receipt.id);
    return "created";
  }
  const recordKind = d.recordKind as string,
    prior = await args.db.importedFinancialEvidence.findUnique({
      where: {
        workspaceId_sourceSystem_sourceRecordKind_sourceExternalId: {
          workspaceId: args.workspaceId,
          sourceSystem: d.sourceSystem as string,
          sourceRecordKind: recordKind,
          sourceExternalId: d.externalId as string,
        },
      },
    });
  if (prior) {
    if (prior.sourceRowHash !== sourceRowHash)
      fail(
        "Source money identity already records different amounts, status or people.",
      );
    await mark("ImportedFinancialEvidence", prior.id);
    return "skipped";
  }
  const payerMemberId = await linked(d.payerExternalId as string, "MEMBER");
  if (
    !(await args.db.member.findFirst({
      where: { id: payerMemberId, workspaceId: args.workspaceId },
    }))
  )
    fail("Source payer must belong to this workspace.");
  const parent =
    recordKind === "INVOICE"
      ? null
      : await args.db.importedFinancialEvidence.findUnique({
          where: {
            workspaceId_sourceSystem_sourceRecordKind_sourceExternalId: {
              workspaceId: args.workspaceId,
              sourceSystem: d.sourceSystem as string,
              sourceRecordKind:
                recordKind === "PAYMENT" ? "INVOICE" : "PAYMENT",
              sourceExternalId: d.parentExternalId as string,
            },
          },
        });
  if (
    recordKind !== "INVOICE" &&
    (!parent ||
      parent.payerMemberId !== payerMemberId ||
      parent.beneficiaryMemberId !== memberId ||
      parent.currency !== d.currency ||
      parent.sourceAccountReference !== d.sourceAccountReference)
  )
    fail(
      "Map the exact source invoice/payment chain with matching payer, beneficiary, account and currency.",
    );
  const amount = d.amount as number,
    paid = d.paid as number,
    refunded = d.refunded as number,
    currency = d.currency as string,
    occurredAt = new Date(d.occurredAt as string),
    external = `${d.sourceSystem}:${d.externalId}`;
  let invoiceId: string | undefined,
    paymentId: string | undefined,
    refundId: string | undefined;
  if (recordKind === "INVOICE")
    invoiceId = (
      await args.db.invoice.create({
        data: {
          workspaceId: args.workspaceId,
          memberId,
          source: "IMPORTED",
          status: d.status as "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE",
          subtotalCents: amount - (d.tax as number),
          taxCents: d.tax as number,
          totalCents: amount,
          amountPaidCents: paid,
          amountDueCents: d.status === "VOID" ? 0 : amount - paid,
          currency,
          issuedAt: occurredAt,
          paidAt: d.status === "PAID" ? occurredAt : null,
          importedExternalId: external,
        },
      })
    ).id;
  else if (recordKind === "PAYMENT") {
    const allocated = await args.db.importedFinancialEvidence.aggregate({
      where: {
        workspaceId: args.workspaceId,
        parentEvidenceId: parent!.id,
        sourceRecordKind: "PAYMENT",
      },
      _sum: { paidCents: true },
    });
    if ((allocated._sum.paidCents ?? 0) + paid > parent!.paidCents)
      fail("Source payments exceed the invoice's reviewed paid total.");
    paymentId = (
      await args.db.payment.create({
        data: {
          workspaceId: args.workspaceId,
          memberId,
          invoiceId: parent!.invoiceId,
          source: "IMPORTED",
          status: "IMPORTED",
          amountCents: amount,
          refundedAmountCents: refunded,
          currency,
          paidAt: d.status === "SUCCEEDED" ? occurredAt : null,
          failedAt: d.status === "FAILED" ? occurredAt : null,
          importedExternalId: external,
        },
      })
    ).id;
  } else {
    const allocated = await args.db.importedFinancialEvidence.aggregate({
      where: {
        workspaceId: args.workspaceId,
        parentEvidenceId: parent!.id,
        sourceRecordKind: "REFUND",
      },
      _sum: { amountCents: true },
    });
    if (
      parent!.sourceStatus !== "SUCCEEDED" ||
      (allocated._sum.amountCents ?? 0) + amount > parent!.refundedCents
    )
      fail("Source refunds exceed the payment's reviewed returned total.");
    refundId = (
      await args.db.refund.create({
        data: {
          workspaceId: args.workspaceId,
          memberId,
          paymentId: parent!.paymentId,
          source: "IMPORTED",
          status: "IMPORTED",
          amountCents: amount,
          currency,
          reason: d.sourceEvidence as string,
          refundedAt: occurredAt,
          importedExternalId: external,
        },
      })
    ).id;
  }
  const evidence = await args.db.importedFinancialEvidence.create({
    data: {
      ...proof,
      sourceAccountReference: d.sourceAccountReference as string,
      sourceRecordKind: recordKind,
      sourceStatus: d.status as string,
      billingOwner: d.billingOwner as string,
      refundOwner: d.refundOwner as string,
      payerMemberId,
      beneficiaryMemberId: memberId,
      payerAuthorityEvidence: d.payerAuthorityEvidence as string,
      sourceSnapshot: parsed.mappedData,
      amountCents: amount,
      taxCents: d.tax as number,
      paidCents: paid,
      refundedCents: refunded,
      currency,
      occurredAt,
      invoiceId,
      paymentId,
      refundId,
      parentEvidenceId: parent?.id,
    },
  });
  await mark("ImportedFinancialEvidence", evidence.id);
  return "created";
}
