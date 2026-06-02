import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profileData?.is_admin) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <header className="border-b border-red-200 bg-white shadow-sm dark:border-red-900/50 dark:bg-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-red-600 dark:text-red-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">PlateDrop</h1>
            <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-400">
              ADMIN
            </span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft size={15} />
            Dashboard
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
