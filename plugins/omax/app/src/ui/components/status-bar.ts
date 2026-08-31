import { Box, Text } from "@opentui/core";
import { sanitizeText } from "../../sanitize.js";
import { theme } from "../theme.js";

function clamp(text: string, width: number): string {
  if (text.length <= width) return text;
  return width <= 1 ? "…" : `${text.slice(0, width - 1)}…`;
}

export function renderStatusBar(message: string, hints: string, availableWidth: number) {
  const innerWidth = Math.max(1, availableWidth - 4);
  const safeMessage = sanitizeText(message || "Ready");
  const safeHints = sanitizeText(hints);
  const compact = innerWidth < 44;
  const messageWidth = compact ? innerWidth : Math.max(12, Math.floor(innerWidth * 0.28));
  const hintWidth = Math.max(0, innerWidth - messageWidth - (compact ? 0 : 1));

  return Box(
    {
      id: "status-bar",
      width: "100%",
      height: 4,
      borderStyle: "single",
      borderColor: theme.border,
      backgroundColor: theme.backgroundMuted,
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    Text({ content: clamp(safeMessage, messageWidth), width: messageWidth, fg: theme.textMuted }),
    compact || hintWidth === 0
      ? null
      : Text({ content: clamp(safeHints, hintWidth), width: hintWidth, fg: theme.textPrimary }),
  );
}
