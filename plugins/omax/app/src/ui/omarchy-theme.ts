/**
 * Omarchy theming, end to end.
 *
 * Omarchy publishes the active theme's semantic palette at
 * ~/.local/state/omarchy/current/theme/colors.toml and rewrites it on every
 * theme switch. OmaX reads that file at startup and maps it onto the app's
 * semantic theme roles, so the client re-rices with the rest of the desktop.
 * When the file is absent (non-Omarchy machine), the fallback palette stays.
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { theme, fallbackTheme, type Theme } from "./theme.js";

export interface OmarchyColors {
  mode?: string; // "dark" | "light"
  [key: string]: string | undefined;
}

export function omarchyColorsPath(): string {
  const override = process.env.OMAX_THEME_FILE?.trim();
  if (override) return override;
  const stateHome = process.env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "omarchy", "current", "theme", "colors.toml");
}

/** Minimal flat-TOML parser: `key = "#value"` lines only, which is all colors.toml uses. */
export function parseColorsToml(text: string): OmarchyColors {
  const colors: OmarchyColors = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"([^"]*)"\s*(?:#.*)?$/);
    if (match) colors[match[1]!] = match[2]!;
  }
  return colors;
}

/**
 * Map Omarchy's semantic palette onto OmaX's theme roles.
 *
 * Available keys (all optional; validate before use): mode ("dark"/"light"),
 * accent, selection, muted, background, dark_background, darker_background,
 * lighter_background, foreground, dark_foreground, light_foreground,
 * bright_foreground, red, yellow, orange, green, cyan, blue, magenta, brown,
 * and bright_* variants of the named colors.
 */
export function mapOmarchyToTheme(colors: OmarchyColors): Theme {
  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = colors[key];
      if (value && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
    }
    return undefined;
  };

  // Depth comes from Omarchy's background tiers: the page sits on the theme
  // background, the gutter one step darker, cards one step lighter — the same
  // three-plane recession Omarchy terminals get from bg/dim/bright.
  return {
    background: pick("background") ?? fallbackTheme.background,
    backgroundMuted: pick("darker_background", "dark_background", "background") ?? fallbackTheme.backgroundMuted,
    surface: pick("lighter_background", "dark_background", "background") ?? fallbackTheme.surface,
    border: pick("muted", "dark_foreground", "selection") ?? fallbackTheme.border,
    textPrimary: pick("bright_foreground", "foreground") ?? fallbackTheme.textPrimary,
    textMuted: pick("dark_foreground", "muted", "foreground") ?? fallbackTheme.textMuted,
    accent: pick("accent", "blue", "foreground") ?? fallbackTheme.accent,
    accentStrong: pick("bright_blue", "light_foreground", "accent", "blue") ?? fallbackTheme.accentStrong,
    success: pick("green", "bright_green") ?? fallbackTheme.success,
    warning: pick("yellow", "orange", "bright_yellow") ?? fallbackTheme.warning,
    danger: pick("red", "bright_red") ?? fallbackTheme.danger,
    selection: pick("selection", "lighter_background", "muted") ?? fallbackTheme.selection,
  };
}

/**
 * Watch the Omarchy theme for switches and re-apply live. Omarchy swaps the
 * whole current/theme directory on a switch, so watch the parent directory
 * and debounce. Calls onChange after the palette is re-applied.
 */
export function watchOmarchyTheme(onChange: () => void): void {
  const path = omarchyColorsPath();
  const dir = join(path, "..");
  if (!existsSync(dir)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { watch } = require("node:fs") as typeof import("node:fs");
    watch(dir, { persistent: false }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (applyOmarchyTheme()) onChange();
      }, 250);
    });
  } catch {
    // A machine without inotify head-room just keeps the startup palette.
  }
}

/** Load the current Omarchy palette into the live theme object. Returns true when applied. */
export function applyOmarchyTheme(): boolean {
  const path = omarchyColorsPath();
  if (!existsSync(path)) return false;
  try {
    const colors = parseColorsToml(readFileSync(path, "utf8"));
    Object.assign(theme, mapOmarchyToTheme(colors));
    return true;
  } catch {
    return false;
  }
}
