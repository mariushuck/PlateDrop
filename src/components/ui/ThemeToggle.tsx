"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import { applyTheme, type ThemeChoice } from "@/lib/theme";
import { useTheme } from "@/lib/useTheme";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = {
  system: "Automatisch",
  light: "Hell",
  dark: "Dunkel",
};
const ICON = { system: SunMoon, light: Sun, dark: Moon };

/** Schaltet Automatisch → Hell → Dunkel. */
export default function ThemeToggle() {
  const theme = useTheme();
  const Icon = ICON[theme ?? "system"];
  return (
    <button
      type="button"
      onClick={() => applyTheme(NEXT[theme ?? "system"])}
      aria-label={`Darstellung: ${LABEL[theme ?? "system"]}. Tippen zum Wechseln.`}
      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-tint active:opacity-60"
    >
      {/* Unsichtbar bis nach dem Laden, damit kein falsches Symbol aufblitzt. */}
      <Icon size={22} className={theme ? "" : "invisible"} aria-hidden="true" />
    </button>
  );
}
