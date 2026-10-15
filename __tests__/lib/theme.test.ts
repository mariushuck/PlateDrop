import { applyTheme, readTheme, THEME_COLORS, THEME_EVENT, THEME_INIT_SCRIPT } from "@/lib/theme";

function themeColorMetas() {
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.head.innerHTML = `
      <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}">
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}">`;
  });

  it("defaults to the system setting", () => {
    expect(readTheme()).toBe("system");
  });

  it("pins light or dark and remembers the choice", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(readTheme()).toBe("dark");
    // Both status-bar colors follow the pinned choice.
    expect(themeColorMetas().map((m) => m.content)).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);

    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(themeColorMetas().map((m) => m.content)).toEqual([
      THEME_COLORS.light,
      THEME_COLORS.light,
    ]);
  });

  it("returns to the system setting and restores the media colors", () => {
    applyTheme("dark");
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("theme")).toBeNull();
    expect(readTheme()).toBe("system");
    expect(themeColorMetas().map((m) => m.content)).toEqual([
      THEME_COLORS.light,
      THEME_COLORS.dark,
    ]);
  });

  it("still switches when storage is unavailable", () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => applyTheme("dark")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
    setItem.mockRestore();
  });

  it("announces every switch", () => {
    const listener = jest.fn();
    window.addEventListener(THEME_EVENT, listener);
    applyTheme("light");
    applyTheme("system");
    window.removeEventListener(THEME_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("init script applies a stored choice and ignores garbage", () => {
    localStorage.setItem("theme", "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");

    delete document.documentElement.dataset.theme;
    localStorage.setItem("theme", "<script>");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
