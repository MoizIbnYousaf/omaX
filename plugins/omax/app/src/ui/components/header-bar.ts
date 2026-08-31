import { Box, Text } from "@opentui/core";
import { sanitizeText } from "../../sanitize.js";
import { theme } from "../theme.js";

function clamp(text: string, width: number): string {
  if (text.length <= width) return text;
  return width <= 1 ? "…" : `${text.slice(0, width - 1)}…`;
}

export function renderHeaderBar(viewTitle: string, availableWidth: number) {
  const innerWidth = Math.max(1, availableWidth - 4);
  const title = sanitizeText(viewTitle);
  const compact = innerWidth < 28;

  return Box(
    {
      id: "header-bar",
      width: "100%",
      height: 3,
      borderStyle: "single",
      borderColor: theme.border,
      backgroundColor: theme.backgroundMuted,
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    compact
      ? Text({ content: clamp(`omaX · ${title}`, innerWidth), fg: theme.textPrimary })
      : Text({ content: "omaX", fg: theme.accentStrong }),
    compact ? null : Text({ content: clamp(title, Math.max(1, innerWidth - 7)), fg: theme.textPrimary }),
  );
}
