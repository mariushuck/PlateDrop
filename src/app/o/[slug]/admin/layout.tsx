import { ArrowLeft, Building2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { orgForAdmin } from "@/lib/db/queries";

/** Verwaltungsbereich einer Organisation – nur für ihre Org-Admins. */
export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const org = await orgForAdmin(user.id, slug);
  // 404 statt 403: verrät nicht, ob es die Organisation gibt.
  if (!org) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm print:hidden dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-slate-600 dark:text-slate-300" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{org.name}</h1>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              VERWALTUNG
            </span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400"
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
