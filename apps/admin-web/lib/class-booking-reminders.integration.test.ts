import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  processClassBookingReminders,
  updateClassReminderSettings,
  getClassReminderSettings,
  shouldDeliverNotification,
  processNotificationOutbox,
  retryFailedNotification,
  NotificationDeliveryError,
  cancelAccessBackedBooking,
  type ClassReminderCursor,
} from "@flowstate/db";
import {
  noticeFixtures,
  testUrl,
} from "../tests/class-booking-notification-fixture";
(testUrl ? describe : describe.skip)(
  "bounded current class and trial reminders",
  () => {
    const { db, fixture, cleanup, disconnect, now, date, users } =
      noticeFixtures();
    afterEach(cleanup);
    afterAll(disconnect);
    const due = new Date("2030-01-07T17:00:00Z");
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    const configure = (f: Fixture, leadMinutes: number | null, version = 0) =>
      updateClassReminderSettings({
        actor: { workspaceId: f.workspace.id, userId: f.owner.id },
        expectedVersion: version,
        leadMinutes,
        reason: "Fictional owner-selected reminder interval",
        db,
      });
    const sweep = (
      f: Fixture,
      changes: Partial<Parameters<typeof processClassBookingReminders>[0]> = {},
    ) =>
      processClassBookingReminders({
        workspaceId: f.workspace.id,
        db,
        now: due,
        ...changes,
      });
    const reminders = (f: Fixture) =>
      db.notificationJob.findMany({
        where: { workspaceId: f.workspace.id, templateKind: "CLASS_REMINDER" },
        orderBy: { id: "asc" },
      });
    async function guardian(f: Fixture, canBook: boolean) {
      const account = await db.user.create({
        data: {
          email: `${randomUUID()}@booking-notice.example.test`,
          fullName: "Fictional guardian",
          workspaceUsers: {
            create: {
              workspaceId: f.workspace.id,
              role: "CUSTOMER",
              isActive: true,
            },
          },
        },
      });
      users.push(account.id);
      await db.member.create({
        data: {
          workspaceId: f.workspace.id,
          userId: account.id,
          fullName: "Fictional guardian",
          email: account.email,
        },
      });
      const guardian = await db.guardian.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional guardian",
          email: account.email,
        },
      });
      await db.familyLink.create({
        data: {
          workspaceId: f.workspace.id,
          guardianId: guardian.id,
          childMemberId: f.member.id,
        },
      });
      const grant = await db.memberPortalGrant.create({
        data: {
          workspaceId: f.workspace.id,
          userId: account.id,
          memberId: f.member.id,
          guardianId: guardian.id,
          verifiedByWorkspaceUserId: f.staff.id,
          verificationNote: "Fictional verified guardian",
          canBook,
          canPay: true,
        },
      });
      return { account, guardian, grant };
    }
    it("private member notes never enter service messages or context", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const jobs = await db.notificationJob.findMany({
        where: { workspaceId: f.workspace.id },
      });
      expect(jobs.length).toBeGreaterThan(0);
      for (const job of jobs)
        expect(
          JSON.stringify({
            body: job.body,
            subject: job.subject,
            context: job.context,
          }),
        ).not.toContain("PRIVATE_NOTE_NEVER_EMAIL");
    });
    it("absent configuration is off and scans no bookings", async () => {
      const f = await fixture();
      await f.book();
      expect(
        await getClassReminderSettings(
          { workspaceId: f.workspace.id, userId: f.owner.id },
          db,
        ),
      ).toEqual({ version: 0, leadMinutes: null });
      expect(await sweep(f)).toEqual({
        scanned: 0,
        queued: 0,
        nextCursor: null,
        configured: false,
      });
      expect(await reminders(f)).toHaveLength(0);
    });
    it("only the current active owner can configure an interval", async () => {
      const f = await fixture();
      await expect(
        updateClassReminderSettings({
          actor: { workspaceId: f.workspace.id, userId: f.account.id },
          expectedVersion: 0,
          leadMinutes: 60,
          reason: "Unauthorized",
          db,
        }),
      ).rejects.toThrow("current active owner");
      expect(
        await db.workspaceSetting.findUnique({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBeNull();
    });
    it("rejects malformed and out-of-range intervals before writing", async () => {
      const f = await fixture();
      for (const leadMinutes of [0, -1, 0.5, 527041, "1e3", " 60", "", true])
        await expect(
          updateClassReminderSettings({
            actor: { workspaceId: f.workspace.id, userId: f.owner.id },
            expectedVersion: 0,
            leadMinutes,
            reason: "Invalid interval",
            db,
          }),
        ).rejects.toThrow();
      expect(
        await db.workspaceSetting.findUnique({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBeNull();
    });
    it("audits explicit settings without changing accepted booking or monetary terms", async () => {
      const f = await fixture();
      await f.book();
      const before = await db.classBooking.findFirstOrThrow({
        where: { workspaceId: f.workspace.id },
      });
      expect(await configure(f, 60)).toEqual({ version: 1, leadMinutes: 60 });
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: before.id } }),
      ).toEqual(before);
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId: f.workspace.id,
            kind: "CLASS_REMINDER_SETTINGS_CHANGED",
          },
        }),
      ).toBe(1);
    });
    it("stale settings version cannot overwrite another owner decision", async () => {
      const f = await fixture();
      await configure(f, 60);
      await expect(configure(f, 120)).rejects.toThrow("settings changed");
      expect(
        await getClassReminderSettings(
          { workspaceId: f.workspace.id, userId: f.owner.id },
          db,
        ),
      ).toEqual({ version: 1, leadMinutes: 60 });
    });
    it("only queues once the explicitly selected lead window is reached", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      expect(
        (await sweep(f, { now: new Date("2030-01-07T16:59:59Z") })).queued,
      ).toBe(0);
      expect((await sweep(f)).queued).toBe(1);
      expect((await reminders(f))[0]).toMatchObject({
        status: "PENDING",
        providerMessageId: null,
      });
    });
    it("repeated and competing producer claims retain one durable reminder", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      const results = await Promise.all([sweep(f), sweep(f)]);
      expect(results.reduce((sum, result) => sum + result.queued, 0)).toBe(1);
      expect((await sweep(f)).queued).toBe(0);
      expect(await reminders(f)).toHaveLength(1);
    });
    it("a failed enqueue leaves no partial reminder and a retry can produce the same event", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      const wrapped = {
        $transaction: (run: (value: unknown) => unknown) =>
          db.$transaction(async (tx) => {
            const notificationJob = new Proxy(tx.notificationJob, {
              get(target, key) {
                if (key === "createMany")
                  return vi
                    .fn()
                    .mockRejectedValue(
                      new Error("Fictional reminder enqueue fault"),
                    );
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            return run(
              new Proxy(tx, {
                get(target, key) {
                  if (key === "notificationJob") return notificationJob;
                  const value = Reflect.get(target, key);
                  return typeof value === "function"
                    ? value.bind(target)
                    : value;
                },
              }),
            );
          }),
      };
      await expect(sweep(f, { db: wrapped as never })).rejects.toThrow(
        "Fictional reminder enqueue fault",
      );
      expect(await reminders(f)).toHaveLength(0);
      expect((await sweep(f)).queued).toBe(1);
      expect(
        await db.classBooking.count({
          where: { workspaceId: f.workspace.id, status: "BOOKED" },
        }),
      ).toBe(1);
    });
    it("payer-only household permission never receives service reminders", async () => {
      const f = await fixture(),
        payer = await guardian(f, false);
      await f.book();
      await configure(f, 60);
      await sweep(f);
      expect((await reminders(f)).map((job) => job.recipientEmail)).toEqual([
        f.account.email.toLowerCase(),
      ]);
      expect(
        (await reminders(f)).some(
          (job) => job.recipientEmail === payer.account.email,
        ),
      ).toBe(false);
    });
    it("current verified booking guardian receives the exact child notice", async () => {
      const f = await fixture(),
        parent = await guardian(f, true);
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f)).find(
        (row) => row.recipientEmail === parent.account.email,
      )!;
      expect(job).toBeDefined();
      expect(job.body).toContain(f.member.fullName);
      expect(await shouldDeliverNotification(job, db, due)).toBe(true);
    });
    it("guardian revocation before production excludes that recipient", async () => {
      const f = await fixture(),
        parent = await guardian(f, true);
      await f.book();
      await configure(f, 60);
      await db.memberPortalGrant.update({
        where: { id: parent.grant.id },
        data: { revokedAt: now },
      });
      await sweep(f);
      expect(
        (await reminders(f)).some(
          (job) => job.recipientEmail === parent.account.email,
        ),
      ).toBe(false);
    });
    it("guardian revocation after enqueue suppresses dispatch", async () => {
      const f = await fixture(),
        parent = await guardian(f, true);
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f)).find(
        (row) => row.recipientEmail === parent.account.email,
      )!;
      await db.memberPortalGrant.update({
        where: { id: parent.grant.id },
        data: { revokedAt: now },
      });
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
    });
    it("removing the exact child family link suppresses dispatch", async () => {
      const f = await fixture(),
        parent = await guardian(f, true);
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f)).find(
        (row) => row.recipientEmail === parent.account.email,
      )!;
      await db.familyLink.deleteMany({
        where: {
          workspaceId: f.workspace.id,
          guardianId: parent.guardian.id,
          childMemberId: f.member.id,
        },
      });
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
    });
    it("deactivated participant account suppresses its already queued reminder", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f))[0]!;
      await db.workspaceUser.update({
        where: {
          workspaceId_userId: {
            workspaceId: f.workspace.id,
            userId: f.account.id,
          },
        },
        data: { isActive: false },
      });
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
    });
    it("cancellation suppresses queued reminder and produces none for the released booking", async () => {
      const f = await fixture(),
        booked = await f.book();
      if (booked.status === "error") throw Error(booked.message);
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f))[0]!;
      await cancelAccessBackedBooking({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        bookingId: booked.bookingId,
        timezone: "UTC",
        db: db as never,
        now,
      });
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
      expect((await sweep(f)).queued).toBe(0);
    });
    it("same-id rebooking invalidates the old funding revision and allows one new reminder", async () => {
      const f = await fixture(),
        booked = await f.book();
      if (booked.status === "error") throw Error(booked.message);
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f))[0]!;
      await cancelAccessBackedBooking({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        bookingId: booked.bookingId,
        timezone: "UTC",
        db: db as never,
        now,
      });
      await f.book();
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
      expect((await sweep(f)).queued).toBe(1);
      expect(await reminders(f)).toHaveLength(2);
    });
    it("a changed dated occurrence suppresses the old reminder and waits for the new due time", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f))[0]!;
      await db.classInstance.create({
        data: {
          workspaceId: f.workspace.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date(date),
          programId: f.program.id,
          roomId: f.room.id,
          startTimeMinutes: 1200,
          endTimeMinutes: 1260,
          bookingCutoffMinutes: 60,
          cancellationCutoffMinutes: 120,
          status: "ACTIVE",
          isScheduleOverride: true,
        },
      });
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
      expect((await sweep(f)).queued).toBe(0);
      expect(
        (await sweep(f, { now: new Date("2030-01-07T19:00:00Z") })).queued,
      ).toBe(1);
    });
    it("class cancellation and a class that has begun suppress dispatch", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f))[0]!;
      expect(
        await shouldDeliverNotification(
          job,
          db,
          new Date("2030-01-07T18:00:00Z"),
        ),
      ).toBe(false);
      await db.classInstance.create({
        data: {
          workspaceId: f.workspace.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date(date),
          programId: f.program.id,
          roomId: f.room.id,
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          bookingCutoffMinutes: 60,
          cancellationCutoffMinutes: 120,
          status: "CANCELLED",
        },
      });
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
    });
    it("turning reminders off cancels pending reminders and preserves confirmations", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f))[0]!;
      await configure(f, null, 1);
      expect(
        (await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } }))
          .status,
      ).toBe("CANCELLED");
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
      expect(
        await db.notificationJob.count({
          where: {
            workspaceId: f.workspace.id,
            templateKind: "BOOKING_CONFIRMATION",
            status: "PENDING",
          },
        }),
      ).toBe(1);
    });
    it("changing timing invalidates old pending context and a new due pass replaces it", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const job = (await reminders(f))[0]!;
      await configure(f, 120, 1);
      expect(await shouldDeliverNotification(job, db, due)).toBe(false);
      expect((await sweep(f)).queued).toBe(1);
      expect(await reminders(f)).toHaveLength(2);
    });
    it("disabled workspace and newly archived beneficiary produce no eligible reminder", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await db.member.update({
        where: { id: f.member.id },
        data: { archivedAt: now },
      });
      expect((await sweep(f)).queued).toBe(0);
      await db.workspace.update({
        where: { id: f.workspace.id },
        data: { status: "DISABLED" },
      });
      expect((await sweep(f)).configured).toBe(false);
    });
    it("bounded compound cursor advances beyond deduped first pages without scanning another gym", async () => {
      const f = await fixture(),
        other = await fixture();
      await f.book();
      await other.book();
      await configure(f, 60);
      for (let i = 0; i < 4; i++) {
        const account = await db.user.create({
          data: {
            email: `${randomUUID()}@booking-notice.example.test`,
            workspaceUsers: {
              create: {
                workspaceId: f.workspace.id,
                role: "CUSTOMER",
                isActive: true,
              },
            },
          },
        });
        users.push(account.id);
        const person = await db.member.create({
          data: {
            workspaceId: f.workspace.id,
            userId: account.id,
            fullName: `Fictional participant ${i}`,
            status: "ACTIVE",
          },
        });
        await f.book({ memberId: person.id, trial: true });
      }
      let cursor: ClassReminderCursor | undefined,
        total = 0,
        pages = 0;
      do {
        const result = await sweep(f, { limit: 2, cursor });
        expect(result.scanned).toBeLessThanOrEqual(2);
        total += result.queued;
        pages++;
        cursor = result.nextCursor ?? undefined;
        expect(pages).toBeLessThan(5);
      } while (cursor);
      expect(pages).toBe(3);
      expect(total).toBe(5);
      expect(await reminders(f)).toHaveLength(5);
      expect(await reminders(other)).toHaveLength(0);
      expect((await sweep(f, { limit: 2 })).queued).toBe(0);
    });
    async function legacyRequirement(f: Fixture, target: "TRIAL" | "MEMBER") {
      const doc = await db.formDocument.create({
        data: {
          workspaceId: f.workspace.id,
          name: `Fictional required ${target} ${randomUUID()}`,
          formType: "WAIVER",
        },
      });
      const version = await db.formVersion.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: doc.id,
          versionNumber: 1,
          fileName: "fictional-waiver.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 9,
          fileSha256: "a".repeat(64),
          fileData: Buffer.from("%PDF-1.4\n"),
          uploadedByWorkspaceUserId: f.staff.id,
          createdAt: now,
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
          requirementTarget: target,
        },
      });
    }
    it("ACTIVE trial funding still discloses the person's current MEMBER form audience", async () => {
      const f = await fixture();
      await f.book({ trial: true });
      await legacyRequirement(f, "MEMBER");
      await configure(f, 60);
      await sweep(f);
      expect((await reminders(f))[0]!.body).toContain(
        "1 required form needs completion",
      );
    });
    it("TRIAL ordinary membership funding still discloses the person's TRIAL form audience", async () => {
      const f = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      await f.book();
      await legacyRequirement(f, "TRIAL");
      await configure(f, 60);
      await sweep(f);
      expect((await reminders(f))[0]!.body).toContain(
        "1 required form needs completion",
      );
    });
    it("a newly required form invalidates the old queued body and replaces it with current waiver status", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const old = (await reminders(f))[0]!;
      await legacyRequirement(f, "MEMBER");
      expect(await shouldDeliverNotification(old, db, due)).toBe(false);
      expect((await sweep(f)).queued).toBe(1);
      expect(
        (await reminders(f)).find((job) => job.id !== old.id)!.body,
      ).toContain("1 required form needs completion");
    });
    it("mixed-case account email does not receive another delivered reminder after a timing edit", async () => {
      const f = await fixture();
      await db.user.update({
        where: { id: f.account.id },
        data: {
          email: `MixedCase-${randomUUID()}@Booking-Notice.Example.Test`,
        },
      });
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const sent = (await reminders(f))[0]!;
      await db.notificationJob.update({
        where: { id: sent.id },
        data: {
          status: "SENT",
          providerMessageId: "fictional_receipt",
          sentAt: due,
        },
      });
      await configure(f, 120, 1);
      expect((await sweep(f)).queued).toBe(0);
      expect(await reminders(f)).toHaveLength(1);
    });
    it("a name correction cannot create a second reminder for an already delivered booking revision", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const sent = (await reminders(f))[0]!;
      await db.notificationJob.update({
        where: { id: sent.id },
        data: {
          status: "SENT",
          providerMessageId: "fictional_receipt",
          sentAt: due,
        },
      });
      await db.member.update({
        where: { id: f.member.id },
        data: { fullName: "Corrected fictional participant" },
      });
      expect((await sweep(f)).queued).toBe(0);
      expect(await reminders(f)).toHaveLength(1);
    });
    it("a new form-status body cannot create a second reminder after the original was delivered", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const sent = (await reminders(f))[0]!;
      await db.notificationJob.update({
        where: { id: sent.id },
        data: {
          status: "SENT",
          providerMessageId: "fictional_receipt",
          sentAt: due,
        },
      });
      await legacyRequirement(f, "MEMBER");
      expect((await sweep(f)).queued).toBe(0);
      expect(await reminders(f)).toHaveLength(1);
    });

    it("an in-flight original provider identity prevents replacement while the owner changes timing", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      await db.notificationJob.updateMany({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "BOOKING_CONFIRMATION",
        },
        data: { status: "CANCELLED", nextAttemptAt: null },
      });
      let started!: () => void, release!: () => void;
      const reachedProvider = new Promise<void>((resolve) => {
          started = resolve;
        }),
        providerMayFinish = new Promise<void>((resolve) => {
          release = resolve;
        });
      const adapter = {
        send: vi.fn(async () => {
          started();
          await providerMayFinish;
          return {
            status: "sent" as const,
            providerMessageId: "fictional_original_receipt",
          };
        }),
      };
      const worker = processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        now: due,
        adapter,
        shouldSend: (job) => shouldDeliverNotification(job, db, due),
      });
      await Promise.race([
        reachedProvider,
        worker.then(() => {
          throw new Error(
            "The fictional worker finished before reaching its provider barrier.",
          );
        }),
      ]);
      let observationError: unknown;
      try {
        const original = (await reminders(f))[0]!;
        expect(original.status).toBe("SENDING");
        expect(original.classNoticeDeliveryStartedAt).toEqual(due);
        await configure(f, 120, 1);
        expect((await sweep(f)).queued).toBe(0);
        expect(await reminders(f)).toHaveLength(1);
      } catch (error) {
        observationError = error;
      } finally {
        release();
      }
      const finished = await worker;
      if (observationError) throw observationError;
      expect(finished.sentCount).toBe(1);
      expect((await sweep(f)).queued).toBe(0);
      expect(adapter.send).toHaveBeenCalledOnce();
      expect(await reminders(f)).toHaveLength(1);
    });
    it("an uncertain prior provider attempt stays attached to its original job after a timing edit", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      await db.notificationJob.updateMany({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "BOOKING_CONFIRMATION",
        },
        data: { status: "CANCELLED", nextAttemptAt: null },
      });
      const adapter = {
        send: vi
          .fn()
          .mockRejectedValue(
            new Error("Fictional uncertain provider response"),
          ),
      };
      expect(
        (
          await processNotificationOutbox({
            db,
            workspaceId: f.workspace.id,
            now: due,
            adapter,
            shouldSend: (job) => shouldDeliverNotification(job, db, due),
          })
        ).failedCount,
      ).toBe(1);
      const original = (await reminders(f))[0]!;
      expect(original.status).toBe("FAILED");
      expect(original.classNoticeDeliveryStartedAt).toEqual(due);
      await configure(f, 120, 1);
      expect((await sweep(f)).queued).toBe(0);
      const retryAt = new Date(+due + 120000);
      await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        now: retryAt,
        adapter,
        shouldSend: (job) => shouldDeliverNotification(job, db, retryAt),
      });
      const retained = await db.notificationJob.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(retained.status).toBe("FAILED");
      expect(retained.nextAttemptAt).toBeNull();
      expect(retained.lastError).toContain("original provider request");
      expect((await sweep(f)).queued).toBe(0);
      expect(await reminders(f)).toHaveLength(1);
      expect(adapter.send).toHaveBeenCalledOnce();
    });
    it("a stale unattempted body can be suppressed without crossing the provider boundary", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      const old = (await reminders(f))[0]!;
      await db.member.update({
        where: { id: f.member.id },
        data: { fullName: "Corrected fictional name" },
      });
      await sweep(f);
      await db.notificationJob.updateMany({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "BOOKING_CONFIRMATION",
        },
        data: { status: "CANCELLED", nextAttemptAt: null },
      });
      const adapter = {
        send: vi.fn(async () => ({
          status: "sent" as const,
          providerMessageId: "fictional_current_receipt",
        })),
      };
      await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        now: due,
        adapter,
      });
      const superseded = await db.notificationJob.findUniqueOrThrow({
        where: { id: old.id },
      });
      expect(superseded.status).toBe("CANCELLED");
      expect(superseded.classNoticeDeliveryStartedAt).toBeNull();
      expect(adapter.send).toHaveBeenCalledOnce();
    });

    it("expired uncertain reminders become terminal once and remain byte-for-byte stable on the next pass", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      await db.notificationJob.updateMany({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "BOOKING_CONFIRMATION",
        },
        data: { status: "CANCELLED", nextAttemptAt: null },
      });
      const adapter = {
        send: vi
          .fn()
          .mockRejectedValue(new Error("Fictional uncertain response")),
      };
      await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        now: due,
        adapter,
      });
      const original = (await reminders(f))[0]!;
      expect(original.classNoticeDeliveryStartedAt).toEqual(due);
      await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        now: new Date("2030-01-07T18:01:00Z"),
        adapter,
      });
      const terminal = await db.notificationJob.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(terminal.status).toBe("FAILED");
      expect(terminal.nextAttemptAt).toBeNull();
      expect(terminal.lastError).toContain("original provider request");
      await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        now: new Date("2030-01-07T18:02:00Z"),
        adapter,
      });
      expect(
        await db.notificationJob.findUniqueOrThrow({
          where: { id: original.id },
        }),
      ).toEqual(terminal);
      expect(adapter.send).toHaveBeenCalledOnce();
    });
    it("existing owner retry of a current confirmation uses its existing transaction and original message identity", async () => {
      const f = await fixture();
      await f.book();
      const job = await db.notificationJob.findFirstOrThrow({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "BOOKING_CONFIRMATION",
        },
      });
      const failed = await db.notificationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          attempts: 6,
          nextAttemptAt: null,
          lastError: "Fictional terminal delivery",
        },
      });
      const args = {
        workspaceId: f.workspace.id,
        actorUserId: f.owner.id,
        notificationJobId: job.id,
        expectedUpdatedAt: failed.updatedAt,
        operationId: randomUUID(),
        reason: "Fictional owner reviewed original delivery",
        db,
        now,
      };
      expect(await retryFailedNotification(args)).toEqual({ status: "queued" });
      expect(await retryFailedNotification(args)).toEqual({ status: "queued" });
      const retained = await db.notificationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(retained.body).toBe(job.body);
      expect(retained.dedupeKey).toBe(job.dedupeKey);
      expect(retained.attempts).toBe(6);
      expect(retained.nextAttemptAt).toEqual(now);
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(1);
    });
    it("owner retry after an actual terminal reminder adapter failure retains its provider key and first-attempt marker", async () => {
      const f = await fixture();
      await f.book();
      await configure(f, 60);
      await sweep(f);
      await db.notificationJob.updateMany({
        where: {
          workspaceId: f.workspace.id,
          templateKind: "BOOKING_CONFIRMATION",
        },
        data: { status: "CANCELLED", nextAttemptAt: null },
      });
      const fail = {
        send: vi
          .fn()
          .mockRejectedValue(
            new NotificationDeliveryError(
              "Fictional terminal provider result",
              false,
            ),
          ),
      };
      await processNotificationOutbox({
        db,
        workspaceId: f.workspace.id,
        now: due,
        adapter: fail,
      });
      const original = (await reminders(f))[0]!;
      expect(original.status).toBe("FAILED");
      expect(original.nextAttemptAt).toBeNull();
      expect(original.classNoticeDeliveryStartedAt).toEqual(due);
      expect(
        await retryFailedNotification({
          workspaceId: f.workspace.id,
          actorUserId: f.owner.id,
          notificationJobId: original.id,
          expectedUpdatedAt: original.updatedAt,
          operationId: randomUUID(),
          reason: "Fictional provider review",
          db,
          now: due,
        }),
      ).toEqual({ status: "queued" });
      const recovered = {
        send: vi.fn(async (_job: { id: string }) => {
          void _job;
          return {
            status: "sent" as const,
            providerMessageId: "fictional_recovered_receipt",
          };
        }),
      };
      expect(
        (
          await processNotificationOutbox({
            db,
            workspaceId: f.workspace.id,
            now: due,
            adapter: recovered,
          })
        ).sentCount,
      ).toBe(1);
      const retained = await db.notificationJob.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(retained.status).toBe("SENT");
      expect(retained.classNoticeDeliveryStartedAt).toEqual(due);
      expect(recovered.send.mock.calls[0]![0].id).toBe(original.id);
      expect(await reminders(f)).toHaveLength(1);
      expect((await sweep(f)).queued).toBe(0);
    });
  },
);
