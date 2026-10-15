"use client";

import { Check, ChevronRight, Circle, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageTypeIcon } from "@/components/ui/MessageTypeIcon";
import { MESSAGE_CATEGORIES } from "@/lib/messages/catalog";
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
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
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
        setSelected(new Set());
        setMessageText("");
        formRef.current?.reset();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const isFormValid = plateInput.trim() && !plateError && (selected.size > 0 || messageText.trim());

  function toggle(code: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  }

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
        <legend className="section-header">Was ist los? Mehrere Gründe möglich.</legend>
        <div className="space-y-3">
          {MESSAGE_CATEGORIES.map((category, index) => {
            const count = category.types.filter((type) => selected.has(type.code)).length;
            return (
              // Geschlossene Gruppen schicken ihre Häkchen trotzdem mit.
              <details key={category.name} open={index === 0} className="inset-group group/cat">
                <summary className="list-row cursor-pointer list-none active:opacity-60 [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-[17px] font-semibold">{category.name}</span>
                  {count > 0 && <span className="text-[15px] text-tint">{count} ausgewählt</span>}
                  <ChevronRight
                    className="shrink-0 text-secondary transition-transform group-open/cat:rotate-90"
                    size={20}
                    aria-hidden="true"
                  />
                </summary>
                {category.types.map((type) => {
                  const checked = selected.has(type.code);
                  return (
                    <label
                      key={type.code}
                      className="list-row cursor-pointer has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-tint"
                    >
                      <input
                        type="checkbox"
                        name="messageTypes"
                        value={type.code}
                        checked={checked}
                        onChange={() => toggle(type.code)}
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
                      {checked ? (
                        <CircleCheck
                          className="shrink-0 fill-tint text-surface"
                          size={24}
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle className="shrink-0 text-separator" size={24} aria-hidden="true" />
                      )}
                    </label>
                  );
                })}
              </details>
            );
          })}
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

      {selected.size > 0 && (
        <p className="-mb-4 px-4 text-[13px] text-secondary" aria-live="polite">
          {selected.size === 1 ? "1 Grund" : `${selected.size} Gründe`} ausgewählt
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
