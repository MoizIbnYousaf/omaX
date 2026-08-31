import type { CliRenderer, KeyEvent } from "@opentui/core";
import type { TwitterClient, TwitterUser } from "../../lib/x-client/index.js";
import type { ExpandedTweet } from "../../types.js";
import type { InlineImageManager } from "../media/inline-image-manager.js";

export interface ComposerRequest {
  inReplyToPostId: string;
  defaultText?: string;
}

export interface ViewContext {
  renderer: CliRenderer;
  inlineImageManager: InlineImageManager;
  client: TwitterClient;
  me: TwitterUser;
  setStatus: (message: string) => void;
  pushPostDetail: (post: ExpandedTweet) => Promise<void>;
  pushProfile: (username: string) => Promise<void>;
  pushComposer: (request: ComposerRequest) => Promise<void>;
  popView: () => void;
  replaceView: (view: OmaXView) => void;
  toggleLike: (postId: string) => Promise<boolean>;
  toggleBookmark: (postId: string) => Promise<boolean>;
  isLiked: (postId: string) => boolean;
  isBookmarked: (postId: string) => boolean;
}

export interface ViewDescriptor {
  title: string;
  hints: string;
  content: unknown;
}

export interface OmaXView {
  onEnter: () => Promise<void> | void;
  onExit?: () => Promise<void> | void;
  onDidRender?: () => Promise<void> | void;
  render: () => ViewDescriptor;
  handleKey: (key: KeyEvent) => Promise<boolean> | boolean;
}

export function isKey(key: KeyEvent, ...names: string[]): boolean {
  return names.includes(key.name) || names.includes(key.sequence);
}
