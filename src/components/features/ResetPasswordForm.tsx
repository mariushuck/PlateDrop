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
      <p className="inset-group p-4 text-[15px] text-success" role="status">
        Passwort aktualisiert. Du wirst zum Login weitergeleitet…
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="inset-group flex flex-col gap-4 p-4">
        <div>
          <label htmlFor="password" className="field-label">
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
            className="field"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">
            Passwort bestätigen
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            disabled={pending}
            className="field"
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="px-1 text-[15px] text-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Wird gespeichert…" : "Passwort speichern"}
      </button>
    </form>
  );
}
