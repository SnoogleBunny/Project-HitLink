import {
  addDays,
  getMembershipAllowanceSummary,
  getWorkspaceDateString,
  parseDateOnlyString,
} from "@flowstate/db";
import { Notice, resolveDisplayLocale } from "@flowstate/ui";
import Link from "next/link";
import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import {
  listEligibleSelfServiceOccurrences,
  listMemberBookings,
} from "../../../lib/self-service-bookings";
import { getMemberFormsPageData } from "../../../lib/forms";
import { getCurrentMemberMembershipContext } from "../../../lib/member-membership";
import { ScheduleList } from "./schedule-list";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireMemberPortalContext();
  const locale = resolveDisplayLocale(context.workspace.settings?.locale);
  const query = await searchParams;
  const today = getWorkspaceDateString(new Date(), context.location.timezone);
  const [bookings, forms, membership] = await Promise.all([
    listMemberBookings({
      locale,
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      timezone: context.location.timezone,
    }),
    getMemberFormsPageData({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      guardianId: context.permissions?.guardianId,
      canSign: context.permissions?.canSign,
    }),
    getCurrentMemberMembershipContext({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
    }),
  ]);
  const requestedBooking = [...bookings.upcoming, ...bookings.history].find(
    (item) => item.bookingId === query.booking,
  );
  const normalMin = addDays(today, -30),
    normalMax = addDays(today, 55);
  const minDate =
    requestedBooking && requestedBooking.scheduledForDate < normalMin
      ? requestedBooking.scheduledForDate
      : normalMin;
  const maxDate =
    requestedBooking && requestedBooking.scheduledForDate > normalMax
      ? requestedBooking.scheduledForDate
      : normalMax;
  const requestedDate =
    typeof query.date === "string"
      ? query.date
      : (requestedBooking?.scheduledForDate ?? today);
  const date =
    parseDateOnlyString(requestedDate).status !== "error" &&
    requestedDate >= minDate &&
    requestedDate <= maxDate
      ? requestedDate
      : today;
  const outsideWindow = date < normalMin || date > normalMax;
  const [schedule, allowance] = await Promise.all([
    listEligibleSelfServiceOccurrences({
      locale,
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      timezone: context.location.timezone,
      fromDate: outsideWindow ? date : minDate,
      toDate: outsideWindow ? addDays(date, 7) : maxDate,
    }),
    getMembershipAllowanceSummary({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      scheduledForDate: date,
      timezone: context.location.timezone,
    }),
  ]);
  const unsigned = forms.items.filter(
    (item) => item.status !== "SIGNED",
  ).length;
  const billingNeedsAttention =
    membership?.billingState &&
    [
      "PENDING_PAYMENT_METHOD",
      "PAST_DUE",
      "PAYMENT_FAILED",
      "ACTION_REQUIRED",
    ].includes(membership.billingState.status);
  const notice =
    (query.notice === "booked" || query.notice === "moved") &&
    requestedBooking?.status === "BOOKED"
      ? query.notice
      : query.notice === "cancelled" &&
          bookings.history.some(
            (item) =>
              item.status === "CANCELLED" && item.scheduledForDate === date,
          )
        ? "cancelled"
        : query.notice === "waitlisted" &&
            bookings.waitlist.some((item) => item.scheduledForDate === date)
          ? "waitlisted"
          : undefined;
  return (
    <MemberShell
      context={context}
      title="Classes"
      description="Book your next class and manage your places."
    >
      {unsigned ? (
        <Notice
          tone="warning"
          actions={
            <Link className="hl-text-link" href="/app/forms">
              Review forms
            </Link>
          }
        >
          {unsigned} required {unsigned === 1 ? "form needs" : "forms need"}{" "}
          attention before your next class.
        </Notice>
      ) : null}
      {billingNeedsAttention ? (
        <Notice
          tone="warning"
          actions={
            <Link className="hl-text-link" href="/app/membership">
              Review membership
            </Link>
          }
        >
          This membership has an unresolved payment or payment setup step. Class
          packs and coaching keep their own status; each booking checks the
          selected product and participant.
        </Notice>
      ) : null}
      <ScheduleList
        key={context.member.id}
        occurrences={schedule.occurrences}
        memberId={context.member.id}
        memberName={context.member.fullName}
        date={date}
        minDate={minDate}
        maxDate={maxDate}
        today={today}
        program={typeof query.program === "string" ? query.program : ""}
        bookingId={requestedBooking?.bookingId}
        notice={notice}
        upcoming={bookings.upcoming}
        history={bookings.history}
        waitlist={bookings.waitlist}
        allowance={allowance}
        canBook={context.permissions?.canBook !== false}
        canPay={context.permissions?.canPay !== false}
      />
    </MemberShell>
  );
}
