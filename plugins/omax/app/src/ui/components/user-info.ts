import { Box, Text } from "@opentui/core";
import { sanitizeText } from "../../sanitize.js";
import type { TwitterUser } from "../../lib/x-client/index.js";
import { theme } from "../theme.js";

export interface UserInfoState {
  avatarAnchorId?: string;
  useInlineAvatarOverlay?: boolean;
}

const PROFILE_AVATAR_WIDTH_CELLS = 6;
const PROFILE_AVATAR_HEIGHT_ROWS = 3;

function formatCount(value: number | undefined): string {
  if (value === undefined) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}

export function renderUserInfo(user: TwitterUser, state: UserInfoState = {}) {
  const followers = formatCount(user.followersCount);
  const following = formatCount(user.followingCount);
  const verified = user.isBlueVerified ? " • verified" : "";
  const avatarFallback = (user.name[0] ?? "@").toUpperCase();
  const showInlineAvatarOverlay = Boolean(
    state.useInlineAvatarOverlay && state.avatarAnchorId && user.profileImageUrl,
  );

  return Box(
    {
      width: "100%",
      borderStyle: "rounded",
      borderColor: theme.border,
      backgroundColor: theme.backgroundMuted,
      padding: 1,
      flexDirection: "column",
      gap: 1,
    },
    Box(
      {
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 1,
      },
      showInlineAvatarOverlay
        ? Box(
            {
              id: state.avatarAnchorId,
              width: PROFILE_AVATAR_WIDTH_CELLS,
              height: PROFILE_AVATAR_HEIGHT_ROWS,
              alignItems: "center",
              justifyContent: "center",
            },
            Text({ content: avatarFallback, fg: theme.textMuted }),
          )
        : Box(
            {
              width: PROFILE_AVATAR_WIDTH_CELLS,
              height: PROFILE_AVATAR_HEIGHT_ROWS,
              alignItems: "center",
              justifyContent: "center",
            },
            Text({ content: "[@]", fg: theme.textMuted }),
          ),
      Text({
        content: `${sanitizeText(user.name)} (@${sanitizeText(user.username)})${verified}`,
        fg: theme.textPrimary,
      }),
    ),
    Text({
      content: user.description ? sanitizeText(user.description) : "No bio available.",
      fg: theme.textMuted,
    }),
    Text({
      content: `Followers ${followers}  Following ${following}`,
      fg: theme.accent,
    }),
  );
}
