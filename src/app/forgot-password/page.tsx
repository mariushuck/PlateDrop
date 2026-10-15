"use client";

import Link from "next/link";
import { useActionState } from "react";
import NavBar from "@/components/ui/NavBar";
import { requestPasswordReset } from "./actions";

const initialState = { error: null as string | null, success: false };

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar>
        <Link href="/login" className="btn-plain text-[17px] active:opacity-60">
          Zurück zum Login
        </Link>
      </NavBar>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-6 pb-8">
        <h1 className="large-title">Passwort vergessen?</h1>
        <p className="mt-1 mb-6 text-[17px] text-secondary">
          Wir senden dir einen Link zum Zurücksetzen deines Passworts.
        </p>

        {state.success ? (
          <p className="inset-group p-4 text-[15px]" role="status">
            Falls diese E-Mail-Adresse registriert ist, erhältst du in Kürze eine E-Mail mit einem
            Link.
          </p>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <div className="inset-group p-4">
              <label htmlFor="email" className="field-label">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@example.com"
                disabled={pending}
                className="field"
              />
            </div>
            {state.error && (
              <p role="alert" className="px-1 text-[15px] text-danger">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn btn-primary w-full">
              {pending ? "Wird gesendet…" : "Link senden"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
