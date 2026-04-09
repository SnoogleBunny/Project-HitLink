"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel: string;
  disabled?: boolean;
}

export function SubmitButton({
  children,
  pendingLabel,
  disabled = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className="member-button" disabled={pending || disabled} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}
