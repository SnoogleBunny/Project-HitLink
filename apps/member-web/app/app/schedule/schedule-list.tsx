"use client";

import {
  Badge,
  Money,
  Notice,
  useWorkspaceLoading,
  useWorkspaceLocale,
} from "@flowstate/ui";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { getMembershipAllowanceSummary } from "@flowstate/db";
import {
  emptyScheduleActionState,
  emptyBookingsActionState,
} from "../../form-states";
import { createSelfBookingAction, resumeBookingPaymentAction } from "./actions";
import {
  cancelSelfBookingAction,
  leaveSelfWaitlistAction,
  moveSelfBookingAction,
} from "../bookings/actions";
import { SubmitButton } from "../../_components/submit-button";
import type {
  ScheduleOccurrence,
  MemberBookingSummary,
  MemberWaitlistSummary,
} from "../../../lib/self-service-bookings";

type Allowance = Awaited<ReturnType<typeof getMembershipAllowanceSummary>>;
function formatScheduleDate(date: string, short = false, locale = "en-CA") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(short ? {} : { year: "numeric" }),
  }).format(new Date(`${date}T12:00:00Z`));
}
function shifted(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
function titleStatus(status: string) {
  return status === "PAYMENT_PENDING" || status === "PENDING_PAYMENT"
    ? "Payment pending"
    : status
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (c) => c.toUpperCase());
}
function buildOccurrenceDateTimeLabel(occurrence: ScheduleOccurrence): string {
  return occurrence.dateLabel.includes(occurrence.timeLabel)
    ? occurrence.dateLabel
    : `${occurrence.dateLabel} at ${occurrence.timeLabel}`;
}
export function buildOccurrenceActionLabel(
  occurrence: ScheduleOccurrence,
  visibleLabel = occurrence.actionLabel,
): string {
  return `${visibleLabel} — ${occurrence.displayTitle}, ${buildOccurrenceDateTimeLabel(occurrence)}`;
}
export function buildOccurrenceErrorMessage(
  occurrence: ScheduleOccurrence,
  error: string,
): string {
  return `We could not complete this action for ${occurrence.displayTitle} on ${buildOccurrenceDateTimeLabel(occurrence)}. ${error} Review this class and try again.`;
}
export function getOccurrencePendingLabel(
  occurrence: ScheduleOccurrence,
): string {
  return occurrence.action === "book"
    ? "Booking…"
    : occurrence.action === "pay_and_book"
      ? "Starting checkout…"
      : occurrence.action === "join_waitlist"
        ? "Joining waitlist…"
        : occurrence.actionLabel;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="hl-class-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const elements = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="hl-icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="hl-class-dialog-body">{children}</div>
    </dialog>
  );
}
function Participant({ memberId, date }: { memberId: string; date: string }) {
  return (
    <>
      <input name="memberId" type="hidden" value={memberId} />
      <input name="returnDate" type="hidden" value={date} />
    </>
  );
}
function ErrorMessage({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  return message ? (
    <p ref={ref} tabIndex={-1} className="member-form-error" role="alert">
      {message}
    </p>
  ) : null;
}
function ClassFacts({
  item,
  name,
}: {
  item: ScheduleOccurrence | MemberBookingSummary | MemberWaitlistSummary;
  name: string;
}) {
  const locale = useWorkspaceLocale();
  const dateLabel = (date: string, short = false) =>
    formatScheduleDate(date, short, locale);
  return (
    <>
      <div className="hl-class-review-title">
        <h3>{item.displayTitle}</h3>
        <p>{item.roomName}</p>
      </div>
      <dl className="hl-class-facts">
        <div>
          <dt>Participant</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>
            {dateLabel(item.scheduledForDate)} · {item.timeLabel}
            {"endTimeLabel" in item && item.endTimeLabel
              ? `–${item.endTimeLabel}`
              : ""}
            {item.timezone ? ` · ${item.timezone}` : ""}
          </dd>
        </div>
        <div>
          <dt>Coach</dt>
          <dd>{item.coachName ?? "Coach to be confirmed"}</dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd>{item.programName}</dd>
        </div>
      </dl>
    </>
  );
}
function BookingReview({
  occurrence,
  memberId,
  memberName,
  onClose,
  onRefresh,
}: {
  occurrence: ScheduleOccurrence;
  memberId: string;
  memberName: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    createSelfBookingAction,
    emptyScheduleActionState,
  );
  return (
    <Modal
      title={
        occurrence.action === "join_waitlist"
          ? "Join waitlist"
          : "Review booking"
      }
      onClose={onClose}
    >
      <ClassFacts item={occurrence} name={memberName} />
      {occurrence.reviewedFunding?.funding.kind === "DROP_IN" ? (
        <p>
          {occurrence.fundingSourceName ?? "Drop-in"}:{" "}
          <Money
            amountMinor={occurrence.reviewedFunding.funding.amountCents}
            currency={occurrence.reviewedFunding.funding.currency}
          />
          .
        </p>
      ) : null}
      {occurrence.fundingNote ? (
        <Notice>{occurrence.fundingNote}</Notice>
      ) : null}
      <p>
        {occurrence.action === "join_waitlist"
          ? "Joining holds no place, allowance or class-pack unit. The earliest eligible person is automatically booked before both the booking and free-cancellation deadlines. Membership allowance is used first; a class-pack unit is used only with your permission below. No purchase or card charge is made."
          : occurrence.action === "pay_and_book"
            ? "Continue to secure payment for this drop-in. Your place is confirmed only when payment is verified."
            : occurrence.reviewedFunding?.funding.kind === "PUNCH_CARD"
              ? `This booking uses one unit from ${occurrence.fundingSourceName ?? "the reviewed class pack"}. Your gym’s cancellation rules apply.`
              : `This booking uses ${occurrence.fundingSourceName ?? occurrence.accessLabel?.toLowerCase() ?? "your class access"}. Your gym’s cancellation and allowance rules apply.`}
      </p>
      <form action={formAction} data-person-context>
        <Participant memberId={memberId} date={occurrence.scheduledForDate} />
        <input name="actionKind" type="hidden" value={occurrence.action} />
        {occurrence.action !== "join_waitlist" ? (
          <input
            name="reviewedFunding"
            type="hidden"
            value={
              occurrence.reviewedFunding
                ? JSON.stringify(occurrence.reviewedFunding)
                : ""
            }
          />
        ) : null}
        {occurrence.action === "join_waitlist" ? (
          <>
            <label className="member-checkbox-field">
              <input type="checkbox" name="autoPromotionOptIn" required />{" "}
              <span>
                I agree to automatic booking before{" "}
                {occurrence.autoPromotionDeadline ??
                  "the booking and free-cancellation deadlines"}{" "}
                ({occurrence.timezone}). Later rule changes cannot extend this
                deadline.
              </span>
            </label>
            <label className="member-checkbox-field">
              <input type="checkbox" name="allowPunchCardFunding" />{" "}
              <span>
                If my membership cannot fund the class, I authorize one eligible
                class-pack unit.
              </span>
            </label>
          </>
        ) : null}
        <input
          name="classTemplateId"
          type="hidden"
          value={occurrence.classTemplateId}
        />
        <input
          name="scheduledForDate"
          type="hidden"
          value={occurrence.scheduledForDate}
        />
        <ErrorMessage
          message={
            state.error
              ? buildOccurrenceErrorMessage(occurrence, state.error)
              : null
          }
        />
        <div className="hl-dialog-actions">
          <button
            type="button"
            className="member-button member-button-secondary"
            disabled={pending}
            onClick={onClose}
          >
            Go back
          </button>
          {state.reviewRequired ? (
            <button type="button" className="member-button" onClick={onRefresh}>
              Refresh booking choices
            </button>
          ) : null}
          <SubmitButton
            disabled={state.reviewRequired}
            pendingLabel={getOccurrencePendingLabel(occurrence)}
          >
            {occurrence.actionLabel}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
function BookingManager({
  booking,
  memberId,
  memberName,
  occurrences,
  canBook,
  canPay,
  onClose,
}: {
  booking: MemberBookingSummary;
  memberId: string;
  memberName: string;
  occurrences: ScheduleOccurrence[];
  canBook: boolean;
  canPay: boolean;
  onClose: () => void;
}) {
  const locale = useWorkspaceLocale();
  const dateLabel = (date: string, short = false) =>
    formatScheduleDate(date, short, locale);
  const router = useRouter();
  const [mode, setMode] = useState<"receipt" | "move" | "cancel">("receipt");
  const [paymentState, paymentAction] = useActionState(
    resumeBookingPaymentAction,
    emptyScheduleActionState,
  );
  const [cancelState, cancelAction] = useActionState(
    cancelSelfBookingAction,
    emptyBookingsActionState,
  );
  const [moveState, moveAction] = useActionState(
    moveSelfBookingAction,
    emptyBookingsActionState,
  );
  const [targetKey, setTargetKey] = useState("");
  const mutationId = useRef<string>("");
  useEffect(() => {
    mutationId.current = crypto.randomUUID();
  }, []);
  const targets = occurrences.filter(
    (item) =>
      item.bookingState === "AVAILABLE" &&
      (item.classTemplateId !== booking.classTemplateId ||
        item.scheduledForDate !== booking.scheduledForDate),
  );
  const target = targets.find(
    (item) => `${item.classTemplateId}:${item.scheduledForDate}` === targetKey,
  );
  return (
    <Modal
      title={
        mode === "move"
          ? "Move booking"
          : mode === "cancel"
            ? "Cancel booking"
            : "Booking details"
      }
      onClose={onClose}
    >
      <ClassFacts item={booking} name={memberName} />
      <div className="hl-class-receipt">
        <Badge tone={booking.status === "BOOKED" ? "success" : "neutral"}>
          {titleStatus(booking.status)}
        </Badge>
        <span>{titleStatus(booking.bookingType)}</span>
      </div>
      {booking.paymentRestrictionMessage ? (
        <Notice tone="warning">{booking.paymentRestrictionMessage}</Notice>
      ) : null}
      {booking.classCancelled ? (
        <Notice tone="warning">
          This class was cancelled. Contact your gym about your booking.
        </Notice>
      ) : null}
      {booking.status === "PENDING_PAYMENT" ? (
        <Notice
          tone="warning"
          actions={
            <>
              <button
                className="hl-text-link"
                type="button"
                onClick={() => router.refresh()}
              >
                Check booking status
              </button>
              {canPay ? (
                <form action={paymentAction} data-person-context>
                  <Participant
                    memberId={memberId}
                    date={booking.scheduledForDate}
                  />
                  <input
                    type="hidden"
                    name="bookingId"
                    value={booking.bookingId}
                  />
                  <SubmitButton pendingLabel="Checking payment…">
                    Continue payment
                  </SubmitButton>
                  <ErrorMessage message={paymentState.error} />
                </form>
              ) : null}
            </>
          }
        >
          Payment has not been confirmed. Your place is temporarily held; do not
          start another payment while its status is unknown.
        </Notice>
      ) : null}
      {mode === "receipt" ? (
        <>
          <p className="hl-booking-reference">
            Booking reference: {booking.bookingId}
          </p>
          <div className="hl-dialog-actions">
            {canBook &&
            booking.canCancel &&
            booking.status === "BOOKED" &&
            !booking.classCancelled ? (
              <button className="member-button" onClick={() => setMode("move")}>
                Move booking
              </button>
            ) : null}
            {canBook && booking.canCancel ? (
              <button
                className="member-button member-button-secondary"
                onClick={() => setMode("cancel")}
              >
                Cancel booking
              </button>
            ) : null}
            {canPay && booking.bookingType === "DROP_IN" ? (
              <Link className="hl-text-link" href="/app/billing">
                Payment history
              </Link>
            ) : null}
          </div>
          {!canBook ? (
            <p>
              You can view this booking. Your account does not have permission
              to change it.
            </p>
          ) : !booking.canCancel && booking.status === "BOOKED" ? (
            <p>
              The cancellation window is closed. Contact your gym if you need
              help.
            </p>
          ) : null}
        </>
      ) : null}
      {mode === "cancel" ? (
        <form action={cancelAction} data-person-context>
          <Participant memberId={memberId} date={booking.scheduledForDate} />
          <input name="bookingId" type="hidden" value={booking.bookingId} />
          <Notice tone="warning">
            {booking.lateCancellation
              ? "This is a late cancellation. Your gym's late-cancellation policy applies; a visit or charge may still count."
              : "This releases your place. Any credit follows your accepted plan and your gym's cancellation rules."}
            {booking.bookingType === "DROP_IN"
              ? " Cancelling a place does not issue a refund automatically."
              : ""}
          </Notice>
          <ErrorMessage message={cancelState.error} />
          <div className="hl-dialog-actions">
            <button
              type="button"
              className="member-button member-button-secondary"
              onClick={() => setMode("receipt")}
            >
              Keep booking
            </button>
            <SubmitButton pendingLabel="Cancelling…">
              Confirm cancellation
            </SubmitButton>
          </div>
        </form>
      ) : null}
      {mode === "move" ? (
        <form action={moveAction} data-person-context>
          <Participant memberId={memberId} date={booking.scheduledForDate} />
          <input name="bookingId" type="hidden" value={booking.bookingId} />
          <input name="mutationId" type="hidden" value={mutationId.current} />
          <input
            name="targetClassTemplateId"
            type="hidden"
            value={target?.classTemplateId ?? ""}
          />
          <input
            name="targetDate"
            type="hidden"
            value={target?.scheduledForDate ?? ""}
          />
          <label className="hl-field">
            Move to
            <select
              required
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
            >
              <option value="">Choose a class</option>
              {targets.map((item) => (
                <option
                  key={`${item.classTemplateId}:${item.scheduledForDate}`}
                  value={`${item.classTemplateId}:${item.scheduledForDate}`}
                >
                  {dateLabel(item.scheduledForDate, true)} · {item.timeLabel} ·{" "}
                  {item.displayTitle}
                </option>
              ))}
            </select>
          </label>
          {target ? <ClassFacts item={target} name={memberName} /> : null}
          <p>
            Your original place and funding stay in place unless the move
            succeeds. The new class must be eligible for the same funding;
            moving does not start a new payment.
          </p>
          {!targets.length ? (
            <p>
              No available classes can be offered right now. Keep this booking
              or contact your gym.
            </p>
          ) : null}
          <ErrorMessage message={moveState.error} />
          <div className="hl-dialog-actions">
            <button
              type="button"
              className="member-button member-button-secondary"
              onClick={() => setMode("receipt")}
            >
              Keep booking
            </button>
            <SubmitButton pendingLabel="Moving…" disabled={!target}>
              Confirm move
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
function WaitlistManager({
  entry,
  memberId,
  memberName,
  canBook,
  onClose,
}: {
  entry: MemberWaitlistSummary;
  memberId: string;
  memberName: string;
  canBook: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState(
    leaveSelfWaitlistAction,
    emptyBookingsActionState,
  );
  return (
    <Modal title="Waitlist details" onClose={onClose}>
      <ClassFacts item={entry} name={memberName} />
      <Notice>You are on the waitlist. This is not a confirmed place.</Notice>
      <p>
        {entry.autoPromotionOptedInAt
          ? "Automatic booking is enabled before both deadlines, subject to current eligibility and your funding permission."
          : "This older entry has no automatic-booking consent. Leave and rejoin to accept the current policy; no automatic booking will be made from this entry."}
      </p>
      {entry.lastSkipReason ? (
        <Notice tone="warning">
          Last promotion review: {entry.lastSkipReason}
        </Notice>
      ) : null}
      {canBook ? (
        <form action={action} data-person-context>
          <Participant memberId={memberId} date={entry.scheduledForDate} />
          <input
            name="waitlistEntryId"
            type="hidden"
            value={entry.waitlistEntryId}
          />
          <ErrorMessage message={state.error} />
          <div className="hl-dialog-actions">
            <SubmitButton pendingLabel="Leaving waitlist…">
              Leave waitlist
            </SubmitButton>
          </div>
        </form>
      ) : (
        <p>Your account has view-only access to this person&apos;s bookings.</p>
      )}
    </Modal>
  );
}

export function ScheduleList({
  occurrences,
  memberId,
  memberName,
  date,
  minDate,
  maxDate,
  today,
  program,
  bookingId,
  notice,
  upcoming,
  history,
  waitlist,
  allowance,
  canBook,
  canPay,
}: {
  occurrences: ScheduleOccurrence[];
  memberId: string;
  memberName: string;
  date: string;
  minDate: string;
  maxDate: string;
  today: string;
  program: string;
  bookingId?: string;
  notice?: string;
  upcoming: MemberBookingSummary[];
  history: MemberBookingSummary[];
  waitlist: MemberWaitlistSummary[];
  allowance: Allowance;
  canBook: boolean;
  canPay: boolean;
}) {
  const locale = useWorkspaceLocale();
  const dateLabel = (date: string, short = false) =>
    formatScheduleDate(date, short, locale);
  const router = useRouter(),
    setWorkspaceLoading = useWorkspaceLoading();
  const [pending, startTransition] = useTransition();
  const [review, setReview] = useState<ScheduleOccurrence | null>(null);
  const [manageId, setManageId] = useState<string | null>(bookingId ?? null),
    [waitlistId, setWaitlistId] = useState<string | null>(null);
  useEffect(() => {
    setWorkspaceLoading(pending);
    return () => setWorkspaceLoading(false);
  }, [pending, setWorkspaceLoading]);
  useEffect(() => {
    setManageId(bookingId ?? null);
    setReview(null);
    setWaitlistId(null);
  }, [bookingId, notice, date]);
  const programs = Array.from(
    new Map(
      occurrences.map((item) => [
        item.programId ?? item.programName,
        item.programName,
      ]),
    ).entries(),
  );
  const activeProgram = programs.some(([id]) => id === program) ? program : "";
  const visible = occurrences.filter(
    (item) =>
      item.scheduledForDate === date &&
      (!activeProgram ||
        (item.programId ?? item.programName) === activeProgram),
  );
  const managed = [...upcoming, ...history].find(
      (item) => item.bookingId === manageId,
    ),
    waiting = waitlist.find((item) => item.waitlistEntryId === waitlistId);
  const go = (
    nextDate: string,
    nextProgram = activeProgram,
    nextBooking?: string,
  ) => {
    const query = new URLSearchParams({ date: nextDate });
    if (nextProgram) query.set("program", nextProgram);
    if (nextBooking) query.set("booking", nextBooking);
    startTransition(() =>
      router.replace(`/app/schedule?${query}`, { scroll: false }),
    );
  };
  const weekStart = shifted(date, -new Date(`${date}T12:00:00Z`).getUTCDay());
  const noticeText =
    notice === "cancelled"
      ? "Booking cancelled."
      : notice === "moved"
        ? "Booking moved. Your new place is confirmed."
        : notice === "booked"
          ? "Your place is booked."
          : notice === "waitlisted"
            ? "You joined the waitlist."
            : notice === "left"
              ? "You left the waitlist."
              : null;
  return (
    <>
      {noticeText ? (
        <div role="status">
          <Notice tone="success">{noticeText}</Notice>
        </div>
      ) : null}
      {!canBook ? (
        <Notice>
          You can view this person&apos;s classes. Booking and cancellation
          permissions are managed by the gym.
        </Notice>
      ) : null}
      {allowance && !allowance.unlimited ? (
        <section
          className="member-card hl-allowance"
          aria-label="Class allowance"
        >
          <div className="hl-allowance-windows">
            {allowance.windows.map((window) => (
              <div key={window.kind}>
                <p>
                  <strong>
                    {window.kind === "WEEK" ? "Weekly" : "Billing month"}:{" "}
                    {window.remaining} remaining
                  </strong>
                  <span>
                    {" "}
                    · {window.reserved} reserved · {window.used} used
                  </span>
                </p>
                <p className="member-copy">Resets {dateLabel(window.endsOn)}</p>
              </div>
            ))}
          </div>
          <details>
            <summary>How classes count</summary>
            <p>
              Each class counts once.{" "}
              {allowance.countingMode === "ATTENDANCE"
                ? "Attendance uses your allowance; reservations hold a place against it."
                : "Reservations count against your allowance, and attendance does not count again."}{" "}
              {allowance.windows.length > 1
                ? "Both limits apply to each class; their balances are not added together."
                : ""}{" "}
              Your gym&apos;s cancellation policy controls whether a cancelled
              class is returned.
            </p>
          </details>
        </section>
      ) : null}
      <section
        className="member-card hl-class-browser"
        aria-label="Find a class"
      >
        <div className="hl-class-toolbar">
          <h2>Find a class</h2>
          <div className="hl-class-filters">
            <label>
              Date
              <input
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => {
                  if (e.target.value) go(e.target.value);
                }}
              />
            </label>
            <label>
              Program
              <select
                value={activeProgram}
                onChange={(e) => go(date, e.target.value)}
              >
                <option value="">All programs</option>
                {programs.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="hl-class-week-nav">
          <button
            type="button"
            className="hl-text-link"
            disabled={shifted(date, -7) < minDate}
            onClick={() => go(shifted(date, -7))}
          >
            Previous week
          </button>
          <button
            type="button"
            className="hl-text-link"
            onClick={() => go(today)}
          >
            Today
          </button>
          <button
            type="button"
            className="hl-text-link"
            disabled={shifted(date, 7) > maxDate}
            onClick={() => go(shifted(date, 7))}
          >
            Next week
          </button>
        </div>
        <div className="hl-class-days" aria-label="Choose a day">
          {Array.from({ length: 7 }, (_, index) =>
            shifted(weekStart, index),
          ).map((day) => (
            <button
              type="button"
              key={day}
              aria-pressed={day === date}
              disabled={day < minDate || day > maxDate}
              onClick={() => go(day)}
            >
              <span>
                {new Intl.DateTimeFormat(locale, {
                  timeZone: "UTC",
                  weekday: "short",
                }).format(new Date(`${day}T12:00:00Z`))}
              </span>
              <strong>{Number(day.slice(-2))}</strong>
              {day === today ? <span className="hl-sr-only">Today</span> : null}
            </button>
          ))}
        </div>
        <h3 className="hl-class-day-title">{dateLabel(date)}</h3>
        {visible.length ? (
          <div className="hl-class-rows">
            {visible.map((item) => (
              <article
                key={`${item.classTemplateId}:${item.scheduledForDate}`}
                className="hl-class-row"
              >
                <div className="hl-class-time">
                  <strong>{item.timeLabel}</strong>
                  {item.endTimeLabel ? <span>{item.endTimeLabel}</span> : null}
                </div>
                <div className="hl-class-name">
                  <h3>{item.displayTitle}</h3>
                  <p>{item.roomName}</p>
                  <span>{item.capacityLabel}</span>
                </div>
                <div className="hl-class-coach">
                  <span>Coach</span>
                  <strong>{item.coachName ?? "Coach to be confirmed"}</strong>
                </div>
                <div className="hl-class-row-action">
                  {item.bookingState !== "AVAILABLE" &&
                  item.bookingState !== "FULL" ? (
                    <Badge
                      tone={
                        item.bookingState === "BOOKED" ||
                        item.bookingState === "ATTENDED"
                          ? "success"
                          : "warning"
                      }
                    >
                      {titleStatus(item.bookingState)}
                    </Badge>
                  ) : null}
                  <button
                    type="button"
                    className={
                      item.bookingId || item.waitlistEntryId
                        ? "member-button member-button-secondary"
                        : "member-button"
                    }
                    aria-label={buildOccurrenceActionLabel(item)}
                    disabled={
                      pending ||
                      (!item.bookingId &&
                        !item.waitlistEntryId &&
                        (item.action === "none" ||
                          !canBook ||
                          (item.action === "pay_and_book" && !canPay)))
                    }
                    onClick={() =>
                      item.bookingId
                        ? setManageId(item.bookingId)
                        : item.waitlistEntryId
                          ? setWaitlistId(item.waitlistEntryId)
                          : setReview(item)
                    }
                  >
                    {item.actionLabel}
                  </button>
                </div>
                {item.note ? (
                  <p className="hl-class-row-note">{item.note}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="hl-class-empty">
            <h3>No {activeProgram ? "matching " : ""}classes for this day</h3>
            <p>
              {date < today
                ? "Your recent bookings are in attendance history below."
                : "Choose another day to find your next class."}
            </p>
            <div className="hl-inline-actions">
              {activeProgram ? (
                <button
                  className="hl-text-link"
                  type="button"
                  onClick={() => go(date, "")}
                >
                  Show all programs
                </button>
              ) : null}
              <button
                className="member-button member-button-secondary"
                type="button"
                disabled={date >= maxDate}
                onClick={() => go(shifted(date, 1), "")}
              >
                Browse next day
              </button>
              <Link href="/app/membership" className="hl-text-link">
                Check class access
              </Link>
            </div>
          </div>
        )}
      </section>
      <section className="member-card" aria-label="Upcoming bookings">
        <div className="hl-card-heading">
          <h2>Your upcoming classes</h2>
          <Badge>{upcoming.length + waitlist.length}</Badge>
        </div>
        {!upcoming.length && !waitlist.length ? (
          <div className="hl-class-empty">
            <p>
              You have no upcoming bookings. Choose a day above to book a class.
            </p>
            <button
              type="button"
              className="hl-text-link"
              onClick={() => go(today, "")}
            >
              Browse today&apos;s classes
            </button>
          </div>
        ) : (
          <div className="hl-booking-rows">
            {upcoming.map((item) => (
              <article key={item.bookingId}>
                <div>
                  <h3>{item.displayTitle}</h3>
                  <p>{item.roomName}</p>
                  <p>
                    {dateLabel(item.scheduledForDate, true)} · {item.timeLabel}
                  </p>
                  {!visible.some((row) => row.bookingId === item.bookingId) ? (
                    <button
                      className="hl-text-link"
                      type="button"
                      onClick={() =>
                        go(item.scheduledForDate, "", item.bookingId)
                      }
                    >
                      Show this class on{" "}
                      {dateLabel(item.scheduledForDate, true)}
                    </button>
                  ) : null}
                </div>
                <div>
                  <Badge
                    tone={item.status === "BOOKED" ? "success" : "warning"}
                  >
                    {titleStatus(item.status)}
                  </Badge>
                  <button
                    type="button"
                    className="member-button member-button-secondary"
                    aria-label={`Manage ${item.displayTitle} on ${dateLabel(item.scheduledForDate)}`}
                    disabled={pending}
                    onClick={() => setManageId(item.bookingId)}
                  >
                    Manage
                  </button>
                </div>
              </article>
            ))}
            {waitlist.map((item) => (
              <article key={item.waitlistEntryId}>
                <div>
                  <h3>{item.displayTitle}</h3>
                  <p>{item.roomName}</p>
                  <p>
                    {dateLabel(item.scheduledForDate, true)} · {item.timeLabel}
                  </p>
                </div>
                <div>
                  <Badge tone="warning">Waitlisted</Badge>
                  <button
                    type="button"
                    className="member-button member-button-secondary"
                    aria-label={`Manage waitlist for ${item.displayTitle} on ${dateLabel(item.scheduledForDate)}`}
                    disabled={pending}
                    onClick={() => setWaitlistId(item.waitlistEntryId)}
                  >
                    Manage
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <details className="member-card hl-class-history">
        <summary>
          Attendance and booking history <span>{history.length}</span>
        </summary>
        {history.length ? (
          <div className="hl-booking-rows">
            {history.map((item) => (
              <article key={item.bookingId}>
                <div>
                  <h3>{item.displayTitle}</h3>
                  <p>
                    {dateLabel(item.scheduledForDate, true)} · {item.timeLabel}
                  </p>
                </div>
                <div>
                  <Badge>{titleStatus(item.status)}</Badge>
                  {item.paymentRestrictionMessage ? (
                    <p>{item.paymentRestrictionMessage}</p>
                  ) : null}
                  <button
                    type="button"
                    className="hl-text-link"
                    disabled={pending}
                    onClick={() => setManageId(item.bookingId)}
                  >
                    Details
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No previous classes to show.</p>
        )}
      </details>
      {review ? (
        <BookingReview
          occurrence={review}
          memberId={memberId}
          memberName={memberName}
          onClose={() => setReview(null)}
          onRefresh={() => {
            setReview(null);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
      {managed ? (
        <BookingManager
          key={managed.bookingId}
          booking={managed}
          memberId={memberId}
          memberName={memberName}
          occurrences={occurrences}
          canBook={canBook}
          canPay={canPay}
          onClose={() => setManageId(null)}
        />
      ) : null}
      {waiting ? (
        <WaitlistManager
          entry={waiting}
          memberId={memberId}
          memberName={memberName}
          canBook={canBook}
          onClose={() => setWaitlistId(null)}
        />
      ) : null}
    </>
  );
}
