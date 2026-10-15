"use client";

import { useActionState } from "react";

type Result = { success: boolean; error?: string } | null;

/**
 * Kleines Formular für eine Server Action mit `useActionState`. Die Felder
 * kommen als `children` vom Server Component.
 */
export default function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: Result, formData: FormData) => Promise<Result>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <fieldset disabled={pending} className="flex flex-col gap-3">
        {children}
      </fieldset>
      {state?.error && (
        <p className="text-[15px] text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-[15px] text-success">Gespeichert.</p>}
      <button type="submit" disabled={pending} className="btn btn-sm btn-primary self-start">
        {pending ? "Wird gespeichert..." : submitLabel}
      </button>
    </form>
  );
}
