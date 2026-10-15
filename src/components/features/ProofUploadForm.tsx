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
      <p className="flex items-center gap-2 text-[15px] font-medium text-success" role="status">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        Bild erfolgreich hochgeladen!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="btn btn-primary w-full cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-tint">
        <Camera className="h-5 w-5" aria-hidden="true" />
        {isUploading ? "Wird hochgeladen..." : "Foto hochladen"}
        <input
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={isUploading}
          className="sr-only"
        />
      </label>

      {error && (
        <p className="text-[15px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
