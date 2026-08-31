import { describe, expect, test } from "bun:test";
import { parseColorsToml, mapOmarchyToTheme } from "../src/ui/omarchy-theme.js";
import { fallbackTheme, type Theme } from "../src/ui/theme.js";

const TOKYO_NIGHT = `
mode = "dark"

accent = "#7aa2f7"
selection = "#292e42"
muted = "#414868"

background = "#1a1b26"
dark_background = "#13141c"
darker_background = "#0e0e14"
lighter_background = "#24283b"

foreground = "#a9b1d6"
dark_foreground = "#565f89"
light_foreground = "#b4bee6"
bright_foreground = "#c0caf5"

red = "#f7768e"
yellow = "#e0af68"
green = "#9ece6a"
blue = "#7aa2f7"

bright_red = "#ff7a93"
`;

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("parseColorsToml", () => {
  test("parses semantic keys", () => {
    const colors = parseColorsToml(TOKYO_NIGHT);
    expect(colors.accent).toBe("#7aa2f7");
    expect(colors.background).toBe("#1a1b26");
    expect(colors.bright_red).toBe("#ff7a93");
    expect(colors.mode).toBe("dark");
  });

  test("ignores malformed lines", () => {
    const colors = parseColorsToml('garbage\n[section]\nkey = 42\nok = "#112233"');
    expect(colors.ok).toBe("#112233");
    expect(Object.keys(colors)).toEqual(["ok"]);
  });
});

describe("mapOmarchyToTheme", () => {
  test("every role is a valid hex color for a real palette", () => {
    const mapped = mapOmarchyToTheme(parseColorsToml(TOKYO_NIGHT));
    for (const [role, value] of Object.entries(mapped)) {
      expect(value).toMatch(HEX);
      void role;
    }
  });

  test("theme accent follows the Omarchy accent", () => {
    const mapped = mapOmarchyToTheme(parseColorsToml(TOKYO_NIGHT));
    expect(mapped.accent.toLowerCase()).toBe("#7aa2f7");
  });

  test("empty palette falls back to defaults", () => {
    const mapped: Theme = mapOmarchyToTheme({});
    expect(mapped).toEqual(fallbackTheme);
  });
});
