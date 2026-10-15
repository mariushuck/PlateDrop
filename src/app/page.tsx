import Link from "next/link";
import MessageForm from "@/components/features/MessageForm";
import NavBar from "@/components/ui/NavBar";
import { dropMessage } from "./actions";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <NavBar>
        <span className="text-[17px] font-semibold">PlateDrop</span>
        <Link href="/login" className="btn-plain text-[17px] active:opacity-60">
          Anmelden
        </Link>
      </NavBar>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-6 pb-8">
        <h1 className="large-title">Nachricht hinterlassen</h1>
        <p className="mt-1 mb-6 text-[17px] text-secondary">
          Anonym, an jedes deutsche Kennzeichen.
        </p>
        <MessageForm action={dropMessage} />
      </main>
    </div>
  );
}
