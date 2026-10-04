"use client";

import { Camera, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadProof } from "@/app/dashboard/actions";

/**
 * Lädt das Beweisfoto über eine Server Action hoch. Nach dem Erfolg wird die
 * Seite serverseitig neu geholt (router.refresh), damit die aktualisierten
 * Kennzeichen-Daten ohne vollständigen Reload erscheinen.
 */
export default function ProofUploadForm({ plateId }: { plateId: string }) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("proof", file);

      const result = await uploadProof(plateId, formData);

      if (!result.success) {
        setError(result.error || "Fehler beim Hochladen");
        setIsUploading(false);
        return;
      }

      setSuccess(true);
      setIsUploading(false);
      router.refresh();
    } catch (_err) {
      setError("Ein Fehler ist aufgetreten");
      setIsUploading(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-100 p-4 dark:bg-green-900/30">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          Bild erfolgreich hochgeladen!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-4 transition-colors hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/10 dark:hover:border-amber-600">
        <Camera className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Foto hochladen</p>
          <p className="text-xs text-amber-700 dark:text-amber-200">
            {isUploading ? "Wird hochgeladen..." : "Klicke hier, um ein Bild zu wählen"}
          </p>
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={isUploading}
          className="hidden"
        />
      </label>

      {error && (
        <div className="rounded-lg bg-red-100 p-3 dark:bg-red-900/30">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
