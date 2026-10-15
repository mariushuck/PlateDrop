"use client";

import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { useActionState, useEffect, useId, useState } from "react";
import { EXAMPLE_PLATE } from "@/lib/utils/plateUtils";
import { usePlateInput } from "@/lib/utils/usePlateInput";
import PlateChoice from "./PlateChoice";

interface ClaimPlateFormProps {
  action: (
    _prevState: { success: boolean; error?: string } | null,
    formData: FormData,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Zusätzliche Felder, z. B. `orgId` beim Kennzeichen einer Organisation. */
  hiddenFields?: Record<string, string>;
}

export default function ClaimPlateForm({ action, hiddenFields }: ClaimPlateFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  // Mehrere Formulare je Seite (öffentlich + je Organisation) brauchen eigene IDs.
  const inputId = useId();
  const plate = usePlateInput();
  const { setValue: setPlate } = plate;
  const [showSuccess, setShowSuccess] = useState(false);

  // Handle success state without synchronous updates in the effect body
  useEffect(() => {
    if (!state?.success) return;

    const showTimer = window.setTimeout(() => {
      setShowSuccess(true);
      setPlate("");

      window.setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    }, 0);

    return () => window.clearTimeout(showTimer);
  }, [state, setPlate]);

  return (
    <div className="space-y-4">
      {showSuccess && (
        <p className="flex items-center gap-2 text-[15px] font-medium text-success" role="status">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          Kennzeichen erfolgreich registriert! ✓
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        {hiddenFields &&
          Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        <div>
          <label htmlFor={inputId} className="mb-1.5 block text-[15px] text-secondary">
            Kennzeichen
          </label>
          <div className="plate-field">
            <input
              id={inputId}
              name="plateNumber"
              type="text"
              placeholder={EXAMPLE_PLATE}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={plate.value}
              onChange={plate.onChange}
              disabled={isPending}
            />
            {plate.valid && (
              // The plate stays white in dark mode, so the check keeps the light-mode green.
              <Check
                className="mr-3 shrink-0 self-center text-[#248a3d]"
                size={24}
                strokeWidth={3}
              />
            )}
          </div>
          {plate.error ? (
            <p className="mt-1.5 text-[13px] text-danger">{plate.error}</p>
          ) : (
            plate.district && <p className="mt-1.5 text-[13px] text-secondary">{plate.district}</p>
          )}
          <PlateChoice candidates={plate.candidates} onPick={setPlate} />
        </div>

        {state?.error && (
          <p role="alert" className="text-[15px] text-danger">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !plate.valid}
          className="btn btn-primary w-full"
        >
          {isPending ? (
            <>
              <Loader2 className="animate-spin" size={20} aria-hidden="true" />
              Wird registriert...
            </>
          ) : (
            "Kennzeichen registrieren"
          )}
        </button>
      </form>
    </div>
  );
}
