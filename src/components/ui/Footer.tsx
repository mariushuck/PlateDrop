import Link from "next/link";

export default function Footer() {
  return (
    <footer className="px-4 pt-8 pb-10 text-center text-[13px] text-secondary print:hidden">
      <nav className="flex justify-center gap-5">
        <Link href="/impressum" className="active:opacity-60">
          Impressum
        </Link>
        <Link href="/datenschutz" className="active:opacity-60">
          Datenschutz
        </Link>
        <Link href="/betreiber" className="active:opacity-60">
          Für Betreiber
        </Link>
      </nav>
      <p className="mt-3">© 2026 PlateDrop</p>
    </footer>
  );
}
