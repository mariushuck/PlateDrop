import Link from "next/link";
import MessageForm from "@/components/features/MessageForm";
import { dropMessage } from "./actions";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-linear-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="relative flex flex-col items-center gap-1 px-4 py-6">
          <Link
            href="/login"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            Anmelden
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PlateDrop</h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Hinterlasse anonym eine Nachricht für jeden
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col px-4 py-8">
        <MessageForm action={dropMessage} />
      </main>
    </div>
  );
}
