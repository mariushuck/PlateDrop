"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MESSAGE_TYPES } from "@/lib/messages/catalog";
import { parsePlate, plateErrorMessage } from "@/lib/utils/plateUtils";

type ActionState = { success: boolean; error?: string } | null;

const MAX_TEXT = 500;

/**
 * Formular „Kennzeichen + Nachricht“ – auf der Startseite (öffentlich) und am
 * Standort-QR (/s/[token]). Freitext gibt es nur, wenn `allowFreeText` gesetzt
 * ist (angemeldetes Mitglied, Organisation erlaubt es); die Server Action und
 * die Policy prüfen das noch einmal.
 */
export default function MessageForm({
  action,
  hiddenFields,
  allowFreeText = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields?: Record<string, string>;
  allowFreeText?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [plateInput, setPlateInput] = useState("");
  const [messageType, setMessageType] = useState("");
  const [messageText, setMessageText] = useState("");
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const parsedPlate = parsePlate(plateInput);
  const plateError =
    plateInput.trim() && !parsedPlate.ok ? plateErrorMessage(parsedPlate.reason) : "";

  useEffect(() => {
    if (state?.success) {
      toast.success("Nachricht erfolgreich gedroppt! 🚗💨");
      startTransition(() => {
        setPlateInput("");
        setMessageType("");
        setMessageText("");
        formRef.current?.reset();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const isFormValid = plateInput.trim() && !plateError && (messageType || messageText.trim());

  return (
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

      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

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

      {allowFreeText && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="messageText"
            className="text-sm font-semibold text-slate-900 dark:text-white"
          >
            Oder eigene Nachricht
          </label>
          <textarea
            id="messageText"
            name="messageText"
            rows={3}
            maxLength={MAX_TEXT}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            disabled={isPending}
            placeholder="Nur für angemeldete Mitglieder dieses Geländes"
            className="w-full rounded-lg border-2 border-slate-300 bg-white p-3 text-slate-900 placeholder-slate-400 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
          />
        </div>
      )}

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
  );
}
