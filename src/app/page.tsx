"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MESSAGE_TYPES } from "@/lib/messages/catalog";
import { parsePlate, plateErrorMessage } from "@/lib/utils/plateUtils";
import { dropMessage } from "./actions";

export default function Home() {
  const [state, formAction, isPending] = useActionState(dropMessage, null);
  const [plateInput, setPlateInput] = useState("");
  const [messageType, setMessageType] = useState("");
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Compute plate error synchronously (no effect needed)
  const parsedPlate = parsePlate(plateInput);
  const plateError =
    plateInput.trim() && !parsedPlate.ok ? plateErrorMessage(parsedPlate.reason) : "";

  // Handle success/error with toast notifications
  useEffect(() => {
    if (state?.success) {
      toast.success("Nachricht erfolgreich gedroppt! 🚗💨");
      startTransition(() => {
        setPlateInput("");
        setMessageType("");
        formRef.current?.reset();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const isFormValid = plateInput.trim() && !plateError && messageType;

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
        <form ref={formRef} action={formAction} className="flex flex-1 flex-col gap-6">
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

            {plateError && <p className="text-sm text-red-600 dark:text-red-400">{plateError}</p>}

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deutsche Kennzeichen im Format KA-AB-1234
            </p>
          </div>

          {/* Message Type Selection */}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
              Was ist los?
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MESSAGE_TYPES.map((type) => (
                <label
                  key={type.code}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                    messageType === type.code
                      ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                      : "border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="messageType"
                    value={type.code}
                    checked={messageType === type.code}
                    onChange={() => setMessageType(type.code)}
                    disabled={isPending}
                    className="sr-only"
                  />
                  {type.label}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            Tier oder Kind im heißen oder kalten Auto, Unfall oder Gefahr? Bitte sofort{" "}
            <a href="tel:110" className="font-semibold underline">
              110
            </a>{" "}
            oder{" "}
            <a href="tel:112" className="font-semibold underline">
              112
            </a>{" "}
            anrufen. PlateDrop ist kein Notrufkanal.
          </p>

          {/* Error Display */}
          {state?.error && (
            <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">{state.error}</p>
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
    </div>
  );
}
