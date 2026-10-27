import type { CoachingPresale } from "@flowstate/db";
import { coachingTime } from "../../../lib/coaching-fields";
export function CoachingBookingAvailability({
  data,
  units,
  minutes,
  locale,
}: {
  data: CoachingPresale | null;
  units: number;
  minutes: number;
  locale: string;
}) {
  if (units === 0) return null;
  return (
    <section className="member-card">
      <h2>Appointment availability before purchase</h2>
      <p>
        Your program includes {units} appointments of {minutes} minutes.
        Displayed times are not held and can change before you book.
      </p>
      {!data || !data.configured ? (
        <p role="status">
          {data?.message ??
            "The gym must confirm appointment delivery and booking-help details before a new purchase."}
        </p>
      ) : (
        <>
          {data.message ? <p role="status">{data.message}</p> : null}
          {data.slots.length ? (
            <>
              <p>Currently matching times:</p>
              <ul>
                {data.slots.map((slot) => (
                  <li key={slot.id}>
                    {coachingTime(slot.startsAt, slot.timezone, locale)} –{" "}
                    {coachingTime(slot.endsAt, slot.timezone, locale)} ·{" "}
                    {slot.room?.name ?? "Online appointment"}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              No matching appointment time is currently available for these
              program dates. Contact the booking-help owner to review booking,
              an extension or a refund. A review is not a confirmed refund.
            </p>
          )}
          {data.notOpenCount > 0 ? (
            <p>
              {data.notOpenCount} matching{" "}
              {data.notOpenCount === 1 ? "time is" : "times are"} not open for
              booking yet.
            </p>
          ) : null}
          {data.caseOwnerName && data.resolutionResponseHours ? (
            <p>
              {data.caseOwnerName} handles booking, extension or refund reviews
              and replies within {data.resolutionResponseHours} hours. This is
              the booking-help response window; your coach’s general reply
              promise remains separate.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
