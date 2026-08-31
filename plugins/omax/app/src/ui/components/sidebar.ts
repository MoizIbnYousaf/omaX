import { Box, Text } from "@opentui/core";
import { sanitizeText } from "../../sanitize.js";
import { theme } from "../theme.js";

export type SidebarItem = "home" | "explore" | "notifications" | "bookmarks" | "lists" | "profile";

const NAV_ITEMS: Array<{ key: SidebarItem; label: string; shortcut: string }> = [
  { key: "home", label: "Home", shortcut: "1" },
  { key: "explore", label: "Explore", shortcut: "2" },
  { key: "notifications", label: "Notifs", shortcut: "3" },
  { key: "bookmarks", label: "Bookmarks", shortcut: "4" },
  { key: "lists", label: "Lists", shortcut: "5" },
  { key: "profile", label: "Profile", shortcut: "6" },
];

export interface SidebarState {
  active: SidebarItem;
  username: string;
}

export function renderSidebar(state: SidebarState) {
  const items = NAV_ITEMS.map((item) => {
    const isActive = item.key === state.active;
    return Box(
      {
        width: "100%",
        paddingLeft: 1,
        paddingRight: 1,
        height: 1,
        backgroundColor: isActive ? theme.selection : undefined,
      },
      Text({
        content: `${item.shortcut} ${item.label}`,
        fg: isActive ? theme.accent : theme.textPrimary,
      }),
    );
  });

  return Box(
    {
      id: "sidebar",
      width: 18,
      height: "100%",
      flexDirection: "column",
      borderStyle: "single",
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingTop: 1,
    },
    Text({
      content: " X",
      fg: theme.accentStrong,
    }),
    Box({ height: 1 }),
    ...items,
    Box({ flexGrow: 1 }),
    Box(
      {
        width: "100%",
        paddingLeft: 1,
        paddingRight: 1,
        height: 3,
        borderStyle: "single",
        borderColor: theme.accent,
        justifyContent: "center",
        alignItems: "center",
      },
      Text({ content: "Post", fg: theme.accent }),
    ),
    Box({ height: 1 }),
    Text({
      content: ` @${sanitizeText(state.username)}`,
      fg: theme.textMuted,
    }),
  );
}
