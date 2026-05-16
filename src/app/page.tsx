"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { dropMessage } from "./actions";
import { validateGermanPlate } from "@/lib/utils/plateUtils";
import { CheckCircle2 } from "lucide-react";

const MAX_MESSAGE_LENGTH = 500;

export default function Home() {
  const [state, formAction, isPending] = useActionState(dropMessage, null);
  const [plateInput, setPlateInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [plateError, setPlateError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Client-side plate validation feedback
  useEffect(() => {
    if (!plateInput.trim()) {
      setPlateError("");
      return;
    }

    if (!validateGermanPlate(plateInput)) {
      setPlateError("Ungültiges Kennzeichen (z.B. KA-AB-1234)");
    } else {
      setPlateError("");
    }
  }, [plateInput]);

  // Reset form on success
  useEffect(() => {
    if (state?.success) {
      setShowSuccess(true);
      setPlateInput("");
      setMessageInput("");
      formRef.current?.reset();

      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [state?.success]);

  const isFormValid =
    plateInput.trim() &&
    !plateError &&
    messageInput.trim() &&
    messageInput.length <= MAX_MESSAGE_LENGTH;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-1 px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            PlateDrop
          </h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Hinterlasse anonym eine Nachricht für jeden
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col px-4 py-8">
        {showSuccess && (
          <div className="mb-6 flex items-center gap-3 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Nachricht erfolgreich gesendet! 🎉
            </p>
          </div>
        )}

        <form
          ref={formRef}
          action={formAction}
          className="flex flex-1 flex-col gap-6"
        >
          {/* License Plate Input */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="plateNumber"
              className="text-sm font-semibold text-slate-900 dark:text-white"
            >
              Kennzeichen
            </label>

            <div className="relative">
              <input
                id="plateNumber"
                name="plateNumber"
                type="text"
                placeholder="z.B. KA-AB-1234"
                value={plateInput}
                onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                disabled={isPending}
                className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 font-mono text-lg font-bold uppercase tracking-widest text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />

              {plateInput && !plateError && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 dark:text-green-400">
                  ✓
                </div>
              )}
            </div>

            {plateError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {plateError}
              </p>
            )}

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deutsche Kennzeichen im Format KA-AB-1234
            </p>
          </div>

          {/* Message Textarea */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="messageText"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
                Nachricht
              </label>

              <span
                className={`text-xs font-medium ${
                  messageInput.length > MAX_MESSAGE_LENGTH
                    ? "text-red-600 dark:text-red-400"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {messageInput.length} / {MAX_MESSAGE_LENGTH}
              </span>
            </div>

            <textarea
              id="messageText"
              name="messageText"
              placeholder="Schreibe deine anonyme Nachricht hier..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              disabled={isPending}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={6}
              className="w-full flex-1 rounded-lg border-2 border-slate-300 bg-white p-4 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
            />

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bleibe respektvoll und konstruktiv
            </p>
          </div>

          {/* Error Display */}
          {state?.error && (
            <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {state.error}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isPending || !isFormValid}
            className="rounded-lg bg-slate-900 px-6 py-4 font-semibold text-white transition-all disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-400"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Wird gesendet...
              </span>
            ) : (
              "Nachricht senden"
            )}
          </button>
        </form>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        <p>Anonym. Schnell. Sicher.</p>
      </footer>
    </div>
  );
}
