"use client";

import { LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    label: "Übersicht",
    isActive: (pathname) => pathname === "/dashboard",
  },
  {
    href: "/dashboard/settings",
    icon: Settings,
    label: "Einstellungen",
    isActive: (pathname) => pathname.startsWith("/dashboard/settings"),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      data-tabbar
      className="bar fixed inset-x-0 bottom-0 z-50 border-t-[0.5px] border-separator pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <div className="mx-auto flex max-w-xl">
        {navItems.map(({ href, icon: Icon, label, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 active:opacity-60 ${
                active ? "text-tint" : "text-secondary"
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
