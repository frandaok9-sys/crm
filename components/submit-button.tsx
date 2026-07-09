"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

/**
 * Submit button that disables itself while its parent <form> action is
 * running — prevents accidental double submissions (e.g. duplicate quote
 * revisions from rapid clicks).
 */
export function SubmitButton({
  children,
  pendingText = "Procesando…",
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
