import { gunzipSync } from "node:zlib";
import {
  createWorkspaceDataExport,
  downloadWorkspaceDataExport,
} from "@flowstate/db";
import {
  getSourceBillingRenewalReview,
  recordSourceBillingRenewal,
} from "./source-billing-renewals";
import {
  getSourceRefundReview,
  recordSourceRefundReceipt,
} from "./source-refund-receipts";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  defaultMembershipLifecyclePolicy,
  prepareMembershipAllowance,
  createAccessBackedBooking,
  cancelAccessBackedBooking,
  type ImportRecordKind,
} from "@flowstate/db";
import {
  uploadAndStageMigrationCsv,
  runMigrationImport,
} from "./workspace-migration";
import { captureCutoverState } from "./migration-cutover";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("source entitlement import", () => {
  const db = new PrismaClient({ datasources: { db: { url } } }),
    ids: string[] = [];
  const actor = {
    type: "FLOWSTATE_OPERATOR" as const,
    actorId: "reviewed-test-operator",
  };
  let workspaceId: string,
    locationId: string,
    memberId: string,
    planId: string,
    templateId: string,
    programId: string;
  beforeEach(async () => {
    const w = await db.workspace.create({
      data: {
        name: `source-${randomUUID()}`,
        location: { create: { name: "Gym", timezone: "America/Vancouver" } },
        migration: {
          create: {
            stage: "MIGRATION_IN_PROGRESS",
            goLiveScheduledFor: new Date("2030-02-02"),
            nextOwnerAction: "Review",
            flowstateResponsibility: "Reconcile",
          },
        },
      },
      include: { location: true },
    });
    workspaceId = w.id;
    ids.push(w.id);
    locationId = w.location!.id;
    memberId = (
      await db.member.create({
        data: {
          workspaceId,
          fullName: "Source member",
          status: "ACTIVE",
          dateOfBirth: new Date("1990-01-01"),
        },
      })
    ).id;
    planId = (
      await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Current catalog",
          monthlyPriceCents: 9900,
          currency: "cad",
        },
      })
    ).id;
    programId = (
      await db.program.create({ data: { workspaceId, name: "Muay Thai" } })
    ).id;
    const room = await db.room.create({
      data: { locationId, name: "Main", capacity: 10 },
    });
    templateId = (
      await db.classTemplate.create({
        data: {
          workspaceId,
          programId,
          roomId: room.id,
          title: "Daily class",
          weekday: "SUNDAY",
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 0,
        },
      })
    ).id;
    await db.classScheduleRevision.create({
      data: {
        workspaceId,
        classTemplateId: templateId,
        effectiveFrom: new Date("2030-01-01"),
        recurrence: "DAILY",
        weekdays: [],
        programId,
        roomId: room.id,
        title: "Daily class",
        startTimeMinutes: 600,
        endTimeMinutes: 660,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
      },
    });
    for (const [recordKind, externalId, importedModel, importedRecordId] of [
      ["MEMBER", "member", "Member", memberId],
      ["MEMBERSHIP_PLAN", "plan", "MembershipPlan", planId],
      ["SCHEDULE_TEMPLATE", "class", "ClassTemplate", templateId],
    ] as const)
      await db.migrationImportedRecord.create({
        data: {
          workspaceId,
          recordKind,
          externalId,
          importedModel,
          importedRecordId,
        },
      });
  });
  afterAll(async () => {
    for (const workspaceId of ids) {
      await db.financialReviewCase.deleteMany({ where: { workspaceId } });
      await db.importedBookingFunding.deleteMany({ where: { workspaceId } });
      await db.importedSignatureEvidence.deleteMany({ where: { workspaceId } });
      await db.importedFinancialEvidence.deleteMany({
        where: { workspaceId, sourceRecordKind: "REFUND" },
      });
      await db.importedFinancialEvidence.deleteMany({
        where: { workspaceId, sourceRecordKind: "PAYMENT" },
      });
      await db.importedFinancialEvidence.deleteMany({ where: { workspaceId } });
      await db.classBooking.deleteMany({ where: { workspaceId } });
      await db.membershipAllowanceOpeningBalance.deleteMany({
        where: { workspaceId },
      });
      await db.sourceBillingEvidence.deleteMany({ where: { workspaceId } });
      await db.memberMembership.deleteMany({ where: { workspaceId } });
      await db.memberPunchCard.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }
    await db.$disconnect();
  });
  const csv = (rows: Record<string, string>[]) => {
    const columns = Object.keys(rows[0]!);
    const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
    return Buffer.from(
      [
        columns.map(quote).join(","),
        ...rows.map((row) => columns.map((c) => quote(row[c] ?? "")).join(",")),
      ].join("\n"),
    );
  };
  async function stage(kind: ImportRecordKind, rows: Record<string, string>[]) {
    const fileData = csv(rows);
    expect(
      (
        await uploadAndStageMigrationCsv({
          workspaceId,
          actor,
          db,
          input: {
            recordKind: kind,
            fileName: `${kind}.csv`,
            fileData,
            fileSizeBytes: fileData.length,
          },
        })
      ).status,
    ).toBe("ok");
    return db.importJob.findFirstOrThrow({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
  }
  async function run(kind: ImportRecordKind, rows: Record<string, string>[]) {
    const job = await stage(kind, rows);
    return runMigrationImport({
      workspaceId,
      locationId,
      importJobId: job.id,
      actor,
      db,
    });
  }
  function contract(overrides: Record<string, string> = {}) {
    return {
      external_id: "contract",
      member_external_id: "member",
      membership_plan_external_id: "plan",
      status: "ACTIVE",
      started_on: "2030-01-31",
      next_billing_date: "2030-02-28",
      allowance_anchor_date: "2030-01-31",
      allowance_timezone: "America/Vancouver",
      paid_from: "2030-01-31",
      paid_through: "2030-02-28",
      source_system: "old-system",
      source_account_reference: "source-account",
      source_contract_reference: "source-contract",
      source_evidence: "Reviewed paid statement 12",
      acceptance_evidence: "Accepted contract 42",
      payer_authority_evidence: "Signed source payer authorization 7",
      accepted_terms: JSON.stringify({
        version: 3,
        monthlyPriceCents: 6500,
        currency: "cad",
        weeklyClassLimit: 3,
        monthlyClassLimit: 8,
        allowanceCountingMode: "RESERVATION",
        lateCancellationConsumesClass: true,
        noShowConsumesClass: false,
        programIds: [programId],
        capturedAt: "2029-01-01T12:00:00Z",
        lifecyclePolicy: defaultMembershipLifecyclePolicy,
      }),
      ...overrides,
    };
  }
  function pack(id = "pack", overrides: Record<string, string> = {}) {
    return {
      external_id: id,
      member_external_id: "member",
      product_external_id: "pack-product",
      product_name: "Source pack",
      available_punches: "3",
      reserved_punches: "2",
      purchased_on: "2030-01-01",
      expires_on: "2030-03-01",
      source_evidence: "Reviewed available3 held2",
      acceptance_evidence: "Accepted pack 8",
      accepted_terms: JSON.stringify({
        version: 2,
        priceCents: 10000,
        currency: "cad",
        originalPunches: 10,
        restrictionMode: "PROGRAM_RESTRICTED",
        programIds: [programId],
        lateCancellationConsumesPunch: true,
        noShowConsumesPunch: true,
        capturedAt: "2029-01-01T12:00:00Z",
      }),
      ...overrides,
    };
  }
  const booking = (
    id: string,
    funding_type = "PUNCH_CARD",
    funding_external_id = "pack",
    scheduled_for_date = "2030-02-03",
  ) => ({
    external_id: id,
    member_external_id: "member",
    class_template_external_id: "class",
    scheduled_for_date,
    funding_type,
    funding_external_id,
    source_evidence: `Reservation ${id}`,
  });
  const usage = (kind: string, used = "2") => ({
    external_id: `usage-${kind}`,
    membership_external_id: "contract",
    period_kind: kind,
    period_start: "2030-01-31",
    period_end: kind === "WEEK" ? "2030-02-07" : "2030-02-28",
    as_of_date: "2030-02-02",
    used_count: used,
    source_evidence: `Opening ${kind} source used ${used}`,
  });
  it("keeps exact source terms, Vancouver Jan31 anchor and exclusive paid-through access after catalog changes", async () => {
    expect(await run("MEMBER_MEMBERSHIP", [contract()])).toMatchObject({
      status: "ok",
    });
    const m = await db.memberMembership.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Vancouver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(m.startedAt),
    ).toBe("2030-01-31");
    await db.membershipPlan.update({
      where: { id: planId },
      data: { monthlyPriceCents: 12000, weeklyClassLimit: 1 },
    });
    expect(m.acceptedTerms).toMatchObject({
      monthlyPriceCents: 6500,
      weeklyClassLimit: 3,
    });
    expect(
      await prepareMembershipAllowance({
        db,
        workspaceId,
        memberId,
        membershipId: m.id,
        scheduledForDate: "2030-02-28",
        timezone: "America/Vancouver",
      }),
    ).toMatchObject({
      error: expect.stringContaining("source payment or resume evidence"),
    });
    const before = await prepareMembershipAllowance({
      db,
      workspaceId,
      memberId,
      membershipId: m.id,
      scheduledForDate: "2030-02-27",
      timezone: "America/Vancouver",
    });
    expect(before).toMatchObject({
      windows: expect.arrayContaining([
        expect.objectContaining({
          startsOn: "2030-02-21",
          endsOn: "2030-02-28",
          limit: 3,
        }),
      ]),
    });
    expect(
      (
        await run("MEMBER_MEMBERSHIP", [
          contract({ external_id: "other-contract" }),
        ])
      ).status,
    ).toBe("error");
    expect(await db.payment.count({ where: { workspaceId } })).toBe(0);
  });
  it("preserves used versus reserved for both caps and rejects changed opening replay", async () => {
    expect((await run("MEMBER_MEMBERSHIP", [contract()])).status).toBe("ok");
    expect(
      (await run("ALLOWANCE_USAGE", [usage("WEEK"), usage("BILLING_MONTH")]))
        .status,
    ).toBe("ok");
    expect(
      (
        await run("FUTURE_BOOKING", [
          booking("reservation", "MEMBERSHIP", "contract"),
        ])
      ).status,
    ).toBe("ok");
    const m = await db.memberMembership.findFirstOrThrow({
      where: { workspaceId },
    });
    const result = await prepareMembershipAllowance({
      db,
      workspaceId,
      memberId,
      membershipId: m.id,
      scheduledForDate: "2030-02-03",
      timezone: "America/Vancouver",
    });
    expect(result).toMatchObject({
      windows: expect.arrayContaining([
        expect.objectContaining({
          kind: "WEEK",
          used: 2,
          reserved: 1,
          remaining: 0,
        }),
        expect.objectContaining({
          kind: "BILLING_MONTH",
          used: 2,
          reserved: 1,
          remaining: 5,
        }),
      ]),
    });
    const fingerprint = (await captureCutoverState(db, workspaceId))
      .fingerprint;
    expect((await run("ALLOWANCE_USAGE", [usage("WEEK")])).status).toBe("ok");
    expect((await run("ALLOWANCE_USAGE", [usage("WEEK", "1")])).status).toBe(
      "error",
    );
    expect(
      await db.membershipAllowanceOpeningBalance.count({
        where: { workspaceId },
      }),
    ).toBe(2);
    expect((await captureCutoverState(db, workspaceId)).fingerprint).not.toBe(
      fingerprint,
    );
  });
  it("debits named pack B once, restores it once and never resets balances on replay", async () => {
    expect(
      (
        await run("PUNCH_CARD_BALANCE", [
          pack("A", { available_punches: "5", reserved_punches: "0" }),
          pack(),
        ])
      ).status,
    ).toBe("ok");
    expect(
      (
        await run("FUTURE_BOOKING", [
          booking("one"),
          booking("two", "PUNCH_CARD", "pack", "2030-02-04"),
        ])
      ).status,
    ).toBe("ok");
    const card = await db.memberPunchCard.findFirstOrThrow({
      where: {
        workspaceId,
        importSnapshot: { path: ["data", "externalId"], equals: "pack" },
      },
    });
    expect(card.remainingPunches).toBe(3);
    const b = await db.classBooking.findFirstOrThrow({
      where: { workspaceId, scheduledForDate: new Date("2030-02-03") },
    });
    const args = {
      workspaceId,
      memberId,
      bookingId: b.id,
      timezone: "America/Vancouver",
      now: new Date("2030-02-01"),
      db: db as unknown as NonNullable<
        Parameters<typeof cancelAccessBackedBooking>[0]["db"]
      >,
    };
    await cancelAccessBackedBooking(args);
    await cancelAccessBackedBooking(args);
    expect((await run("PUNCH_CARD_BALANCE", [pack()])).status).toBe("ok");
    expect((await run("FUTURE_BOOKING", [booking("one")])).status).toBe("ok");
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card.id } }))
        .remainingPunches,
    ).toBe(4);
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: b.id } })).status,
    ).toBe("CANCELLED");
    expect(
      await db.punchCardEntry.count({
        where: {
          memberPunchCardId: card.id,
          operationKey: `opening:${card.id}`,
        },
      }),
    ).toBe(1);
    expect(
      (
        await run("PUNCH_CARD_BALANCE", [
          pack("pack", { available_punches: "9", reserved_punches: "0" }),
        ])
      ).status,
    ).toBe("error");
  });
  it("serializes concurrent identical source reservations and rolls back the whole batch on an expired pack", async () => {
    expect((await run("PUNCH_CARD_BALANCE", [pack()])).status).toBe("ok");
    const a = await stage("FUTURE_BOOKING", [booking("same")]),
      b = await stage("FUTURE_BOOKING", [booking("same")]);
    const results = await Promise.all(
      [a, b].map((job) =>
        runMigrationImport({
          workspaceId,
          locationId,
          importJobId: job.id,
          actor,
          db,
        }),
      ),
    );
    expect(results.map((r) => r.status), JSON.stringify(results)).toEqual(["ok", "ok"]);
    expect(await db.classBooking.count({ where: { workspaceId } })).toBe(1);
    const card = await db.memberPunchCard.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(card.remainingPunches).toBe(4);
    expect(
      (
        await run("FUTURE_BOOKING", [
          booking("good", "PUNCH_CARD", "pack", "2030-02-05"),
          booking("expired", "PUNCH_CARD", "pack", "2030-03-01"),
        ])
      ).status,
    ).toBe("error");
    expect(await db.classBooking.count({ where: { workspaceId } })).toBe(1);
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card.id } }))
        .remainingPunches,
    ).toBe(4);
    expect(
      await createAccessBackedBooking({
        workspaceId,
        memberId,
        classTemplateId: templateId,
        scheduledForDate: "2030-03-01",
        timezone: "America/Vancouver",
        source: "ADMIN",
        allowDropIn: false,
        db: db as unknown as NonNullable<
          Parameters<typeof createAccessBackedBooking>[0]["db"]
        >,
        now: new Date("2030-02-01"),
      }),
    ).toMatchObject({ status: "error" });
  });
  it("quarantines incomplete source terms and foreign program mapping without creating entitlement", async () => {
    const bad = contract();
    const terms = JSON.parse(bad.accepted_terms);
    delete terms.currency;
    bad.accepted_terms = JSON.stringify(terms);
    const job = await stage("MEMBER_MEMBERSHIP", [bad]);
    expect(job.status).not.toBe("VALIDATED");
    expect(await db.memberMembership.count({ where: { workspaceId } })).toBe(0);
    const foreign = contract();
    foreign.accepted_terms = JSON.stringify({
      ...JSON.parse(foreign.accepted_terms),
      programIds: ["foreign-program"],
    });
    expect((await run("MEMBER_MEMBERSHIP", [foreign])).status).toBe("error");
    expect(await db.memberMembership.count({ where: { workspaceId } })).toBe(0);
  });
  const money = (
    record_kind: string,
    external_id: string,
    overrides: Record<string, string> = {},
  ) => ({
    external_id,
    record_kind,
    source_system: "old-system",
    source_account_reference: "gym-source-account",
    source_status: record_kind === "INVOICE" ? "PAID" : "SUCCEEDED",
    member_external_id: "member",
    payer_member_external_id: "member",
    source_evidence: `Reviewed source ${record_kind} ${external_id}`,
    payer_authority_evidence: "Original payer contract",
    billing_owner: "SOURCE",
    refund_owner: "SOURCE",
    amount_cents: "5000",
    tax_cents: "0",
    paid_cents: "5000",
    refunded_cents: "0",
    currency: "cad",
    occurred_at: "2026-01-01T12:00:00Z",
    parent_external_id: record_kind === "PAYMENT" ? "invoice" : "payment",
    ...overrides,
  });
  it("maps exact source money to a standalone class without inventing a provider payment", async () => {
    expect(
      (
        await run("BILLING_HISTORY", [
          money("INVOICE", "invoice"),
          money("PAYMENT", "payment"),
        ])
      ).status,
    ).toBe("ok");
    const product = await db.dropInProduct.create({
      data: {
        workspaceId,
        name: "Source drop-in",
        priceCents: 9999,
        currency: "cad",
      },
    });
    await db.migrationImportedRecord.create({
      data: {
        workspaceId,
        recordKind: "DROP_IN_PRODUCT",
        externalId: "drop-in",
        importedModel: "DropInProduct",
        importedRecordId: product.id,
      },
    });
    const row = {
      ...booking("paid", "SOURCE_PAYMENT", "payment"),
      source_system: "old-system",
      drop_in_product_external_id: "drop-in",
      amount_cents: "5000",
      currency: "cad",
      source_allocation_reference: "original-place-1",
    };
    expect(await run("FUTURE_BOOKING", [row])).toMatchObject({ status: "ok" });
    const payment = await db.payment.findFirstOrThrow({
        where: { workspaceId },
      }),
      place = await db.classBooking.findFirstOrThrow({
        where: { workspaceId },
      });
    expect(payment).toMatchObject({
      source: "IMPORTED",
      status: "IMPORTED",
      stripePaymentIntentId: null,
      amountCents: 5000,
    });
    expect(place).toMatchObject({
      status: "BOOKED",
      bookingType: "DROP_IN",
      dropInPriceCents: 5000,
      dropInCheckoutSessionId: null,
      dropInPaymentIntentId: null,
    });
    expect(
      (
        await run("FUTURE_BOOKING", [
          {
            ...row,
            external_id: "overallocated",
            scheduled_for_date: "2030-02-04",
            source_allocation_reference: "original-place-2",
          },
        ])
      ).status,
    ).toBe("error");
    expect((await captureCutoverState(db, workspaceId)).problems).toEqual([]);
    expect(
      (
        await run("BILLING_HISTORY", [
          money("PAYMENT", "payment", {
            amount_cents: "6000",
            paid_cents: "6000",
          }),
        ])
      ).status,
    ).toBe("error");
  });
  it("requires the complete source refund chain and quarantines unknown ownership", async () => {
    expect(
      (
        await run("BILLING_HISTORY", [
          money("INVOICE", "invoice"),
          money("PAYMENT", "payment", { refunded_cents: "1000" }),
        ])
      ).status,
    ).toBe("ok");
    expect((await captureCutoverState(db, workspaceId)).problems).toEqual(
      expect.arrayContaining([expect.stringContaining("receipt chain")]),
    );
    expect(
      (
        await run("BILLING_HISTORY", [
          money("REFUND", "refund", {
            amount_cents: "1000",
            paid_cents: "1000",
          }),
        ])
      ).status,
    ).toBe("ok");
    expect((await captureCutoverState(db, workspaceId)).problems).toEqual([]);
    expect(
      (
        await run("BILLING_HISTORY", [
          money("REFUND", "too-much", { amount_cents: "1", paid_cents: "1" }),
        ])
      ).status,
    ).toBe("error");
    expect(await db.refund.count({ where: { workspaceId } })).toBe(1);
    expect(
      (
        await run("BILLING_HISTORY", [
          money("INVOICE", "unresolved", {
            source_status: "OPEN",
            paid_cents: "0",
            billing_owner: "UNRESOLVED",
          }),
        ])
      ).status,
    ).toBe("ok");
    expect((await captureCutoverState(db, workspaceId)).problems).toEqual(
      expect.arrayContaining([expect.stringContaining("ownership")]),
    );
  });
  it("preserves exact signed source bytes and timestamp; rejects document mismatch without fabricating consent", async () => {
    const user = await db.user.create({
      data: { email: `${randomUUID()}@source-consent.test` },
    });
    try {
      const staff = await db.workspaceUser.create({
        data: { workspaceId, userId: user.id, role: "OWNER" },
      });
      const bytes = Buffer.from(
          "%PDF-1.4\nOriginal document and signed receipt fixture\n%%EOF",
        ),
        hash = createHash("sha256").update(bytes).digest("hex");
      const doc = await db.formDocument.create({
        data: { workspaceId, name: "Original waiver", formType: "WAIVER" },
      });
      const version = await db.formVersion.create({
        data: {
          workspaceId,
          formDocumentId: doc.id,
          versionNumber: 1,
          fileName: "original.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: bytes.length,
          fileSha256: hash,
          fileData: bytes,
          uploadedByWorkspaceUserId: staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: doc.id },
        data: { currentVersionId: version.id },
      });
      const row = {
        external_id: "consent",
        source_system: "old-system",
        member_external_id: "member",
        source_evidence: "Source signed document verified",
        form_version_id: version.id,
        source_document_sha256: hash,
        signature_receipt_base64: bytes.toString("base64"),
        signature_receipt_sha256: hash,
        signer_kind: "MEMBER",
        signer_name: "Source member",
        source_signer_reference: "source-person-member",
        source_beneficiary_reference: "source-person-member",
        signer_authority_evidence: "Original adult signer identity evidence",
        signed_at: "2025-03-09T01:30:00-08:00",
      };
      expect(
        (
          await run("SOURCE_SIGNATURE", [
            { ...row, source_document_sha256: "a".repeat(64) },
          ])
        ).status,
      ).toBe("error");
      expect(await db.signedDocument.count({ where: { workspaceId } })).toBe(0);
      expect(await run("SOURCE_SIGNATURE", [row])).toMatchObject({
        status: "ok",
      });
      const signature = await db.signedDocument.findFirstOrThrow({
        where: { workspaceId },
      });
      expect(signature).toMatchObject({
        signatureMethod: "SOURCE_VERIFIED_RECEIPT",
        signedFromRequestId: null,
        signedAt: new Date("2025-03-09T09:30:00Z"),
      });
      expect((await run("SOURCE_SIGNATURE", [row])).status).toBe("ok");
      expect(
        await db.importedSignatureEvidence.count({ where: { workspaceId } }),
      ).toBe(1);
      await db.importedSignatureEvidence.deleteMany({ where: { workspaceId } });
      await db.signedDocument.deleteMany({ where: { workspaceId } });
      await db.formDocument.update({
        where: { id: doc.id },
        data: { currentVersionId: null },
      });
      await db.formVersion.deleteMany({ where: { workspaceId } });
      await db.formDocument.delete({ where: { id: doc.id } });
      await db.workspaceUser.delete({ where: { id: staff.id } });
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("records a completed source refund with owner authority, stale-review rejection and replay protection", async () => {
    expect(
      (
        await run("BILLING_HISTORY", [
          money("INVOICE", "invoice"),
          money("PAYMENT", "payment"),
        ])
      ).status,
    ).toBe("ok");
    const product = await db.dropInProduct.create({
      data: {
        workspaceId,
        name: "Source drop-in",
        priceCents: 5000,
        currency: "cad",
      },
    });
    await db.migrationImportedRecord.create({
      data: {
        workspaceId,
        recordKind: "DROP_IN_PRODUCT",
        externalId: "drop-in",
        importedModel: "DropInProduct",
        importedRecordId: product.id,
      },
    });
    expect(
      (
        await run("FUTURE_BOOKING", [
          {
            ...booking("paid", "SOURCE_PAYMENT", "payment"),
            source_system: "old-system",
            drop_in_product_external_id: "drop-in",
            amount_cents: "5000",
            currency: "cad",
            source_allocation_reference: "place",
          },
        ])
      ).status,
    ).toBe("ok");
    const place = await db.classBooking.findFirstOrThrow({
        where: { workspaceId },
      }),
      payment = await db.payment.findFirstOrThrow({ where: { workspaceId } });
    await db.classBooking.update({
      where: { id: place.id },
      data: { status: "CANCELLED" },
    });
    const reviewCase = await db.financialReviewCase.create({
      data: {
        workspaceId,
        sourceKey: `gym-cancel:${place.id}`,
        reason: "Gym cancelled source-paid class",
        bookingId: place.id,
        memberId,
        paymentId: payment.id,
        amountCents: 5000,
        currency: "cad",
      },
    });
    const user = await db.user.create({
        data: { email: `${randomUUID()}@source-refund.test` },
      }),
      staff = await db.workspaceUser.create({
        data: { workspaceId, userId: user.id, role: "OWNER" },
      });
    try {
      const owner = { workspaceId, workspaceUserId: staff.id, userId: user.id };
      const review = await getSourceRefundReview(owner, reviewCase.id, db);
      expect(review?.remainingCents).toBe(5000);
      const input = {
        caseId: reviewCase.id,
        reviewToken: review!.reviewToken,
        sourceReference: "source-refund-21",
        amountCents: 5000,
        refundedAt: "2026-01-02T12:00:00Z",
        receiptData: Buffer.from("%PDF-1.4\nOriginal refund receipt\n%%EOF"),
        reason: "Class cancelled and returned to original source payer",
      };
      await expect(
        recordSourceRefundReceipt(
          { ...owner, workspaceUserId: "unknown" },
          input,
          db,
        ),
      ).rejects.toThrow("active owner");
      await expect(
        recordSourceRefundReceipt(
          owner,
          { ...input, reviewToken: "stale" },
          db,
        ),
      ).rejects.toThrow("changed");
      expect((await recordSourceRefundReceipt(owner, input, db)).status).toBe(
        "recorded",
      );
      expect((await recordSourceRefundReceipt(owner, input, db)).status).toBe(
        "recorded",
      );
      expect(
        (await db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
          .refundedAmountCents,
      ).toBe(5000);
      expect(await db.refund.count({ where: { workspaceId } })).toBe(1);
      expect(
        (
          await db.financialReviewCase.findUniqueOrThrow({
            where: { id: reviewCase.id },
          })
        ).resolvedAt,
      ).not.toBeNull();
      await expect(
        recordSourceRefundReceipt(owner, { ...input, amountCents: 1 }, db),
      ).rejects.toThrow("different receipt");
    } finally {
      await db.workspaceUser.delete({ where: { id: staff.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("appends a paid source interval with exact receipt bytes, preserves the old period and exports its proof", async () => {
    expect((await run("MEMBER_MEMBERSHIP", [contract()])).status).toBe("ok");
    const membership = await db.memberMembership.findFirstOrThrow({
        where: { workspaceId },
      }),
      original = await db.sourceBillingEvidence.findFirstOrThrow({
        where: { workspaceId },
      });
    const user = await db.user.create({
        data: { email: `${randomUUID()}@source-renewal.test` },
      }),
      staff = await db.workspaceUser.create({
        data: { workspaceId, userId: user.id, role: "OWNER" },
      });
    try {
      const owner = { workspaceId, workspaceUserId: staff.id, userId: user.id },
        review = await getSourceBillingRenewalReview(owner, membership.id, db),
        bytes = Buffer.from(
          "%PDF-1.4\nSource renewal paid February receipt\n%%EOF",
        );
      expect(review).toMatchObject({
        paidFrom: "2030-02-28",
        suggestedPaidThrough: "2030-03-31",
      });
      const input = {
        membershipId: membership.id,
        reviewToken: review!.reviewToken,
        operationKey: randomUUID(),
        paidFrom: "2030-02-28",
        paidThrough: "2030-03-31",
        nextRenewalOn: "2030-03-31",
        sourceReference: "Source paid receipt February",
        sourceAccountReference: "source-account",
        receiptData: bytes,
      };
      await expect(
        recordSourceBillingRenewal(
          { ...owner, workspaceUserId: "foreign" },
          input,
          db,
        ),
      ).rejects.toThrow("active owner");
      await expect(
        recordSourceBillingRenewal(
          owner,
          { ...input, paidFrom: "2030-02-27" },
          db,
        ),
      ).rejects.toThrow("changed");
      const pendingRefund = await db.financialOperation.create({
        data: {
          workspaceId,
          operationKey: randomUUID(),
          requestHash: "source-renewal-hold",
          kind: "REFUND",
          providerIdempotencyKey: randomUUID(),
          payload: {},
        },
      });
      const hold = await db.financialEntitlementHold.create({
        data: {
          workspaceId,
          operationId: pendingRefund.id,
          targetKind: "MEMBERSHIP",
          targetId: membership.id,
        },
      });
      await expect(
        recordSourceBillingRenewal(owner, input, db),
      ).rejects.toThrow("refund is being processed");
      expect(
        await db.sourceBillingEvidence.count({ where: { workspaceId } }),
      ).toBe(1);
      await db.financialEntitlementHold.delete({ where: { id: hold.id } });
      await db.financialOperation.delete({ where: { id: pendingRefund.id } });
      expect((await recordSourceBillingRenewal(owner, input, db)).status).toBe(
        "recorded",
      );
      expect((await recordSourceBillingRenewal(owner, input, db)).status).toBe(
        "recorded",
      );
      expect(
        await db.sourceBillingEvidence.count({ where: { workspaceId } }),
      ).toBe(2);
      expect(
        await db.sourceBillingEvidence.findUnique({
          where: { id: original.id },
        }),
      ).toEqual(original);
      expect(
        await prepareMembershipAllowance({
          workspaceId,
          memberId,
          membershipId: membership.id,
          scheduledForDate: "2030-03-30",
          timezone: "America/Vancouver",
          db,
        }),
      ).not.toHaveProperty("error");
      expect(
        await prepareMembershipAllowance({
          workspaceId,
          memberId,
          membershipId: membership.id,
          scheduledForDate: "2030-03-31",
          timezone: "America/Vancouver",
          db,
        }),
      ).toHaveProperty("error");
      expect(
        (
          await db.memberMembership.findUniqueOrThrow({
            where: { id: membership.id },
          })
        ).stripeSubscriptionId,
      ).toBeNull();
      const exported = await createWorkspaceDataExport(
        { workspaceId, userId: user.id },
        "Reviewed source contract and original paid receipt",
        { db },
      );
      const downloaded = await downloadWorkspaceDataExport(
        { workspaceId, userId: user.id },
        exported.id,
        { db },
      );
      const archive = JSON.parse(gunzipSync(downloaded.bytes).toString("utf8"));
      const files = archive.files as Array<{ base64: string; sha256: string }>;
      expect(
        files.some(
          (file) =>
            Buffer.from(file.base64, "base64").equals(bytes) &&
            file.sha256 === createHash("sha256").update(bytes).digest("hex"),
        ),
      ).toBe(true);
      expect(JSON.stringify(archive)).toContain("sourceBillingManaged");
      const next = await getSourceBillingRenewalReview(
        owner,
        membership.id,
        db,
      );
      expect(next?.paidFrom).toBe("2030-03-31");
    } finally {
      await db.workspaceUser.delete({ where: { id: staff.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });
  it("binds a legacy source account through an exact owner receipt without extending its paid period", async () => {
    expect((await run("MEMBER_MEMBERSHIP", [contract()])).status).toBe("ok");
    const membership = await db.memberMembership.findFirstOrThrow({
      where: { workspaceId },
    });
    const original = await db.sourceBillingEvidence.findFirstOrThrow({
      where: { workspaceId },
    });
    await db.sourceBillingEvidence.update({
      where: { id: original.id },
      data: { sourceAccountReference: null },
    });
    const user = await db.user.create({
      data: { email: `${randomUUID()}@source-binding.test` },
    });
    const staff = await db.workspaceUser.create({
      data: { workspaceId, userId: user.id, role: "OWNER" },
    });
    try {
      const owner = { workspaceId, workspaceUserId: staff.id, userId: user.id };
      const review = (await getSourceBillingRenewalReview(
        owner,
        membership.id,
        db,
      ))!;
      const input = {
        membershipId: membership.id,
        reviewToken: review.reviewToken,
        operationKey: randomUUID(),
        paidFrom: review.bindingPaidFrom,
        paidThrough: review.paidFrom,
        nextRenewalOn: review.bindingNextRenewalOn,
        sourceAccountReference: "reviewed-source-account",
        sourceReference: "Original account binding receipt",
        bindingOnly: true,
        receiptData: Buffer.from(
          "%PDF-1.4\nOriginal account contract receipt\n%%EOF",
        ),
      };
      await expect(
        recordSourceBillingRenewal(
          owner,
          { ...input, paidThrough: "2030-03-31", nextRenewalOn: "2030-03-31" },
          db,
        ),
      ).rejects.toThrow("preserves the exact");
      expect((await recordSourceBillingRenewal(owner, input, db)).status).toBe(
        "recorded",
      );
      expect((await recordSourceBillingRenewal(owner, input, db)).status).toBe(
        "recorded",
      );
      expect(
        (
          await db.memberMembership.findUniqueOrThrow({
            where: { id: membership.id },
          })
        ).nextBillingDate,
      ).toEqual(membership.nextBillingDate);
      expect(
        (await getSourceBillingRenewalReview(owner, membership.id, db))
          ?.sourceAccountReference,
      ).toBe("reviewed-source-account");
      expect(
        (
          await db.sourceBillingEvidence.findUniqueOrThrow({
            where: { id: original.id },
          })
        ).sourceAccountReference,
      ).toBeNull();
      expect(
        await db.sourceBillingEvidence.count({ where: { workspaceId } }),
      ).toBe(2);
    } finally {
      await db.workspaceUser.delete({ where: { id: staff.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
