import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  NotificationDeliveryError,
  retryFailedNotification,
  PrismaClient,
  type Prisma,
  finalizeDropInBookingPayment,
  snapshotPunchCardTerms,
  cancelAccessBackedBooking,
  processNotificationOutbox,
  shouldDeliverNotification,
  updateClassReminderSettings,
  processClassBookingReminders,
  recordLocalFormSignature,
  type NotificationJobRecord,
} from "@flowstate/db";
import {
  noticeFixtures,
  testUrl,
} from "../tests/class-booking-notification-fixture";
(testUrl ? describe : describe.skip)(
  "notification currentness liveness and exact funded debt",
  () => {
    const { db, fixture, cleanup, disconnect, now } = noticeFixtures();
    afterEach(cleanup);
    afterAll(disconnect);
    const due = new Date("2030-01-07T17:00:00Z");
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    const confirmation = (f: Fixture) =>
      db.notificationJob.findFirstOrThrow({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "BOOKING_CONFIRMATION",
        },
      });
    const configure = (f: Fixture) =>
      updateClassReminderSettings({
        actor: { workspaceId: f.workspace.id, userId: f.owner.id },
        expectedVersion: 0,
        leadMinutes: 120,
        reason: "Fictional explicit reminder setting",
        db,
      });
    const debt = (f: Fixture) =>
      db.invoice.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          memberMembershipId: f.membership.id,
          subtotalCents: 12000,
          totalCents: 12000,
          amountDueCents: 12000,
          currency: "cad",
          status: "OPEN",
          firstFailedAt: now,
          gracePeriodEndsAt: due,
        },
      });
    it("unchanged booking keeps its only confirmation when a name is corrected before first dispatch", async () => {
      const f = await fixture();
      expect((await f.book()).status).toBe("created");
      const original = await confirmation(f);
      expect(original.classNoticeDeliveryStartedAt).toBeNull();
      await db.member.update({
        where: { id: f.member.id },
        data: { fullName: "Corrected fictional participant" },
      });
      const adapter = {
        send: vi.fn(async (job: NotificationJobRecord) => {
          const persisted = await db.notificationJob.findUniqueOrThrow({
            where: { id: job.id },
          });
          expect(persisted.classNoticeDeliveryStartedAt).toEqual(now);
          expect(persisted.body).toBe(job.body);
          expect(persisted.dedupeKey).toBe(original.dedupeKey);
          return {
            status: "sent" as const,
            providerMessageId: "fictional_name_receipt",
          };
        }),
      };
      const result = await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        adapter,
        now,
      });
      expect(result.sentCount).toBe(1);
      expect(adapter.send).toHaveBeenCalledOnce();
      expect(adapter.send.mock.calls[0]![0].id).toBe(original.id);
      expect(adapter.send.mock.calls[0]![0].body).toContain(
        "Corrected fictional participant",
      );
      expect((await confirmation(f)).dedupeKey).toBe(original.dedupeKey);
      expect(adapter.send.mock.calls[0]![0].body.split("\n").slice(1)).toEqual(
        original.body.split("\n").slice(1),
      );
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(1);
      expect(
        await db.classBooking.count({
          where: { workspaceId: f.workspace.id, status: "BOOKED" },
        }),
      ).toBe(1);
    });
    async function requirement(f: Fixture) {
      const doc = await db.formDocument.create({
          data: {
            workspaceId: f.workspace.id,
            name: `Fictional new waiver ${randomUUID()}`,
            formType: "WAIVER",
          },
        }),
        bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
      const version = await db.formVersion.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: doc.id,
          versionNumber: 1,
          fileName: "fictional.pdf",
          mimeType: "application/pdf",
          fileData: bytes,
          fileSizeBytes: bytes.length,
          fileSha256: createHash("sha256").update(bytes).digest("hex"),
          uploadedByWorkspaceUserId: f.staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: doc.id },
        data: { currentVersionId: version.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: doc.id,
          requirementTarget: "MEMBER",
        },
      });
      return version;
    }
    it("current new-form completion cannot discard the sole unattempted booking confirmation", async () => {
      const f = await fixture();
      await f.book();
      const original = await confirmation(f);
      await requirement(f);
      const signed = await requirement(f);
      const request = await db.signatureRequest.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          formVersionId: signed.id,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
        },
      });
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            requestId: request.id,
            actorUserId: f.account.id,
            signerName: f.member.fullName,
            db,
            now,
          })
        ).status,
      ).toBe("signed");
      const adapter = {
        send: vi.fn(async (_job: NotificationJobRecord) => {
          void _job;
          return {
            status: "sent" as const,
            providerMessageId: "fictional_forms_receipt",
          };
        }),
      };
      expect(
        (
          await processNotificationOutbox({
            db,
            workspaceId: f.workspace.id,
            adapter,
            now,
          })
        ).sentCount,
      ).toBe(1);
      expect(adapter.send.mock.calls[0]![0].id).toBe(original.id);
      expect(adapter.send.mock.calls[0]![0].body).toContain(
        "1 required form needs completion",
      );
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(1);
    });
    it("an expired exact funding invoice suppresses new reminder production without changing still-BOOKED service", async () => {
      const f = await fixture();
      await f.book();
      await configure(f);
      await debt(f);
      const before = await db.classBooking.findFirstOrThrow({
        where: { workspaceId: f.workspace.id },
      });
      expect(
        (
          await processClassBookingReminders({
            db,
            workspaceId: f.workspace.id,
            now: due,
          })
        ).queued,
      ).toBe(0);
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: before.id } }),
      ).toEqual(before);
      expect(
        await db.notificationJob.count({
          where: {
            workspaceId: f.workspace.id,
            templateKind: "CLASS_REMINDER",
          },
        }),
      ).toBe(0);
    });
    it("a reminder queued during grace is suppressed at the exact deadline even before seat disposition runs", async () => {
      const f = await fixture();
      await f.book();
      await configure(f);
      await debt(f);
      expect(
        (
          await processClassBookingReminders({
            db,
            workspaceId: f.workspace.id,
            now: new Date("2030-01-07T16:30:00Z"),
          })
        ).queued,
      ).toBe(1);
      const job = await db.notificationJob.findFirstOrThrow({
        where: { workspaceId: f.workspace.id, templateKind: "CLASS_REMINDER" },
      });
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
      expect(
        await db.classBooking.count({
          where: { workspaceId: f.workspace.id, status: "BOOKED" },
        }),
      ).toBe(1);
    });
    it.each(["name", "forms"] as const)(
      "an uncertain confirmation keeps original body and key after %s changes",
      async (change) => {
        const f = await fixture();
        await f.book();
        const original = await confirmation(f);
        const adapter = {
          send: vi.fn(
            async (
              _job: NotificationJobRecord,
            ): Promise<{ status: "sent"; providerMessageId: string }> => {
              void _job;
              throw new Error("Fictional uncertain provider boundary");
            },
          ),
        };
        expect(
          (
            await processNotificationOutbox({
              db,
              workspaceId: f.workspace.id,
              adapter,
              now,
            })
          ).failedCount,
        ).toBe(1);
        expect((await confirmation(f)).classNoticeDeliveryStartedAt).toEqual(
          now,
        );
        if (change === "name")
          await db.member.update({
            where: { id: f.member.id },
            data: { fullName: "Later fictional name" },
          });
        else await requirement(f);
        const retryAt = new Date(+now + 120000);
        expect(
          (
            await processNotificationOutbox({
              db,
              workspaceId: f.workspace.id,
              adapter,
              now: retryAt,
            })
          ).failedCount,
        ).toBe(1);
        const retained = await confirmation(f);
        expect(retained.id).toBe(original.id);
        expect(retained.dedupeKey).toBe(original.dedupeKey);
        expect(retained.body).toBe(original.body);
        expect(retained.context).toEqual(original.context);
        expect(retained.classNoticeDeliveryStartedAt).toEqual(now);
        expect(retained.nextAttemptAt).toBeNull();
        expect(retained.lastError).toContain("original provider request");
        expect(adapter.send).toHaveBeenCalledOnce();
        expect(
          await db.notificationJob.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(1);
      },
    );
    it("a dated service change suppresses rather than refreshes the original unattempted confirmation", async () => {
      const f = await fixture();
      await f.book();
      const original = await confirmation(f);
      await db.member.update({
        where: { id: f.member.id },
        data: { fullName: "Corrected fictional name" },
      });
      await db.location.update({
        where: { id: f.location.id },
        data: { addressLine1: "456 Different fictional road" },
      });
      const adapter = {
        send: vi.fn(async () => ({
          status: "sent" as const,
          providerMessageId: "fictional_forbidden",
        })),
      };
      expect(
        (
          await processNotificationOutbox({
            db,
            workspaceId: f.workspace.id,
            adapter,
            now,
          })
        ).sentCount,
      ).toBe(0);
      expect(adapter.send).not.toHaveBeenCalled();
      expect((await confirmation(f)).body).toBe(original.body);
      expect((await confirmation(f)).classNoticeDeliveryStartedAt).toBeNull();
    });
    it("ordinary restored revision2 gets one refreshed confirmation while old revision remains suppressed", async () => {
      const f = await fixture(),
        first = await f.book();
      if (first.status === "error") throw Error(first.message);
      const original = await confirmation(f);
      await cancelAccessBackedBooking({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        bookingId: first.bookingId,
        timezone: "UTC",
        db: db as never,
        now,
      });
      expect((await f.book()).status).toBe("restored");
      expect(await f.book()).toMatchObject({
        status: "error",
        code: "DUPLICATE",
      });
      await db.member.update({
        where: { id: f.member.id },
        data: { fullName: "Revision two fictional name" },
      });
      const adapter = {
        send: vi.fn(async (_job: NotificationJobRecord) => {
          void _job;
          return {
            status: "sent" as const,
            providerMessageId: "fictional_rebook_receipt",
          };
        }),
      };
      expect(
        (
          await processNotificationOutbox({
            db,
            workspaceId: f.workspace.id,
            adapter,
            now,
          })
        ).sentCount,
      ).toBe(1);
      expect(adapter.send).toHaveBeenCalledOnce();
      expect(adapter.send.mock.calls[0]![0].context).toMatchObject({
        fundingRevision: 2,
      });
      expect(adapter.send.mock.calls[0]![0].body).toContain(
        "Revision two fictional name",
      );
      expect(await shouldDeliverNotification(original, db, now)).toBe(false);
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(2);
    });
    const reminders = (f: Fixture) =>
      db.notificationJob.findFirstOrThrow({
        where: { workspaceId: f.workspace.id, templateKind: "CLASS_REMINDER" },
      });
    async function assertReminder(f: Fixture, allowed: boolean) {
      const before = await db.classBooking.findFirstOrThrow({
        where: { workspaceId: f.workspace.id },
      });
      expect(
        (
          await processClassBookingReminders({
            db,
            workspaceId: f.workspace.id,
            now: due,
          })
        ).queued,
      ).toBe(allowed ? 1 : 0);
      if (allowed)
        expect(
          await shouldDeliverNotification(await reminders(f), db, due),
        ).toBe(true);
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: before.id } }),
      ).toEqual(before);
    }
    it.each(["PAID", "VOID"] as const)(
      "canonical %s history beats an expired failed summary on exact membership funding",
      async (status) => {
        const f = await fixture();
        await f.book();
        await configure(f);
        const invoice = await debt(f);
        await db.invoice.update({
          where: { id: invoice.id },
          data: {
            status,
            amountDueCents: 0,
            amountPaidCents: status === "PAID" ? 12000 : 0,
          },
        });
        await db.memberMembership.update({
          where: { id: f.membership.id },
          data: { status: "PAST_DUE" },
        });
        await db.membershipBillingState.create({
          data: {
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            memberMembershipId: f.membership.id,
            status: "PAYMENT_FAILED",
            gracePeriodEndsAt: due,
          },
        });
        const before = await db.memberMembership.findUniqueOrThrow({
          where: { id: f.membership.id },
        });
        await assertReminder(f, true);
        expect(
          await db.memberMembership.findUniqueOrThrow({
            where: { id: f.membership.id },
          }),
        ).toEqual(before);
      },
    );
    it.each([null, due])(
      "legacy failed summary without invoice history restricts at %s without inventing grace",
      async (gracePeriodEndsAt) => {
        const f = await fixture();
        await f.book();
        await configure(f);
        await db.membershipBillingState.create({
          data: {
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            memberMembershipId: f.membership.id,
            status: "PAYMENT_FAILED",
            gracePeriodEndsAt,
          },
        });
        await assertReminder(f, false);
        expect(
          await db.invoice.count({ where: { workspaceId: f.workspace.id } }),
        ).toBe(0);
      },
    );
    it("an unresolved canonical failure has no fabricated future grace", async () => {
      const f = await fixture();
      await f.book();
      await configure(f);
      const invoice = await debt(f);
      await db.invoice.update({
        where: { id: invoice.id },
        data: {
          firstFailedAt: null,
          gracePeriodEndsAt: null,
          lastFailureCode: "payment_failure_time_unknown",
        },
      });
      await assertReminder(f, false);
    });
    it("a paid latest invoice cannot hide a separate exact-membership failed debt", async () => {
      const f = await fixture();
      await f.book();
      await configure(f);
      await debt(f);
      await db.invoice.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          memberMembershipId: f.membership.id,
          subtotalCents: 1000,
          totalCents: 1000,
          amountPaidCents: 1000,
          amountDueCents: 0,
          currency: "cad",
          status: "PAID",
        },
      });
      await assertReminder(f, false);
    });
    it("a still-future fixed canonical grace remains eligible", async () => {
      const f = await fixture();
      await f.book();
      await configure(f);
      const invoice = await debt(f);
      await db.invoice.update({
        where: { id: invoice.id },
        data: { gracePeriodEndsAt: new Date(+due + 60000) },
      });
      await assertReminder(f, true);
    });
    it("another available membership cannot substitute for the booking's ended exact funding", async () => {
      const f = await fixture();
      await f.book();
      await configure(f);
      await db.memberMembership.update({
        where: { id: f.membership.id },
        data: { status: "ENDED", currentMembershipSlot: null },
      });
      await db.memberMembership.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          membershipPlanId: f.plan.id,
          status: "ACTIVE",
        },
      });
      await assertReminder(f, false);
    });
    it("exact frozen funding does not get service reminders inside its freeze", async () => {
      const f = await fixture();
      await f.book();
      await configure(f);
      await db.memberMembership.update({
        where: { id: f.membership.id },
        data: {
          status: "FROZEN",
          frozenFrom: new Date("2030-01-06"),
          frozenUntil: new Date("2030-01-09"),
        },
      });
      await assertReminder(f, false);
    });
    it.each(["PUNCH_CARD", "DROP_IN"] as const)(
      "independent %s funding remains eligible despite the member's expired membership debt",
      async (kind) => {
        const f = await fixture();
        await db.memberMembership.update({
          where: { id: f.membership.id },
          data: { status: "ENDED" },
        });
        if (kind === "PUNCH_CARD") {
          const product = await db.punchCardProduct.create({
            data: {
              workspaceId: f.workspace.id,
              name: "Fictional independent pack",
              punchesIncluded: 5,
              priceCents: 6000,
              currency: "cad",
            },
          });
          await db.memberPunchCard.create({
            data: {
              workspaceId: f.workspace.id,
              memberId: f.member.id,
              punchCardProductId: product.id,
              originalPunches: 5,
              remainingPunches: 5,
              purchasePriceCents: 6000,
              purchaseCurrency: "cad",
              acceptedTerms: JSON.parse(
                JSON.stringify(snapshotPunchCardTerms(product)),
              ),
            },
          });
          expect(await f.book()).toMatchObject({
            status: "created",
            bookingType: kind,
          });
        } else {
          await db.dropInProduct.create({
            data: {
              workspaceId: f.workspace.id,
              name: "Fictional independent drop-in",
              priceCents: 2000,
              currency: "cad",
              restrictionMode: "GENERAL",
            },
          });
          const pending = await f.book({ allowDropIn: true });
          if (pending.status !== "payment_required")
            throw Error("Expected paid hold");
          await db.classBooking.update({
            where: { id: pending.bookingId },
            data: { dropInCheckoutSessionId: "cs_fictional_independent" },
          });
          expect(
            await finalizeDropInBookingPayment({
              workspaceId: f.workspace.id,
              bookingId: pending.bookingId,
              checkoutSessionId: "cs_fictional_independent",
              amountCents: 2000,
              currency: "CAD",
              paymentIntentId: "pi_fictional_independent",
              db: db as never,
              now,
            }),
          ).toBe("booked");
        }
        await debt(f);
        await configure(f);
        const fundingBefore = await db.punchCardEntry.findMany({
          where: { workspaceId: f.workspace.id },
        });
        const paymentsBefore = await db.payment.findMany({
          where: { workspaceId: f.workspace.id },
        });
        await assertReminder(f, true);
        expect(
          await db.punchCardEntry.findMany({
            where: { workspaceId: f.workspace.id },
          }),
        ).toEqual(fundingBefore);
        expect(
          await db.payment.findMany({ where: { workspaceId: f.workspace.id } }),
        ).toEqual(paymentsBefore);
      },
    );
    async function whileBlocked(
      f: Fixture,
      lock: "invoice" | "recipient",
      change: (tx: Prisma.TransactionClient) => Promise<unknown>,
      command: (client: PrismaClient) => Promise<boolean>,
    ) {
      let ready!: (pid: number) => void,
        release!: () => void,
        waiterReady!: (pid: number) => void;
      const locked = new Promise<number>((resolve) => {
          ready = resolve;
        }),
        canCommit = new Promise<void>((resolve) => {
          release = resolve;
        }),
        waiterStarted = new Promise<number>((resolve) => {
          waiterReady = resolve;
        });
      const blocker = db
        .$transaction(async (tx) => {
          if (lock === "invoice")
            await tx.$queryRaw`SELECT id FROM invoices WHERE "workspaceId"=${f.workspace.id} FOR UPDATE`;
          else
            await tx.$queryRaw`SELECT id FROM workspace_users WHERE "workspaceId"=${f.workspace.id} AND "userId"=${f.account.id} FOR UPDATE`;
          const rows = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          ready(rows[0]!.pid);
          await canCommit;
          await change(tx);
        })
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
      let primary: unknown;
      let outcome:
        | Promise<{ ok: true; value: boolean } | { ok: false; error: unknown }>
        | undefined;
      try {
        const initial = await Promise.race([
          locked.then((pid) => ({ kind: "ready" as const, pid })),
          blocker.then((result) => ({ kind: "finished" as const, result })),
        ]);
        if (initial.kind === "finished")
          throw initial.result.ok
            ? Error("Blocker finished before lock")
            : initial.result.error;
        const traced = new Proxy(db, {
          get(target, key) {
            if (key === "$transaction")
              return <T>(
                callback: (tx: Prisma.TransactionClient) => Promise<T>,
                options?: {
                  maxWait?: number;
                  timeout?: number;
                  isolationLevel?: Prisma.TransactionIsolationLevel;
                },
              ) =>
                target.$transaction(async (tx) => {
                  const rows = await tx.$queryRaw<
                    Array<{ pid: number }>
                  >`SELECT pg_backend_pid() AS pid`;
                  waiterReady(rows[0]!.pid);
                  return callback(tx);
                }, options);
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        outcome = command(traced).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        const started = await Promise.race([
          waiterStarted.then((pid) => ({ kind: "started" as const, pid })),
          outcome.then((result) => ({ kind: "finished" as const, result })),
        ]);
        if (started.kind === "finished")
          throw started.result.ok
            ? Error("Command finished before transaction")
            : started.result.error;
        let observed: Array<{
          pid: number;
          blockedBy: number[];
          query: string;
        }> = [];
        await expect
          .poll(
            async () => {
              observed =
                await db.$queryRaw`SELECT a.pid, pg_blocking_pids(a.pid) AS "blockedBy", a.query FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.pid=${started.pid} AND NOT l.granted AND ${initial.pid}=ANY(pg_blocking_pids(a.pid)) AND l.locktype IN ('transactionid','tuple') AND a.query LIKE '%FOR SHARE%'`;
              return observed.some((row) =>
                row.query.includes(
                  lock === "invoice" ? "FROM invoices" : "workspace_users",
                ),
              );
            },
            { timeout: 2000 },
          )
          .toBe(true);
        console.info(
          "CLASS_NOTICE_OBSERVED_WAIT",
          JSON.stringify({
            lock,
            blockerPid: initial.pid,
            waiterPid: started.pid,
            observed,
          }),
        );
      } catch (error) {
        primary = error;
      } finally {
        release();
        const completed = await blocker;
        if (outcome) await outcome;
        if (!completed.ok) {
          if (primary)
            console.error(
              "Supplemental funding/recipient blocker failure retained",
              {
                errorType:
                  completed.error instanceof Error
                    ? completed.error.name
                    : typeof completed.error,
              },
            );
          else primary = completed.error;
        }
      }
      if (primary) throw primary;
      const result = await outcome!;
      if (!result.ok) throw result.error;
      return result.value;
    }
    it.each(["invoice", "recipient"] as const)(
      "dispatch uses a post-all-lock clock when grace expires during a real %s wait",
      async (lock) => {
        const f = await fixture();
        await f.book();
        await configure(f);
        await debt(f);
        await processClassBookingReminders({
          db,
          workspaceId: f.workspace.id,
          now: new Date("2030-01-07T16:30:00Z"),
        });
        const job = await reminders(f);
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2030-01-07T16:59:59Z"));
        try {
          expect(
            await whileBlocked(
              f,
              lock,
              async () => {
                vi.setSystemTime(due);
              },
              (client) => shouldDeliverNotification(job, client),
            ),
          ).toBe(false);
        } finally {
          vi.useRealTimers();
        }
        expect(
          await db.classBooking.count({
            where: { workspaceId: f.workspace.id, status: "BOOKED" },
          }),
        ).toBe(1);
      },
    );
    it("an invoice paid during an observed exact-row wait is reread as paid before dispatch", async () => {
      const f = await fixture();
      await f.book();
      await configure(f);
      const invoice = await debt(f);
      await processClassBookingReminders({
        db,
        workspaceId: f.workspace.id,
        now: new Date("2030-01-07T16:30:00Z"),
      });
      const job = await reminders(f);
      expect(
        await whileBlocked(
          f,
          "invoice",
          (tx) =>
            tx.invoice.update({
              where: { id: invoice.id },
              data: {
                status: "PAID",
                amountDueCents: 0,
                amountPaidCents: 12000,
              },
            }),
          (client) => shouldDeliverNotification(job, client, due),
        ),
      ).toBe(true);
    });

    it.each(["name", "forms"] as const)(
      "owner retry of an unattempted FAILED confirmation after %s change keeps one delivery identity",
      async (change) => {
        const f = await fixture();
        await f.book();
        const original = await confirmation(f);
        const adapter = {
          send: vi.fn(async (_job: NotificationJobRecord) => {
            void _job;
            return {
              status: "sent" as const,
              providerMessageId: "fictional_owner_retry_receipt",
            };
          }),
        };
        expect(
          (
            await processNotificationOutbox({
              db,
              workspaceId: f.workspace.id,
              adapter,
              now,
              shouldSend: async () => {
                throw new NotificationDeliveryError(
                  "Fictional readiness failure before provider",
                  false,
                );
              },
            })
          ).failedCount,
        ).toBe(1);
        const failed = await confirmation(f);
        expect(failed.status).toBe("FAILED");
        expect(failed.nextAttemptAt).toBeNull();
        expect(failed.classNoticeDeliveryStartedAt).toBeNull();
        expect(adapter.send).not.toHaveBeenCalled();
        if (change === "name")
          await db.member.update({
            where: { id: f.member.id },
            data: { fullName: "Owner retry corrected fictional name" },
          });
        else await requirement(f);
        expect(
          await retryFailedNotification({
            workspaceId: f.workspace.id,
            actorUserId: f.owner.id,
            notificationJobId: failed.id,
            expectedUpdatedAt: failed.updatedAt,
            operationId: randomUUID(),
            reason: "Fictional owner reviewed the pre-adapter failure",
            db,
            now,
          }),
        ).toEqual({ status: "queued" });
        expect((await confirmation(f)).body).toBe(original.body);
        expect((await confirmation(f)).classNoticeDeliveryStartedAt).toBeNull();
        expect(
          (
            await processNotificationOutbox({
              db,
              workspaceId: f.workspace.id,
              adapter,
              now,
            })
          ).sentCount,
        ).toBe(1);
        expect(adapter.send).toHaveBeenCalledOnce();
        const sent = adapter.send.mock.calls[0]![0];
        expect(sent.id).toBe(original.id);
        expect(sent.body).toContain(
          change === "name"
            ? "Owner retry corrected fictional name"
            : "1 required form needs completion",
        );
        expect((await confirmation(f)).dedupeKey).toBe(original.dedupeKey);
        expect(
          await db.notificationJob.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(1);
      },
    );
    it("canonical form completion1→0 after an unattempted failure refreshes the same confirmation on owner retry", async () => {
      const f = await fixture();
      await f.book();
      const original = await confirmation(f),
        version = await requirement(f);
      const adapter = {
        send: vi.fn(async (_job: NotificationJobRecord) => {
          void _job;
          return {
            status: "sent" as const,
            providerMessageId: "fictional_completed_form_receipt",
          };
        }),
      };
      await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        adapter,
        now,
        shouldSend: async () => {
          throw new NotificationDeliveryError(
            "Fictional terminal failure before adapter",
            false,
          );
        },
      });
      const failed = await confirmation(f);
      expect(failed.body).toContain("1 required form needs completion");
      expect(failed.classNoticeDeliveryStartedAt).toBeNull();
      expect(adapter.send).not.toHaveBeenCalled();
      const request = await db.signatureRequest.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          formVersionId: version.id,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
        },
      });
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            requestId: request.id,
            actorUserId: f.account.id,
            signerName: f.member.fullName,
            db,
            now,
          })
        ).status,
      ).toBe("signed");
      expect(
        await retryFailedNotification({
          workspaceId: f.workspace.id,
          actorUserId: f.owner.id,
          notificationJobId: failed.id,
          expectedUpdatedAt: failed.updatedAt,
          operationId: randomUUID(),
          reason:
            "Fictional owner reviewed pre-adapter failure after form completion",
          db,
          now,
        }),
      ).toEqual({ status: "queued" });
      expect((await confirmation(f)).body).toBe(failed.body);
      expect(
        (
          await processNotificationOutbox({
            db,
            workspaceId: f.workspace.id,
            adapter,
            now,
          })
        ).sentCount,
      ).toBe(1);
      expect(adapter.send.mock.calls[0]![0].id).toBe(original.id);
      expect(adapter.send.mock.calls[0]![0].body).toContain(
        "No outstanding required forms",
      );
      expect((await confirmation(f)).dedupeKey).toBe(original.dedupeKey);
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(1);
    });
    it.each(["grace", "recipient", "cancellation"] as const)(
      "a real final notification-row wait rechecks %s before the first provider boundary",
      async (change) => {
        const f = await fixture();
        await f.book();
        await configure(f);
        await debt(f);
        await processClassBookingReminders({
          db,
          workspaceId: f.workspace.id,
          now: new Date("2030-01-07T16:30:00Z"),
        });
        const job = await reminders(f);
        await db.notificationJob.updateMany({
          where: {
            workspaceId: f.workspace.id,
            templateKind: "BOOKING_CONFIRMATION",
          },
          data: { status: "CANCELLED", nextAttemptAt: null },
        });
        const adapter = {
          send: vi.fn(async (_job: NotificationJobRecord) => {
            void _job;
            return {
              status: "sent" as const,
              providerMessageId: "fictional_forbidden_after_row_wait",
            };
          }),
        };
        let ready!: (pid: number) => void, release!: () => void;
        const locked = new Promise<number>((resolve) => {
            ready = resolve;
          }),
          canCommit = new Promise<void>((resolve) => {
            release = resolve;
          });
        let blocker:
          | Promise<{ ok: true } | { ok: false; error: unknown }>
          | undefined;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2030-01-07T16:59:59Z"));
        const worker = processNotificationOutbox({
          db,
          workspaceId: f.workspace.id,
          adapter,
          shouldSend: async (candidate) => {
            expect(await shouldDeliverNotification(candidate, db)).toBe(true);
            blocker = db
              .$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM notification_jobs WHERE id=${job.id} AND "workspaceId"=${f.workspace.id} FOR UPDATE`;
                const rows = await tx.$queryRaw<
                  Array<{ pid: number }>
                >`SELECT pg_backend_pid() AS pid`;
                ready(rows[0]!.pid);
                await canCommit;
              })
              .then(
                () => ({ ok: true as const }),
                (error: unknown) => ({ ok: false as const, error }),
              );
            const result = await Promise.race([
              locked.then((pid) => ({ ok: true as const, pid })),
              blocker.then((result) => ({ ok: false as const, result })),
            ]);
            if (!result.ok)
              throw result.result.ok
                ? Error("Row blocker completed before lock")
                : result.result.error;
            return true;
          },
        }).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        let primary: unknown;
        try {
          const initial = await Promise.race([
            locked.then((pid) => ({ kind: "ready" as const, pid })),
            worker.then((result) => ({ kind: "finished" as const, result })),
          ]);
          if (initial.kind === "finished")
            throw initial.result.ok
              ? Error("Worker finished before row blocker")
              : initial.result.error;
          let observed: Array<{
            pid: number;
            blockedBy: number[];
            query: string;
          }> = [];
          await expect
            .poll(
              async () => {
                observed =
                  await db.$queryRaw`SELECT a.pid, pg_blocking_pids(a.pid) AS "blockedBy", a.query FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE NOT l.granted AND ${initial.pid}=ANY(pg_blocking_pids(a.pid)) AND l.locktype IN ('transactionid','tuple') AND a.query LIKE '%notification_jobs%' AND (a.query LIKE '%UPDATE%' OR a.query LIKE '%FOR UPDATE%')`;
                return observed.length;
              },
              { timeout: 2000 },
            )
            .toBeGreaterThan(0);
          expect(observed.every((row) => row.pid !== initial.pid)).toBe(true);
          console.info(
            "CLASS_NOTICE_FINAL_ROW_WAIT",
            JSON.stringify({ change, blockerPid: initial.pid, observed }),
          );
          if (change === "grace") vi.setSystemTime(due);
          else if (change === "recipient")
            await db.workspaceUser.updateMany({
              where: { workspaceId: f.workspace.id, userId: f.account.id },
              data: { isActive: false },
            });
          else
            await db.classBooking.updateMany({
              where: {
                workspaceId: f.workspace.id,
                id: (job.context as { bookingId: string }).bookingId,
              },
              data: { status: "CANCELLED" },
            });
        } catch (error) {
          primary = error;
        } finally {
          release();
          const held = blocker && (await blocker);
          await worker;
          vi.useRealTimers();
          if (held && !held.ok) {
            if (primary)
              console.error("Supplemental final-row blocker failure retained", {
                errorType:
                  held.error instanceof Error
                    ? held.error.name
                    : typeof held.error,
              });
            else primary = held.error;
          }
        }
        if (primary) throw primary;
        const result = await worker;
        if (!result.ok) throw result.error;
        expect(result.value.sentCount).toBe(0);
        expect(adapter.send).not.toHaveBeenCalled();
        const retained = await reminders(f);
        expect(retained.classNoticeDeliveryStartedAt).toBeNull();
        expect(retained.id).toBe(job.id);
        expect(retained.dedupeKey).toBe(job.dedupeKey);
      },
    );
  },
);
