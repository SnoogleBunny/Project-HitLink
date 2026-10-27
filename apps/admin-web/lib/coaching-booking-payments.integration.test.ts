import { installProviderNetworkGuard } from "../../../tests/support/provider-network-guard.mjs";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
type CheckoutRequest = NonNullable<Parameters<Stripe["checkout"]["sessions"]["create"]>[0]>;

const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = {
      sessions: { create: provider.create, retrieve: provider.retrieve },
    };
  },
}));
import {
  Prisma,
  prisma as db,
  addDays,
  getWorkspaceDateString,
  coachingBookingWeekdays,
  previewCoachingBookingPolicy,
  confirmCoachingBookingPolicy,
  lockClassSchedule,
  runCoachingCommand,
  getCoachingDetail,
  requireCoachingPaymentAuthority,
  requireNewCoachingPurchaseTx,
  coachingCheckoutCaptureTimeTx,
  recordCoachingCheckoutDisclosureTx,
  readCoachingCheckoutHelpPromiseTx,
  listCoachingCheckoutHelpReceiptsTx,
  coachingCheckoutDisclosureKind,
  type CoachingBookingDisclosure,
} from "@flowstate/db";
import {
  startCoachingPayment,
  checkCoachingPayment,
} from "../../../packages/payments/src/coaching";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory.js";

const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test") ||
    !process.env.DATABASE_URL ||
    new URL(process.env.DATABASE_URL).host !== new URL(url).host ||
    new URL(process.env.DATABASE_URL).pathname !== new URL(url).pathname)
)
  throw new Error(
    "Coaching payment tests require matching local disposable TEST_DATABASE_URL and DATABASE_URL ending in _test.",
  );
(url ? describe : describe.skip)(
  "program appointment policy and durable payment boundary (real PostgreSQL; SDK evidence stub)",
  () => {
    const workspaceIds: string[] = [],
      userIds: string[] = [];
    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fictional_coaching_policy");
      vi.stubEnv("NEXT_PUBLIC_MEMBER_WEB_URL", "https://member.example.test");
    });
    async function fixture(units = 2) {
      const owner = await db.user.create({
        data: {
          email: `${randomUUID()}@coaching-payment.example.test`,
          fullName: "Fictional payment help owner",
        },
      });
      const coach = await db.user.create({
        data: {
          email: `${randomUUID()}@coaching-payment.example.test`,
          fullName: "Fictional coach",
        },
      });
      const client = await db.user.create({
        data: {
          email: `${randomUUID()}@coaching-payment.example.test`,
          fullName: "Fictional adult payer",
        },
      });
      userIds.push(owner.id, coach.id, client.id);
      const workspace = await db.workspace.create({
        data: {
          name: "Fictional coaching payment policy gym",
          status: "ACTIVE",
          location: { create: { name: "Gym", timezone: "UTC" } },
          workspaceUsers: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: coach.id, role: "COACH" },
              { userId: client.id, role: "CUSTOMER" },
            ],
          },
        },
        include: { workspaceUsers: true },
      });
      workspaceIds.push(workspace.id);
      const ownerStaff = workspace.workspaceUsers.find(
          (row) => row.userId === owner.id,
        )!,
        coachStaff = workspace.workspaceUsers.find(
          (row) => row.userId === coach.id,
        )!;
      const member = await db.member.create({
        data: {
          workspaceId: workspace.id,
          userId: client.id,
          fullName: "Fictional adult payer",
          dateOfBirth: new Date("1990-01-01"),
          status: "ACTIVE",
        },
      });
      const program = await db.coachingProgram.create({
        data: {
          workspaceId: workspace.id,
          name: "Fictional program",
          versions: {
            create: {
              number: 1,
              durationDays: 30,
              deliveryWeekdays: [1, 2, 3, 4, 5],
              responseHours: 48,
              goals: "Fictional goals",
              milestones: [],
              appointmentUnits: units,
              appointmentMinutes: 60,
              cancellationHours: 24,
              noShowGraceMinutes: 15,
              priceCents: 12000,
              currency: "cad",
              terms: "Fictional accepted terms",
            },
          },
        },
        include: { versions: true },
      });
      const today = getWorkspaceDateString(new Date(), "UTC");
      const enrollment = await db.coachingEnrollment.create({
        data: {
          workspaceId: workspace.id,
          memberId: member.id,
          programVersionId: program.versions[0]!.id,
          startsOn: new Date(today),
          endsOn: new Date(addDays(today, 29)),
          timezone: "UTC",
          acceptedAt: new Date(),
          contactVerifiedAt: new Date(),
          currentCoachWorkspaceUserId: coachStaff.id,
          caseOwnerWorkspaceUserId: ownerStaff.id,
          paymentState: "PENDING",
          historyFromDate: new Date(today),
          assignments: {
            create: {
              coachWorkspaceUserId: coachStaff.id,
              acceptedAt: new Date(),
              historyFromDate: new Date(today),
            },
          },
        },
      });
      await db.workspaceStripeSettings.create({
        data: {
          workspaceId: workspace.id,
          stripeAccountId: `acct_${randomUUID()}`,
          connectionStatus: "ACTIVE",
          chargesEnabled: true,
        },
      });
      return {
        workspace,
        owner,
        ownerStaff,
        coachStaff,
        client,
        member,
        enrollment,
        actor: { workspaceId: workspace.id, userId: client.id },
        ownerActor: { workspaceId: workspace.id, userId: owner.id },
      };
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    async function confirm(f: Fixture, closed = false, hours = 24) {
      const current = await db.coachingBookingPolicy.findUnique({
        where: { workspaceId: f.workspace.id },
      });
      const input = {
        policy: {
          schemaVersion: 1,
          appointments: {
            weeklyHours: coachingBookingWeekdays.map((weekday) => ({
              weekday,
              intervals: closed ? [] : [{ startMinute: 0, endMinute: 1440 }],
            })),
            maxAdvanceMinutes: 60 * 1440,
            minimumLeadMinutes: 0,
            minimumBufferMinutes: 0,
            resolutionResponseHours: hours,
          },
        },
        reason: "Fictional explicit delivery review",
        expectedVersion: current?.version ?? 0,
        operationId: randomUUID(),
      };
      const preview = await previewCoachingBookingPolicy({
        actor: f.ownerActor,
        input,
        db,
      });
      return confirmCoachingBookingPolicy({
        actor: f.ownerActor,
        input,
        previewHash: preview.previewHash,
        confirmed: true,
        db,
      });
    }
    function session(
      payload: CheckoutRequest,
      paid = false,
    ) {
      return {
        id: "cs_fictional_coaching_policy",
        mode: "payment",
        client_reference_id: payload.client_reference_id,
        metadata: payload.metadata,
        amount_total: 12000,
        currency: "cad",
        status: paid ? "complete" : "open",
        url: "https://checkout.example.test/fictional",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        payment_status: paid ? "paid" : "unpaid",
        payment_intent: paid
          ? {
              id: "pi_fictional_coaching_policy",
              status: "succeeded",
              amount: 12000,
              amount_received: 12000,
              currency: "cad",
            }
          : null,
      };
    }
    afterAll(async () => {
      for (const workspaceId of workspaceIds)
        for (let attempt = 0; ; attempt++)
          try {
            await db.$transaction(
              async (tx) => {
                await lockClassSchedule(tx, workspaceId);
                for (const prefix of [
                  "family-access",
                  "financial",
                  "retention",
                ])
                  await tx.$queryRawUnsafe(
                    "SELECT pg_advisory_xact_lock(hashtext($1))::text",
                    `${prefix}:${workspaceId}`,
                  );
                const inventory = await inspectRetentionInventory(
                  tx,
                  workspaceId,
                );
                await deleteReviewedWorkspaceRecords(
                  tx,
                  workspaceId,
                  inventory.fingerprint,
                );
              },
              { isolationLevel: "Serializable", timeout: 120000 },
            );
            break;
          } catch (error) {
            if (
              !(error instanceof Prisma.PrismaClientKnownRequestError) ||
              error.code !== "P2034" ||
              attempt >= 11
            )
              throw error;
            await new Promise((resolve) =>
              setTimeout(resolve, 25 + Math.random() * 100),
            );
          }
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      vi.unstubAllEnvs();
      await db.$disconnect();
    }, 600000);
    type ReservationOptions = {
      operation?: Partial<Prisma.FinancialOperationUncheckedCreateInput>;
      disclosure?: (value: CoachingBookingDisclosure) => unknown;
      omitReceipt?: boolean;
      rawReceipt?: boolean;
      payloadMetadata?: Record<string,string>;
      omitDisclosureMetadata?: boolean;
    };
    // Construct the exact current request under the REAL domain locks/authority.
    // Each raw SQL negative changes one boundary after that valid baseline.
    async function reserveTx(tx: Prisma.TransactionClient, f: Fixture, options: ReservationOptions = {}) {
      await lockClassSchedule(tx,f.workspace.id);
      const payer = await requireCoachingPaymentAuthority(tx,f.actor,f.enrollment.id);
      const capturedAt = await coachingCheckoutCaptureTimeTx(tx);
      const disclosure = await requireNewCoachingPurchaseTx(tx,f.workspace.id,f.enrollment.id,capturedAt);
      if (!disclosure) throw new Error("Positive appointment fixture required");
      const version = await tx.coachingProgramVersion.findUniqueOrThrow({where:{id:payer.enrollment.programVersionId},include:{program:true}});
      const key = `coaching-checkout:${f.enrollment.id}:sql-${randomUUID()}`;
      const payload = {
        mode:"payment",customer_email:payer.payerEmail,client_reference_id:f.enrollment.id,
        line_items:[{quantity:1,price_data:{currency:version.currency,unit_amount:version.priceCents,product_data:{name:version.program.name}}}],
        metadata:{purpose:"coaching",workspaceId:f.workspace.id,enrollmentId:f.enrollment.id,memberId:f.member.id,programVersionId:version.id,payerAccountId:payer.payerAccountId,payerUserId:f.client.id,payerGrantId:"",payerGrantVersion:"",
          appointmentBookingPolicyEventId:disclosure.policyEventId,appointmentBookingPolicyVersion:String(disclosure.policyVersion),appointmentBookingPolicyHash:disclosure.policyHash,appointmentAvailabilityHash:disclosure.availabilityHash,appointmentAvailableCount:String(disclosure.availableCount),appointmentNotOpenCount:String(disclosure.notOpenCount),appointmentBookingResolutionHours:String(disclosure.resolutionResponseHours),appointmentBookingCaseOwnerId:disclosure.resolutionOwnerWorkspaceUserId,appointmentTimesNotHeld:"true",appointmentAvailabilityReviewedAt:disclosure.reviewedAt},
        payment_intent_data:{metadata:{purpose:"coaching",workspaceId:f.workspace.id,enrollmentId:f.enrollment.id}},
        success_url:"https://member.example.test/returned",cancel_url:"https://member.example.test/cancelled",
      };
      Object.assign(payload.metadata,options.payloadMetadata ?? {});
      if(options.omitDisclosureMetadata) for(const key of Object.keys(payload.metadata))
        if(key.startsWith("appointment")) delete (payload.metadata as Record<string,string>)[key];
      const operation = await tx.financialOperation.create({data:{workspaceId:f.workspace.id,operationKey:key,requestHash:createHash("sha256").update(JSON.stringify(payload)).digest("hex"),kind:"CHECKOUT",status:"SUBMITTED",actorUserId:f.client.id,payerAccountId:payer.payerAccountId,beneficiaryMemberId:f.member.id,targetId:f.enrollment.id,amountCents:version.priceCents,currency:version.currency,providerAccountId:"acct_fictional_sql",providerIdempotencyKey:key,payload,submittedAt:capturedAt,createdAt:capturedAt,updatedAt:capturedAt,...options.operation}});
      const capturedDisclosure=(options.disclosure?.(disclosure) ?? disclosure) as CoachingBookingDisclosure;
      let receiptId:string|null=null;
      if(!options.omitReceipt) {
        if(options.rawReceipt) {
          const hashes=await tx.$queryRaw<Array<{hash:string}>>`SELECT encode(sha256(convert_to(payload::text,'UTF8')),'hex') AS hash FROM financial_operations WHERE id=${operation.id}`;
          const commercial=(operation.payload as Prisma.JsonObject).metadata as Prisma.JsonObject;
          const receipt=await tx.workspaceDataEvent.create({data:{workspaceId:f.workspace.id,actorUserId:operation.actorUserId,kind:coachingCheckoutDisclosureKind,createdAt:capturedAt,metadata:{schemaVersion:1,operationId:operation.id,operationVersionAtCapture:1,requestHash:operation.requestHash,requestPayloadHash:hashes[0]!.hash,enrollmentId:operation.targetId,beneficiaryMemberId:operation.beneficiaryMemberId,programVersionId:commercial.programVersionId,payerAccountId:operation.payerAccountId,payerUserId:operation.actorUserId,payerGrantId:null,payerGrantVersion:null,capturedAt:capturedAt.toISOString(),appointmentBookingDisclosure:capturedDisclosure} as Prisma.InputJsonObject}});
          receiptId=receipt.id;
        } else receiptId=await recordCoachingCheckoutDisclosureTx(tx,{workspaceId:f.workspace.id,operationId:operation.id,disclosure:capturedDisclosure});
      }
      return {operation,receiptId,disclosure};
    }
    const promise = (f:Fixture) => db.$transaction(tx=>readCoachingCheckoutHelpPromiseTx(tx,{workspaceId:f.workspace.id,enrollmentId:f.enrollment.id,beneficiaryMemberId:f.member.id}));

    it("atomically pairs each new submitted disclosure, rejects unsubmitted/malformed/current-policy/foreign bindings and rolls back the operation",async()=>{
      const f=await fixture(), foreign=await fixture();
      await confirm(f,false,2);await confirm(foreign,false,1);
      const invalid:ReservationOptions[]=[
        {omitReceipt:true},
        {omitReceipt:true,omitDisclosureMetadata:true},
        {operation:{status:"RESERVED"}},
        {operation:{version:2}},
        {operation:{actorUserId:foreign.client.id}},
        {operation:{beneficiaryMemberId:foreign.member.id}},
        {operation:{targetId:foreign.enrollment.id}},
        {operation:{amountCents:11999}},
        {operation:{currency:"usd"}},
        {operation:{requestHash:"wrong-request-hash"}},
        {disclosure:d=>({...d,extra:true})},
        {disclosure:d=>({...d,resolutionResponseHours:"1"})},
        {disclosure:d=>({...d,resolutionResponseHours:1})},
        {payloadMetadata:{appointmentBookingResolutionHours:"1"},disclosure:d=>({...d,resolutionResponseHours:1})},
        {payloadMetadata:{programVersionId:foreign.enrollment.programVersionId}},
        {disclosure:d=>({...d,policyHash:"0".repeat(64)})},
        {disclosure:d=>({...d,reviewedAt:"2020-01-01T00:00:00.000Z"})},
        {disclosure:d=>({...d,resolutionOwnerWorkspaceUserId:foreign.ownerStaff.id})},
      ];
      for(const option of invalid){
        await expect(db.$transaction(tx=>reserveTx(tx,f,{...option,rawReceipt:true}))).rejects.toThrow();
        expect(await db.financialOperation.count({where:{workspaceId:f.workspace.id}})).toBe(0);
        expect(await db.workspaceDataEvent.count({where:{workspaceId:f.workspace.id,kind:coachingCheckoutDisclosureKind}})).toBe(0);
      }
      const marker=new Error("Fictional transaction abort after both writes");
      await expect(db.$transaction(async tx=>{await reserveTx(tx,f);throw marker;})).rejects.toThrow(marker.message);
      expect(await db.financialOperation.count({where:{workspaceId:f.workspace.id}})).toBe(0);
      expect(await promise(f)).toBeUndefined();
      const valid=await db.$transaction(tx=>reserveTx(tx,f));
      expect(await promise(f)).toBe(2);
      expect(await promise(foreign)).toBeUndefined();
      const foreignReceipt=await db.workspaceDataEvent.findUniqueOrThrow({where:{id:valid.receiptId!}});
      await expect(db.workspaceDataEvent.create({data:{workspaceId:foreign.workspace.id,actorUserId:foreign.client.id,kind:coachingCheckoutDisclosureKind,metadata:foreignReceipt.metadata as Prisma.InputJsonValue,createdAt:foreignReceipt.createdAt}})).rejects.toThrow();
    });

    it("keeps a captured help promise after FAILED and other later status changes without conferring payment or allowing loose JSON/backfill",async()=>{
      const f=await fixture();await confirm(f,false,2);
      const reserved=await db.$transaction(tx=>reserveTx(tx,f));
      await confirm(f,false,48);
      for(const status of ["FAILED","REVIEW_REQUIRED","SUCCEEDED","SUBMITTED"] as const){
        await db.financialOperation.update({where:{id:reserved.operation.id},data:{status,version:{increment:1},lastError:"Fictional status-only transition"}});
        expect(await promise(f)).toBe(2);
        expect((await getCoachingDetail(f.actor,f.enrollment.id)).bookingAvailability).toMatchObject({resolutionResponseHours:2});
      }
      expect((await db.coachingEnrollment.findUniqueOrThrow({where:{id:f.enrollment.id}})).paymentState).toBe("PENDING");
      expect(await db.payment.count({where:{workspaceId:f.workspace.id}})).toBe(0);
      const loose=await db.financialOperation.create({data:{workspaceId:f.workspace.id,operationKey:randomUUID(),requestHash:"0".repeat(64),kind:"ISSUE_CREDIT",status:"RESERVED",actorUserId:f.client.id,payerAccountId:reserved.operation.payerAccountId,beneficiaryMemberId:f.member.id,targetId:f.enrollment.id,providerIdempotencyKey:randomUUID(),payload:{metadata:{purpose:"coaching",appointmentBookingResolutionHours:"1"}}}});
      expect(await promise(f)).toBe(2);
      await expect(db.$transaction(tx=>recordCoachingCheckoutDisclosureTx(tx,{workspaceId:f.workspace.id,operationId:loose.id,disclosure:{...reserved.disclosure,resolutionResponseHours:1}}))).rejects.toThrow("new submitted checkout");
      await expect(db.financialOperation.update({where:{id:loose.id},data:{kind:"CHECKOUT",payload:reserved.operation.payload as Prisma.InputJsonValue,status:"SUBMITTED",submittedAt:new Date(),createdAt:new Date()}})).rejects.toThrow("immutable");
      const event=await db.workspaceDataEvent.findUniqueOrThrow({where:{id:reserved.receiptId!}});
      await expect(db.workspaceDataEvent.create({data:{workspaceId:f.workspace.id,actorUserId:f.client.id,kind:coachingCheckoutDisclosureKind,metadata:event.metadata as Prisma.InputJsonValue,createdAt:event.createdAt}})).rejects.toThrow();
      expect(await db.workspaceDataEvent.count({where:{workspaceId:f.workspace.id,kind:coachingCheckoutDisclosureKind}})).toBe(1);
    });

    it("protects exact captured request and receipt fields while allowing ordinary provider results and reviewed fixture retention",async()=>{
      const f=await fixture(), foreign=await fixture();await confirm(f,false,2);
      const reserved=await db.$transaction(tx=>reserveTx(tx,f));
      const changes:Prisma.FinancialOperationUncheckedUpdateInput[]=[
        {workspaceId:foreign.workspace.id},{actorUserId:foreign.client.id},{beneficiaryMemberId:foreign.member.id},
        {targetId:foreign.enrollment.id},{payerAccountId:null},{operationKey:randomUUID()},
        {providerIdempotencyKey:randomUUID()},{providerAccountId:"acct_other"},{requestHash:"1".repeat(64)},
        {amountCents:1},{currency:"usd"},{units:1},{payload:{metadata:{appointmentBookingResolutionHours:"1"}}},
        {submittedAt:new Date(0)},{createdAt:new Date(0)},{kind:"REFUND"},
      ];
      for(const data of changes)await expect(db.financialOperation.update({where:{id:reserved.operation.id},data})).rejects.toThrow("immutable");
      await expect(db.financialOperation.delete({where:{id:reserved.operation.id}})).rejects.toThrow("reviewed retention");
      for(const data of [{kind:"OTHER"},{metadata:{resolutionResponseHours:1}},{actorUserId:foreign.client.id}])
        await expect(db.workspaceDataEvent.update({where:{id:reserved.receiptId!},data})).rejects.toThrow("immutable");
      await expect(db.workspaceDataEvent.delete({where:{id:reserved.receiptId!}})).rejects.toThrow("reviewed retention");
      await db.financialOperation.update({where:{id:reserved.operation.id},data:{version:{increment:1},status:"REVIEW_REQUIRED",providerReference:"cs_fictional_result",providerUrl:"https://checkout.example.test/result",result:{fictional:true},lastError:"Pending provider review",expiresAt:new Date(Date.now()+60000)}});
      expect(await promise(f)).toBe(2);
      expect((await db.financialOperation.findUniqueOrThrow({where:{id:reserved.operation.id}})).payload).toEqual(reserved.operation.payload);
      // afterAll performs canonical live-inventory reviewed deletion; no trigger
      // disable, parent-cascade shortcut or hand-ordered delete graph is used.
    });

    it("gates only a new purchase, then recovers the exact uncertain checkout and settles cash once after policy and case-owner change", async () => {
      const f = await fixture();
      await expect(
        startCoachingPayment(f.actor, f.enrollment.id),
      ).rejects.toThrow("delivery and booking-help");
      expect(provider.create).not.toHaveBeenCalled();
      expect(
        await db.financialOperation.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(0);
      await confirm(f, false, 6);
      await db.coachingIntake.create({data:{enrollmentId:f.enrollment.id,content:"Fictional private intake, excluded from checkout/help receipts"}});
      const beforeAcceptance = await db.coachingEnrollment.findUniqueOrThrow({where:{id:f.enrollment.id}});
      await runCoachingCommand(f.actor, {kind:"acceptPlan",enrollmentId:f.enrollment.id,expectedVersion:beforeAcceptance.version,operationId:randomUUID(),input:{acceptTerms:true}});
      const accepted = await db.coachingAcceptedPlan.findFirstOrThrow({where:{enrollmentId:f.enrollment.id}});
      expect(accepted.snapshot).toMatchObject({appointmentBookingDisclosure:{resolutionResponseHours:6}});
      const first = await confirm(f, false, 2);
      provider.create.mockRejectedValueOnce(
        new Error("Fictional lost provider response"),
      );
      await expect(
        startCoachingPayment(f.actor, f.enrollment.id),
      ).rejects.toThrow("lost provider response");
      const operation = await db.financialOperation.findFirstOrThrow({
          where: { workspaceId: f.workspace.id, kind: "CHECKOUT" },
        }),
        payload =
          operation.payload as unknown as CheckoutRequest;
      expect(operation).toMatchObject({
        status: "SUBMITTED",
        providerReference: null,
      });
      expect(payload.metadata).toMatchObject({
        appointmentBookingPolicyEventId: first.id,
        appointmentBookingPolicyVersion: "2",
        appointmentTimesNotHeld: "true",
        appointmentAvailableCount: "0",
        appointmentBookingResolutionHours: "2",
        appointmentBookingCaseOwnerId: f.ownerStaff.id,
      });
      expect(
        (
          await db.coachingEnrollment.findUniqueOrThrow({
            where: { id: f.enrollment.id },
          })
        ).checkoutSessionId,
      ).toBeNull();
      expect(JSON.stringify(payload)).not.toContain("virtualUrl");
      const receipt = await db.workspaceDataEvent.findFirstOrThrow({where:{workspaceId:f.workspace.id,kind:coachingCheckoutDisclosureKind}});
      expect(receipt.metadata).toMatchObject({operationId:operation.id,requestHash:operation.requestHash,capturedAt:operation.submittedAt!.toISOString(),appointmentBookingDisclosure:{resolutionResponseHours:2,reviewedAt:operation.submittedAt!.toISOString()}});
      expect(receipt.createdAt).toEqual(operation.submittedAt);
      const hashes=await db.$queryRaw<Array<{hash:string}>>`SELECT encode(sha256(convert_to(payload::text,'UTF8')),'hex') AS hash FROM financial_operations WHERE id=${operation.id}`;
      expect(receipt.metadata).toHaveProperty("requestPayloadHash",hashes[0]!.hash);
      await confirm(f, true, 48);
      await db.workspaceUser.update({
        where: { id: f.ownerStaff.id },
        data: { isActive: false },
      });
      provider.create.mockResolvedValueOnce(session(payload));
      expect(await startCoachingPayment(f.actor, f.enrollment.id)).toBe(
        "https://checkout.example.test/fictional",
      );
      expect(provider.create).toHaveBeenCalledTimes(2);
      expect(provider.create.mock.calls[1]).toEqual(
        provider.create.mock.calls[0],
      );
      expect(provider.create.mock.calls[1]![1]).toMatchObject({
        idempotencyKey: operation.providerIdempotencyKey,
      });
      const recovered = await db.financialOperation.findUniqueOrThrow({
        where: { id: operation.id },
      });
      expect(recovered.payload).toEqual(operation.payload);
      expect(recovered.requestHash).toBe(operation.requestHash);
      expect(
        await db.financialOperation.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(1);
      provider.retrieve.mockResolvedValue(session(payload, true));
      expect(await checkCoachingPayment(f.actor, f.enrollment.id)).toBe("PAID");
      expect(await checkCoachingPayment(f.actor, f.enrollment.id)).toBe("PAID");
      const paid = await db.coachingEnrollment.findUniqueOrThrow({
        where: { id: f.enrollment.id },
      });
      expect(paid).toMatchObject({ paymentState: "PAID" });
      expect(
        (
          await db.coachingProgramVersion.findUniqueOrThrow({
            where: { id: paid.programVersionId },
          })
        ).appointmentUnits,
      ).toBe(2);
      expect(
        await db.payment.count({
          where: { workspaceId: f.workspace.id, status: "SUCCEEDED" },
        }),
      ).toBe(1);
      expect(
        await db.paymentConfirmation.count({
          where: { workspaceId: f.workspace.id, paymentId: paid.paymentId! },
        }),
      ).toBe(1);
      expect(
        await db.notificationJob.count({
          where: {
            workspaceId: f.workspace.id,
            context: { path: ["kind"], equals: "PAYMENT_CONFIRMATION" },
          },
        }),
      ).toBe(1);
      expect(
        await db.coachingEvent.count({
          where: { enrollmentId: f.enrollment.id, kind: "PAYMENT_VERIFIED" },
        }),
      ).toBe(1);
      expect(provider.create).toHaveBeenCalledTimes(2);
      expect(await db.workspaceDataEvent.count({where:{workspaceId:f.workspace.id,kind:coachingCheckoutDisclosureKind}})).toBe(1);
      await db.workspaceUser.update({where:{id:f.ownerStaff.id},data:{isActive:true}});
      expect((await getCoachingDetail(f.actor,f.enrollment.id)).bookingAvailability).toMatchObject({resolutionResponseHours:2,disclosure:{resolutionResponseHours:2}});
      expect(await db.coachingAcceptedPlan.count({where:{enrollmentId:f.enrollment.id}})).toBe(1);
      const safe = await db.$transaction(tx=>listCoachingCheckoutHelpReceiptsTx(tx,{workspaceId:f.workspace.id,enrollmentId:f.enrollment.id,beneficiaryMemberId:f.member.id}));
      expect(safe).toEqual([expect.objectContaining({id:receipt.id,enrollmentId:f.enrollment.id,policyVersion:2,resolutionResponseHours:2,notHeld:true})]);
      expect(JSON.stringify(safe)).not.toContain(f.client.id);
      expect(JSON.stringify(safe)).not.toContain("payer");
      expect(JSON.stringify(safe)).not.toContain("Hash");
      expect(JSON.stringify(safe)).not.toContain("private intake");
      expect(await db.$transaction(tx=>listCoachingCheckoutHelpReceiptsTx(tx,{workspaceId:f.workspace.id,enrollmentId:f.enrollment.id,beneficiaryMemberId:"another-client"}))).toEqual([]);
    });
    it("leaves a zero-appointment program purchase independent of an unconfigured appointment policy", async () => {
      const f = await fixture(0);
      provider.create.mockImplementation(
        async (payload: CheckoutRequest) => ({
          ...session(payload),
          id: "cs_fictional_zero_appointments",
        }),
      );
      expect(await startCoachingPayment(f.actor, f.enrollment.id)).toBe(
        "https://checkout.example.test/fictional",
      );
      expect(
        await db.coachingBookingPolicy.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(0);
      expect(await db.workspaceDataEvent.count({where:{workspaceId:f.workspace.id,kind:coachingCheckoutDisclosureKind}})).toBe(0);
      const op = await db.financialOperation.findFirstOrThrow({
        where: { workspaceId: f.workspace.id },
      });
      expect((op.payload as Prisma.JsonObject).metadata).not.toHaveProperty(
        "appointmentBookingPolicyEventId",
      );
    });
  },
);

// Test-only offline boundary is independent of Vitest module-resolution identity.
const providerNetworkGuard = installProviderNetworkGuard();
afterEach(() => {
  expect(providerNetworkGuard.report.blocked).toHaveLength(0);
  expect(providerNetworkGuard.report.openedExternalSockets).toBe(0);
});
afterAll(() => { providerNetworkGuard.restore(); });
