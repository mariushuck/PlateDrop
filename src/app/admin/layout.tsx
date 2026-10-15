import { ChevronLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import NavBar from "@/components/ui/NavBar";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Leitet ohne Anmeldung nach /login um, ohne Admin-Recht nach /dashboard.
  await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <NavBar width="max-w-5xl">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-semibold">PlateDrop</span>
          <span className="flex items-center gap-1 rounded-full bg-fill px-2.5 py-0.5 text-[13px] font-semibold text-danger">
            <ShieldAlert size={14} aria-hidden="true" />
            Admin
          </span>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-0.5 text-[17px] text-tint active:opacity-60"
        >
          <ChevronLeft size={22} aria-hidden="true" />
          Dashboard
        </Link>
      </NavBar>
      <main className="flex-1">{children}</main>
    </div>
  );
}
