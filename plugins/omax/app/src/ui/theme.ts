export interface Theme {
  background: string;
  backgroundMuted: string;
  surface: string;
  border: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  accentStrong: string;
  success: string;
  warning: string;
  danger: string;
  selection: string;
}

// Fallback palette, used only when no Omarchy theme is present.
export const fallbackTheme: Theme = {
  background: "#000000",
  backgroundMuted: "#070707",
  surface: "#101010",
  border: "#2F2F2F",
  textPrimary: "#F5F5F5",
  textMuted: "#A3A3A3",
  accent: "#1D9BF0",
  accentStrong: "#5CB9FF",
  success: "#8DDDB6",
  warning: "#D8B07A",
  danger: "#E690A0",
  selection: "#0F1825",
};

// Mutable singleton every component reads at render time. Omarchy colors are
// applied into it in place (see omarchy-theme.ts) so all imports stay valid.
export const theme: Theme = { ...fallbackTheme };

export const layout = {
  contentColumnMaxWidth: 64,
} as const;
