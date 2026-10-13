"use client";

/** Öffnet den Druckdialog; im Ausdruck selbst unsichtbar. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white print:hidden dark:bg-white dark:text-slate-900"
    >
      Drucken oder als PDF speichern
    </button>
  );
}
