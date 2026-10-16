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
