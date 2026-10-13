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
        <p className="text-sm text-red-800 dark:text-red-200" role="alert">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-sm text-green-800 dark:text-green-200">Gespeichert.</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400 dark:bg-white dark:text-slate-900"
      >
        {pending ? "Wird gespeichert..." : submitLabel}
      </button>
    </form>
  );
}
