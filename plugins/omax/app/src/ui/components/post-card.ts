import { Box, Text } from "@opentui/core";
import { sanitizeText } from "../../sanitize.js";
import type { ExpandedTweet } from "../../types.js";
import { theme } from "../theme.js";

export interface PostCardState {
  id?: string;
  selected?: boolean;
  liked?: boolean;
  bookmarked?: boolean;
  avatarAnchorId?: string;
  useInlineAvatarOverlay?: boolean;
  mediaAnchorId?: string;
  mediaAnchorHeight?: number;
  useInlineMediaOverlay?: boolean;
}

const INLINE_MEDIA_HEIGHT = 12;
const AVATAR_WIDTH_CELLS = 4;
const AVATAR_HEIGHT_ROWS = 2;

function formatCount(value: number | undefined): string {
  return String(value ?? 0);
}

function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function lineClamp(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1)}\u2026`;
}

export function renderPostCard(item: ExpandedTweet, state: PostCardState = {}) {
  const author = item.author;
  const tweet = item.tweet;
  const selected = state.selected ?? false;
  const liked = state.liked ?? false;
  const bookmarked = state.bookmarked ?? false;

  const name = author?.name ? sanitizeText(author.name) : "Unknown";
  const handle = author?.username ? sanitizeText(author.username) : "unknown";
  const header = `${name} (@${handle})`;
  const stamp = formatTimestamp(tweet.createdAt);
  const avatarUrl = author?.profileImageUrl;
  const mediaSummary = item.media?.length ? "[media attached]" : "";
  const showInlineAvatarOverlay = Boolean(state.useInlineAvatarOverlay && state.avatarAnchorId && avatarUrl);
  const showInlineOverlay = Boolean(selected && mediaSummary && state.useInlineMediaOverlay);

  const likes = formatCount(tweet.likeCount);
  const replies = formatCount(tweet.replyCount);
  const reposts = formatCount(tweet.retweetCount);
  const actions = `${liked ? "[liked]" : "[like]"} ${bookmarked ? "[saved]" : "[save]"}`;

  return Box(
    {
      id: state.id,
      width: "100%",
      borderStyle: "rounded",
      borderColor: selected ? theme.accent : theme.border,
      backgroundColor: selected ? theme.selection : theme.surface,
      padding: 1,
      marginBottom: 1,
      flexDirection: "column",
      gap: 1,
      overflow: "hidden",
    },
    Box(
      {
        width: "100%",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 1,
      },
      showInlineAvatarOverlay
        ? Box({
            id: state.avatarAnchorId,
            width: AVATAR_WIDTH_CELLS,
            height: AVATAR_HEIGHT_ROWS,
          })
        : Box(
            {
              width: AVATAR_WIDTH_CELLS,
              height: AVATAR_HEIGHT_ROWS,
              alignItems: "center",
              justifyContent: "center",
            },
            Text({ content: "[@]", fg: theme.textMuted }),
          ),
      Box(
        {
          flexDirection: "column",
          gap: 0,
          flexGrow: 1,
        },
        Text({ content: header, fg: theme.textPrimary }),
        stamp ? Text({ content: stamp, fg: theme.textMuted }) : null,
      ),
    ),
    Text({ content: lineClamp(sanitizeText(tweet.text), 500), fg: theme.textPrimary }),
    mediaSummary ? Text({ content: mediaSummary, fg: theme.textMuted }) : null,
    showInlineOverlay
      ? Box({
          id: state.mediaAnchorId,
          width: "100%",
          height: state.mediaAnchorHeight ?? INLINE_MEDIA_HEIGHT,
        })
      : selected && mediaSummary
        ? Text({ content: "Kitty preview unavailable.", fg: theme.textMuted })
        : null,
    Text(
      {
        content: `Replies ${replies}  Reposts ${reposts}  Likes ${likes}  ${actions}`,
        fg: theme.textMuted,
      },
    ),
  );
}
