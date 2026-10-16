"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

interface SubmitButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type"
> {
  pendingLabel: string;
  disabled?: boolean;
}

export function SubmitButton({
  children,
  pendingLabel,
  disabled = false,
  className = "button",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      className={className}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
