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
  /** Überschrift der Gruppe im Formular; Einträge einer Kategorie stehen im Katalog zusammen. */
  category: string;
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

/** Kategorien in Katalogreihenfolge, je mit ihren Einträgen. */
export const MESSAGE_CATEGORIES: ReadonlyArray<{ name: string; types: MessageTypeEntry[] }> =
  MESSAGE_TYPES.reduce<Array<{ name: string; types: MessageTypeEntry[] }>>((groups, entry) => {
    const last = groups.at(-1);
    if (last?.name === entry.category) last.types.push(entry);
    else groups.push({ name: entry.category, types: [entry] });
    return groups;
  }, []);

const BY_CODE = new Map(MESSAGE_TYPES.map((entry) => [entry.code, entry]));

export function isMessageType(code: unknown): code is string {
  return typeof code === "string" && BY_CODE.has(code);
}

export function messageType(code: string): MessageTypeEntry | undefined {
  return BY_CODE.get(code);
}

/**
 * Auswahl aus dem Formular (`formData.getAll("messageTypes")`): ohne Dubletten,
 * in Auswahlreihenfolge. `null`, sobald ein Wert nicht aus dem Katalog stammt.
 */
export function parseMessageTypes(values: unknown[]): string[] | null {
  if (!values.every(isMessageType)) return null;
  return [...new Set(values)];
}

/** Katalog-Einträge zu gespeicherten Codes, dringliche zuerst; Unbekanntes fällt weg. */
export function messageEntries(codes: readonly string[] | null): MessageTypeEntry[] {
  const entries = (codes ?? []).flatMap((code) => BY_CODE.get(code) ?? []);
  return [...entries.filter((e) => e.urgent), ...entries.filter((e) => !e.urgent)];
}
