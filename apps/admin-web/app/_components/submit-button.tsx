"use client";

import {
  SubmitButton as SharedSubmitButton,
  type SubmitButtonProps,
} from "@flowstate/ui";

export function SubmitButton({
  className = "button",
  ...props
}: SubmitButtonProps) {
  return <SharedSubmitButton {...props} className={className} />;
}
