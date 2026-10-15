import { Building2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/ui/NavBar";
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
    <div className="flex flex-1 flex-col">
      <NavBar width="max-w-3xl">
        <div className="flex min-w-0 items-center gap-2">
          <Building2 size={18} className="shrink-0 text-secondary" aria-hidden="true" />
          <span className="truncate text-[17px] font-semibold">{org.name}</span>
        </div>
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-0.5 text-[17px] text-tint active:opacity-60"
        >
          <ChevronLeft size={22} aria-hidden="true" />
          Dashboard
        </Link>
      </NavBar>
      <main className="flex-1">{children}</main>
    </div>
  );
}
