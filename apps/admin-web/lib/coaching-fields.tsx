import type { ReactNode } from "react";
export function CoachingField({
  label,
  name,
  type = "text",
  value,
  required = true,
  children,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children ? (
        <select name={name} required={required} defaultValue={value}>
          {children}
        </select>
      ) : type === "textarea" ? (
        <textarea
          name={name}
          required={required}
          defaultValue={value}
          rows={5}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={value}
        />
      )}
    </label>
  );
}
export function ProgramFields() {
  return (
    <>
      <CoachingField
        label="Duration in calendar days"
        name="durationDays"
        type="number"
        value={28}
      />
      <CoachingField
        label="Note delivery weekdays (0 Sunday, 1 Monday … 6 Saturday)"
        name="deliveryWeekdays"
        value="1,2,3,4,5"
      />
      <CoachingField
        label="Reply window in hours"
        name="responseHours"
        type="number"
        value={48}
      />
      <CoachingField label="Program goals" name="goals" type="textarea" />
      <CoachingField
        label="Milestones (one per line)"
        name="milestones"
        type="textarea"
      />
      <CoachingField
        label="Included appointments (0 for notes only)"
        name="appointmentUnits"
        type="number"
        value={0}
      />
      <CoachingField
        label="Appointment length in minutes"
        name="appointmentMinutes"
        type="number"
        value={60}
      />
      <CoachingField
        label="Appointment cancellation notice in hours"
        name="cancellationHours"
        type="number"
        value={24}
      />
      <CoachingField
        label="Upfront price in cents (for example, 15000 = 150.00)"
        name="priceCents"
        type="number"
      />
      <CoachingField label="Currency" name="currency" value="CAD" />
      <CoachingField
        label="Exit, refund, pause and delivery terms"
        name="terms"
        type="textarea"
      />
      <CoachingField
        label="Record retrieval window after closure in days"
        name="retrievalDays"
        type="number"
        value={90}
      />
    </>
  );
}
export const coachingLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
export const coachingDay = (value: Date) => value.toISOString().slice(0, 10);
export const coachingTime = (value: Date, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
