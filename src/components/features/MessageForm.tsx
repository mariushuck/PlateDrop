"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageTypeIcon } from "@/components/ui/MessageTypeIcon";
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
    <form ref={formRef} action={formAction} className="flex flex-1 flex-col gap-7">
      <div>
        <label htmlFor="plateNumber" className="section-header">
          Kennzeichen
        </label>
        <div className="plate-field">
          <input
            id="plateNumber"
            name="plateNumber"
            type="text"
            placeholder="KA-AB-1234"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={plateInput}
            onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
            disabled={isPending}
          />
          {plateInput && !plateError && (
            // The plate stays white in dark mode, so the check keeps the light-mode green.
            <Check className="mr-3 shrink-0 self-center text-[#248a3d]" size={26} strokeWidth={3} />
          )}
        </div>
        {plateError ? (
          <p className="section-footer text-danger">{plateError}</p>
        ) : (
          <p className="section-footer">Deutsche Kennzeichen im Format KA-AB-1234</p>
        )}
      </div>

      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <fieldset>
        <legend className="section-header">Was ist los?</legend>
        <div className="inset-group">
          {MESSAGE_TYPES.map((type) => (
            <label
              key={type.code}
              className="list-row cursor-pointer has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-tint"
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
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-white ${
                  type.urgent ? "bg-warning" : "bg-tint"
                }`}
              >
                <MessageTypeIcon icon={type.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="flex-1 text-[17px]">{type.label}</span>
              {messageType === type.code && (
                <Check
                  className="shrink-0 text-tint"
                  size={20}
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {allowFreeText && (
        <div>
          <label htmlFor="messageText" className="section-header">
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
            className="field"
          />
        </div>
      )}

      <p className="flex gap-3 rounded-xl bg-surface p-4 text-[15px] leading-snug">
        <TriangleAlert className="mt-0.5 shrink-0 text-warning" size={20} aria-hidden="true" />
        <span>
          Tier oder Kind im heißen oder kalten Auto, Unfall oder Gefahr? Bitte sofort{" "}
          <a href="tel:110" className="font-semibold text-tint">
            110
          </a>{" "}
          oder{" "}
          <a href="tel:112" className="font-semibold text-tint">
            112
          </a>{" "}
          anrufen. PlateDrop ist kein Notrufkanal.
        </span>
      </p>

      {state?.error && (
        <p role="alert" className="rounded-xl bg-surface p-4 text-[15px] text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !isFormValid}
        className="btn btn-primary min-h-[3.25rem] w-full"
      >
        {isPending ? (
          <>
            <Loader2 className="animate-spin" size={20} aria-hidden="true" />
            Wird gesendet...
          </>
        ) : (
          "Nachricht senden"
        )}
      </button>
    </form>
  );
}
