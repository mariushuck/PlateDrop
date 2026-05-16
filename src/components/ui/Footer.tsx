import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      <div className="flex flex-col items-center gap-3">
        <p className="font-medium">Anonym. Schnell. Sicher.</p>

        <div className="flex gap-4">
          <Link
            href="/impressum"
            className="hover:text-slate-900 transition-colors dark:hover:text-slate-200"
          >
            Impressum
          </Link>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <Link
            href="/datenschutz"
            className="hover:text-slate-900 transition-colors dark:hover:text-slate-200"
          >
            Datenschutz
          </Link>
        </div>

        <p className="text-slate-500 dark:text-slate-500">
          © 2026 PlateDrop. Built with Next.js.
        </p>
      </div>
    </footer>
  );
}
