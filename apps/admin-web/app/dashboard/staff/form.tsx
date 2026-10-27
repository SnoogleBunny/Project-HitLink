"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Button, Notice, useWorkspaceLocale } from "@flowstate/ui";
import { staffLeaveAction } from "./actions";
export function StaffLeaveForm({
  children,
  label,
  timezone,
}: {
  children: ReactNode;
  label: string;
  timezone: string;
}) {
  const locale = useWorkspaceLocale();
  const [state, action, pending] = useActionState(staffLeaveAction, {
    error: null,
    success: null,
    conflicts: [],
  });
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);
  useEffect(() => {
    if (!state.error || !formRef.current || !submitted.current) return;
    for (const element of Array.from(formRef.current.elements)) {
      if (
        (element instanceof HTMLInputElement && element.type !== "hidden") ||
        element instanceof HTMLSelectElement
      ) {
        const value = submitted.current.get(element.name);
        if (typeof value === "string") element.value = value;
      }
    }
  }, [state]);
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        submitted.current = new FormData(event.currentTarget);
      }}
      className="form-stack"
    >
      {children}
      <div>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? "Checking schedule…" : label}
        </Button>
      </div>
      {state.error ? (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      ) : null}
      {state.conflicts.length ? (
        <ul className="form-stack" aria-label="Leave conflicts">
          {state.conflicts.map((item, index) => (
            <li key={`${item.kind}:${item.startsAt}:${index}`}>
              <Link className="text-link" href={item.href}>
                {item.label}
              </Link>
              <p>
                {format(item.startsAt)} – {format(item.endsAt)} ({timezone})
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {state.success ? (
        <Notice tone="success" role="status">
          {state.success}
        </Notice>
      ) : null}
    </form>
  );
}
