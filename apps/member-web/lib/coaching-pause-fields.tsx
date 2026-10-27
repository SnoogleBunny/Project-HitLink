"use client";
import { useState } from "react";
import { formatDisplayDate, useWorkspaceLocale } from "@flowstate/ui";
export function CoachingPauseFields({
  endDate,
  weekdays,
  appointments,
}: {
  endDate: string;
  weekdays: number[];
  appointments: Array<{ date: string; label: string }>;
}) {
  const locale = useWorkspaceLocale();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  let count = 0;
  if (start && end && end >= start) {
    const first = new Date(`${start}T00:00:00Z`),
      last = new Date(`${end}T00:00:00Z`);
    if ((last.getTime() - first.getTime()) / 86400000 < 3660)
      for (
        let date = first;
        date <= last;
        date = new Date(date.getTime() + 86400000)
      )
        if (weekdays.includes(date.getUTCDay())) count++;
  }
  const adjusted = new Date(
    new Date(`${endDate}T00:00:00Z`).getTime() + count * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const affected = appointments.filter(
    (item) => item.date >= start && item.date <= end,
  );
  return (
    <>
      <label className="field">
        <span>Pause starts</span>
        <input
          type="date"
          name="startsOn"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>Pause ends (inclusive)</span>
        <input
          type="date"
          name="endsOn"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          required
        />
      </label>
      <div aria-live="polite">
        <p>
          {count} delivery days paused. New program end:{" "}
          {formatDisplayDate(
            `${adjusted}T00:00:00Z`,
            { dateStyle: "medium" },
            locale,
          )}
          .
        </p>
        <p>
          {affected.length} booked appointment{affected.length === 1 ? "" : "s"}{" "}
          will be cancelled with units returned. Your gym membership is
          unchanged.
        </p>
        {affected.length ? (
          <ul>
            {affected.map((item) => (
              <li key={item.label}>{item.label}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <label>
        <input type="checkbox" name="confirmConsequences" required /> I agree to
        these dates and appointment changes.
      </label>
    </>
  );
}
