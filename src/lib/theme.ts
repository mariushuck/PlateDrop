/**
 * Darstellung hell/dunkel. Ohne Wahl folgt die App dem Gerät; eine Wahl liegt
 * nur im localStorage dieses Browsers (nie auf dem Server) und wird als
 * `data-theme` an <html> gesetzt – globals.css schaltet darüber `color-scheme`.
 */
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "theme";

/** Statusleisten-Farben (= Hintergrund `canvas`), auch im Viewport-Export des Root-Layouts. */
export const THEME_COLORS = { light: "#f2f2f7", dark: "#000000" } as const;

/** Läuft im <head> vor dem ersten Zeichnen, damit nichts aufflackert. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function readTheme(): ThemeChoice {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

/** Event on `window` after every switch, for parts that render their own colors (toasts). */
export const THEME_EVENT = "platedrop:theme";

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;

  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Gesperrter Speicher (privater Modus): gilt dann nur bis zum Neuladen.
  }

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.getAttribute("media")?.includes("dark")
      ? THEME_COLORS.dark
      : THEME_COLORS.light;
    meta.setAttribute("content", choice === "system" ? own : THEME_COLORS[choice]);
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}
