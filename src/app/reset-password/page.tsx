import ResetPasswordForm from "@/components/features/ResetPasswordForm";

/**
 * Unter Supabase stellte der Link aus der E-Mail eine Session her, und die
 * Seite wartete clientseitig auf ein `PASSWORD_RECOVERY`-Event. better-auth
 * arbeitet stattdessen mit einem Einmal-Token, das als Query-Parameter
 * ankommt — ganz ohne Session und ohne Client-SDK.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

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

          {!token || error ? (
            <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.
              </p>
            </div>
          ) : (
            <ResetPasswordForm token={token} />
          )}
        </div>
      </main>
    </div>
  );
}
