"use client";

/** Öffnet den Druckdialog; im Ausdruck selbst unsichtbar. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-primary w-full print:hidden"
    >
      Drucken oder als PDF speichern
    </button>
  );
}
