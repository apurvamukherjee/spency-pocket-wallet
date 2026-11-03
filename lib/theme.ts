import type { Theme } from "./data/types";

export const THEME_KEY = "spency-theme";
const THEME_COLOR: Record<Theme, string> = { dark: "#0a0b0d", light: "#f6f6f3" };

/** Runs in <head> before first paint so a saved light theme never flashes dark. Dark is the default. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==="light"?"${THEME_COLOR.light}":"${THEME_COLOR.dark}"}}catch(e){}})()`;

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    // Private mode / blocked storage: the theme still applies for this visit, it just won't be remembered.
    console.warn("Could not persist theme", e);
  }
}
