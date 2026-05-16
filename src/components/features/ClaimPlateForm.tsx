"use client";

import { useActionState, useState, useEffect } from "react";
import { validateGermanPlate } from "@/lib/utils/plateUtils";
import { CheckCircle2 } from "lucide-react";

interface ClaimPlateFormProps {
  action: (
    _prevState: { success: boolean; error?: string } | null,
    formData: FormData,
  ) => Promise<{ success: boolean; error?: string }>;
}

export default function ClaimPlateForm({ action }: ClaimPlateFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [plateInput, setPlateInput] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  // Compute plate error synchronously
  const plateError =
    plateInput.trim() && !validateGermanPlate(plateInput)
      ? "Ungültiges Kennzeichen (z.B. KA-AB-1234)"
      : "";

  const isFormValid = plateInput.trim() && !plateError;

  // Handle success state without synchronous updates in the effect body
  useEffect(() => {
    if (!state?.success) return;

    const showTimer = window.setTimeout(() => {
      setShowSuccess(true);
      setPlateInput("");

      window.setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    }, 0);

    return () => window.clearTimeout(showTimer);
  }, [state?.success]);

  return (
    <div className="space-y-4">
      {showSuccess && (
        <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Kennzeichen erfolgreich registriert! ✓
          </p>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        {/* Plate Input */}
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
          className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white transition-all disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-400"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Wird registriert...
            </span>
          ) : (
            "Kennzeichen registrieren"
          )}
        </button>
      </form>
    </div>
  );
}
