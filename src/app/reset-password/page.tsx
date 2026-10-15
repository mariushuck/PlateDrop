import Link from "next/link";
import ResetPasswordForm from "@/components/features/ResetPasswordForm";
import NavBar from "@/components/ui/NavBar";

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
    <div className="flex flex-1 flex-col">
      <NavBar>
        <Link href="/" className="text-[17px] font-semibold active:opacity-60">
          PlateDrop
        </Link>
      </NavBar>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-6 pb-8">
        <h1 className="large-title mb-6">Neues Passwort</h1>

        {!token || error ? (
          <div className="inset-group p-4 text-[15px]" role="alert">
            <p className="text-danger">
              Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.
            </p>
            <Link href="/forgot-password" className="btn-plain mt-3 inline-block">
              Neuen Link anfordern
            </Link>
          </div>
        ) : (
          <ResetPasswordForm token={token} />
        )}
      </main>
    </div>
  );
}
