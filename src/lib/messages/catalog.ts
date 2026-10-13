import entries from "./catalog.json";

/**
 * Vordefinierte Nachrichten. Einzige Quelle für Codes und Texte: die Anwendung
 * liest diese Datei, der Notifier (scripts/notifier.mjs) ebenfalls, und der
 * CHECK in db/migrations/0013 listet dieselben Codes – ein Unit-Test hält beides
 * gleich. Anonyme Absender wählen nur aus dieser Liste, Freitext gibt es für sie
 * nicht (strategy.md §2).
 */
export interface MessageTypeEntry {
  code: string;
  /** Kurzform für die Auswahl im Formular. */
  label: string;
  /** Satz, den der Halter liest. */
  text: string;
  /** Symbolname aus lucide-react (kebab-case). */
  icon: string;
  /** Dringliche Typen ignorieren Ruhezeiten. */
  urgent: boolean;
}

export const MESSAGE_TYPES: readonly MessageTypeEntry[] = entries;

const BY_CODE = new Map(MESSAGE_TYPES.map((entry) => [entry.code, entry]));

export function isMessageType(code: unknown): code is string {
  return typeof code === "string" && BY_CODE.has(code);
}

export function messageType(code: string): MessageTypeEntry | undefined {
  return BY_CODE.get(code);
}
