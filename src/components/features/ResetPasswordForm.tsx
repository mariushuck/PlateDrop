"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { resetPassword } from "@/app/reset-password/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";

const initialState = { error: null as string | null, success: false };

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(resetPassword, initialState);

  useEffect(() => {
    if (!state.success) return;
    const timer = setTimeout(() => router.push("/login"), 2000);
    return () => clearTimeout(timer);
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          Passwort aktualisiert. Du wirst zum Login weitergeleitet…
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">{state.error}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-semibold text-slate-900 dark:text-white">
          Neues Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
          autoComplete="new-password"
          disabled={pending}
          className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="confirm" className="text-sm font-semibold text-slate-900 dark:text-white">
          Passwort bestätigen
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          disabled={pending}
          className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-6 py-2 font-semibold text-white transition-all disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-400"
      >
        {pending ? "Wird gespeichert…" : "Passwort speichern"}
      </button>
    </form>
  );
}
