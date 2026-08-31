import type { TweetData, TwitterUser } from "./lib/x-client/index.js";

// Defined locally because x-client does not re-export this shape.
export interface TweetMedia {
  type: "photo" | "video" | "animated_gif";
  url: string;
  previewUrl?: string;
  width?: number;
  height?: number;
  videoUrl?: string;
  durationMs?: number;
}

export interface ExpandedTweet {
  tweet: TweetData;
  author?: TwitterUser;
  media?: TweetMedia[];
}

export interface TweetPage {
  items: ExpandedTweet[];
  nextCursor?: string;
}

export type ImageMode = "auto" | "kitty" | "off";

export interface AppConfig {
  imageMode: ImageMode;
  chromeProfile?: string;
  cookieSource?: "safari" | "chrome" | "firefox";
}
