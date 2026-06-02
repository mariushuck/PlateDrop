"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value;

    if (password !== confirm) { setError("Passwörter stimmen nicht überein."); return; }
    if (password.length < 6) { setError("Passwort muss mindestens 6 Zeichen haben."); return; }

    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (error) { setError("Fehler beim Aktualisieren des Passworts."); return; }
    setSuccess(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col bg-linear-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
        <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col items-center gap-1 px-4 py-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PlateDrop</h1>
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Link wird überprüft…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-1 px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PlateDrop</h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Neues Passwort setzen
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-white">
            Neues Passwort setzen
          </h2>

          {success ? (
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Passwort aktualisiert. Du wirst zum Login weitergeleitet…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
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
                  minLength={6}
                  placeholder="Mindestens 6 Zeichen"
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
          )}
        </div>
      </main>
    </div>
  );
}
