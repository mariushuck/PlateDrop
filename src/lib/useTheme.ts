"use client";

import { useEffect, useState } from "react";
import { readTheme, THEME_EVENT, type ThemeChoice } from "./theme";

/** Aktuelle Darstellung, `null` bis nach dem ersten Rendern (der Server kennt die Wahl nicht). */
export function useTheme(): ThemeChoice | null {
  const [theme, setTheme] = useState<ThemeChoice | null>(null);
  useEffect(() => {
    const sync = () => setTheme(readTheme());
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);
  return theme;
}
