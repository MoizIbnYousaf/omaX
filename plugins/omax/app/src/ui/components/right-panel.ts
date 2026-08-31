import { Box, Text } from "@opentui/core";
import { sanitizeText } from "../../sanitize.js";
import { theme } from "../theme.js";

export interface TrendingItem {
  category?: string;
  topic: string;
  postCount?: string;
}

export interface RightPanelState {
  trending: TrendingItem[];
}

export function renderRightPanel(state: RightPanelState) {
  const trendingItems = state.trending.slice(0, 8).map((item, index) =>
    Box(
      {
        width: "100%",
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: "column",
        marginBottom: 1,
      },
      item.category
        ? Text({ content: sanitizeText(String(item.category)), fg: theme.textMuted })
        : null,
      Text({ content: sanitizeText(String(item.topic ?? "")), fg: theme.textPrimary }),
      item.postCount
        ? Text({ content: `${item.postCount} posts`, fg: theme.textMuted })
        : null,
    ),
  );

  return Box(
    {
      id: "right-panel",
      width: 26,
      height: "100%",
      flexDirection: "column",
      borderStyle: "single",
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingTop: 1,
    },
    Box(
      {
        width: "100%",
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 1,
      },
      Text({ content: "What's happening", fg: theme.textPrimary }),
    ),
    ...trendingItems,
    trendingItems.length === 0
      ? Box(
          { paddingLeft: 1 },
          Text({ content: "Loading...", fg: theme.textMuted }),
        )
      : null,
  );
}
