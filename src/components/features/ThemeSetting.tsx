"use client";

import { applyTheme, type ThemeChoice } from "@/lib/theme";
import { useTheme } from "@/lib/useTheme";

const OPTIONS: Array<[ThemeChoice, string]> = [
  ["system", "Automatisch"],
  ["light", "Hell"],
  ["dark", "Dunkel"],
];

/** Darstellung in den Einstellungen; dieselbe Wahl wie der Schalter in der Navigationsleiste. */
export default function ThemeSetting() {
  const theme = useTheme();
  return (
    <section>
      <h2 className="section-header">Darstellung</h2>
      <fieldset className="segmented" aria-label="Darstellung">
        {OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => applyTheme(value)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <p className="section-footer">
        Automatisch folgt der Einstellung deines Geräts. Die Wahl bleibt nur in diesem Browser
        gespeichert.
      </p>
    </section>
  );
}
