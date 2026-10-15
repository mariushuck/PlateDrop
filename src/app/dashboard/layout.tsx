import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { BottomNav } from "@/components/ui/BottomNav";
import NavBar from "@/components/ui/NavBar";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <NavBar>
        <span className="text-[17px] font-semibold">PlateDrop</span>
        <div className="flex items-center gap-5">
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1 text-[17px] text-tint active:opacity-60"
            >
              <ShieldAlert size={18} aria-hidden="true" />
              Admin
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className="text-[17px] text-danger active:opacity-60">
              Abmelden
            </button>
          </form>
        </div>
      </NavBar>

      <main className="flex-1">{children}</main>

      <BottomNav />
    </div>
  );
}
