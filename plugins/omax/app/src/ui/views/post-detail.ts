import { Box, ScrollBox, Text, type KeyEvent } from "@opentui/core";
import type { TweetData } from "../../lib/x-client/index.js";
import type { ExpandedTweet } from "../../types.js";
import { renderPostCard } from "../components/post-card.js";
import { getPostPrimaryImageDimensions, getPostPrimaryImageUrl } from "../media/post-image-preview.js";
import { layout, theme } from "../theme.js";
import type { OmaXView, ViewContext, ViewDescriptor } from "./contracts.js";
import { isKey } from "./contracts.js";

const DEFAULT_MEDIA_HEIGHT_ROWS = 12;
const ESTIMATED_POST_CONTENT_WIDTH_CELLS = Math.max(20, layout.contentColumnMaxWidth - 4);

function mapTweetToExpanded(t: TweetData): ExpandedTweet {
  return {
    tweet: t,
    author: {
      id: t.authorId ?? "",
      username: t.author.username,
      name: t.author.name,
      profileImageUrl: t.author.profileImageUrl,
    },
    media: t.media?.map((m) => ({
      type: m.type,
      url: m.url,
      previewUrl: m.previewUrl,
      width: m.width,
      height: m.height,
      videoUrl: m.videoUrl,
      durationMs: m.durationMs,
    })),
  };
}

export class PostDetailView implements OmaXView {
  private readonly viewId = "post-detail";
  private readonly scrollId = "post-detail-scroll";
  private readonly ctx: ViewContext;
  private readonly rootPost: ExpandedTweet;
  private replies: ExpandedTweet[] = [];
  private loading = false;
  private selectedReplyIndex = -1;

  public constructor(ctx: ViewContext, rootPost: ExpandedTweet) {
    this.ctx = ctx;
    this.rootPost = rootPost;
  }

  public async onEnter(): Promise<void> {
    await this.loadReplies();
  }

  public async onExit(): Promise<void> {
    await this.ctx.inlineImageManager.clearView(this.viewId);
  }

  public render(): ViewDescriptor {
    const useInlineOverlay = !this.ctx.inlineImageManager.isDisabled();
    const replyNodes = this.replies.length
      ? this.replies.map((item, index) =>
          renderPostCard(item, {
            id: this.getPostCardId(item.tweet.id),
            selected: this.selectedReplyIndex === index,
            liked: this.ctx.isLiked(item.tweet.id),
            bookmarked: this.ctx.isBookmarked(item.tweet.id),
            avatarAnchorId: this.getPostAvatarAnchorId(item.tweet.id),
            useInlineAvatarOverlay: useInlineOverlay,
            mediaAnchorId:
              this.selectedReplyIndex === index ? this.getPostMediaAnchorId(item.tweet.id) : undefined,
            mediaAnchorHeight:
              this.selectedReplyIndex === index ? this.getMediaAnchorHeightRows(item) : undefined,
            useInlineMediaOverlay: this.selectedReplyIndex === index && useInlineOverlay,
          }),
        )
      : [
          Box(
            {
              width: "100%",
              padding: 1,
              borderStyle: "rounded",
              borderColor: theme.border,
              backgroundColor: theme.surface,
            },
            Text({
              content: this.loading ? "Loading replies..." : "No replies found.",
              fg: theme.textMuted,
            }),
          ),
        ];

    return {
      title: "Post Detail",
      hints: "j/k: navigate replies | l: like | b: bookmark | r: reply | Enter: open reply | p: profile | q: back",
      content: Box(
        {
          width: "100%",
          height: "100%",
          alignItems: "center",
          backgroundColor: theme.background,
          paddingLeft: 1,
          paddingRight: 1,
        },
        ScrollBox(
          {
            id: this.scrollId,
            width: "100%",
            maxWidth: layout.contentColumnMaxWidth,
            height: "100%",
            viewportCulling: true,
            rootOptions: {
              backgroundColor: theme.background,
            },
            contentOptions: {
              padding: 1,
            },
          },
          Box(
            {
              width: "100%",
              flexDirection: "column",
              gap: 1,
            },
            Text({ content: "Selected Post", fg: theme.accent }),
            renderPostCard(this.rootPost, {
              id: this.getPostCardId(this.rootPost.tweet.id),
              selected: this.selectedReplyIndex === -1,
              liked: this.ctx.isLiked(this.rootPost.tweet.id),
              bookmarked: this.ctx.isBookmarked(this.rootPost.tweet.id),
              avatarAnchorId: this.getPostAvatarAnchorId(this.rootPost.tweet.id),
              useInlineAvatarOverlay: useInlineOverlay,
              mediaAnchorId:
                this.selectedReplyIndex === -1
                  ? this.getPostMediaAnchorId(this.rootPost.tweet.id)
                  : undefined,
              mediaAnchorHeight:
                this.selectedReplyIndex === -1 ? this.getMediaAnchorHeightRows(this.rootPost) : undefined,
              useInlineMediaOverlay: this.selectedReplyIndex === -1 && useInlineOverlay,
            }),
          ),
          Text({ content: "Replies", fg: theme.accent }),
          ...replyNodes,
        ),
      ),
    };
  }

  public async handleKey(key: KeyEvent): Promise<boolean> {
    if (isKey(key, "j", "down")) {
      this.moveSelection(1);
      return true;
    }

    if (isKey(key, "k", "up")) {
      this.moveSelection(-1);
      return true;
    }

    const selected = this.getSelectedPost();
    if (!selected) {
      return false;
    }

    if (isKey(key, "l")) {
      const liked = await this.ctx.toggleLike(selected.tweet.id);
      this.ctx.setStatus(liked ? "Post liked." : "Like removed.");
      return true;
    }

    if (isKey(key, "b")) {
      const bookmarked = await this.ctx.toggleBookmark(selected.tweet.id);
      this.ctx.setStatus(bookmarked ? "Post bookmarked." : "Bookmark removed.");
      return true;
    }

    if (isKey(key, "r")) {
      await this.ctx.pushComposer({ inReplyToPostId: selected.tweet.id });
      return true;
    }

    if (isKey(key, "p")) {
      const username = selected.author?.username;
      if (!username) {
        this.ctx.setStatus("No author profile available.");
        return true;
      }
      await this.ctx.pushProfile(username);
      return true;
    }

    if (isKey(key, "return", "enter") && this.selectedReplyIndex >= 0) {
      await this.ctx.pushPostDetail(selected);
      return true;
    }

    return false;
  }

  public async onDidRender(): Promise<void> {
    const selected = this.getSelectedPost();
    if (!selected || this.ctx.inlineImageManager.isDisabled()) {
      await this.ctx.inlineImageManager.reconcileMany([]);
      return;
    }

    const allPosts = [this.rootPost, ...this.replies];
    const avatarImages = allPosts.map((item) => ({
      viewId: this.viewId,
      postId: item.tweet.id,
      kind: "avatar" as const,
      imageUrl: item.author?.profileImageUrl,
      anchorId: this.getPostAvatarAnchorId(item.tweet.id),
      viewportAnchorId: this.scrollId,
    }));

    const mediaUrl = getPostPrimaryImageUrl(selected);
    await this.ctx.inlineImageManager.reconcileMany([
      ...avatarImages,
      {
        viewId: this.viewId,
        postId: selected.tweet.id,
        kind: "media" as const,
        imageUrl: mediaUrl,
        anchorId: this.getPostMediaAnchorId(selected.tweet.id),
        viewportAnchorId: this.scrollId,
      },
    ]);
  }

  private getSelectedPost(): ExpandedTweet | undefined {
    if (this.selectedReplyIndex === -1) {
      return this.rootPost;
    }
    return this.replies[this.selectedReplyIndex];
  }

  private moveSelection(delta: number): void {
    if (this.replies.length === 0) {
      this.selectedReplyIndex = -1;
      return;
    }

    const min = -1;
    const max = this.replies.length - 1;
    this.selectedReplyIndex = Math.max(min, Math.min(max, this.selectedReplyIndex + delta));
    this.scrollSelectedIntoView();
  }

  private getPostCardId(tweetId: string): string {
    return `post-detail-post-${tweetId}`;
  }

  private getPostMediaAnchorId(tweetId: string): string {
    return `post-detail-media-${tweetId}`;
  }

  private getPostAvatarAnchorId(tweetId: string): string {
    return `post-detail-avatar-${tweetId}`;
  }

  private getMediaAnchorHeightRows(item: ExpandedTweet): number {
    const dimensions = getPostPrimaryImageDimensions(item);
    if (!dimensions) {
      return DEFAULT_MEDIA_HEIGHT_ROWS;
    }

    const cellPixelWidth = this.getCellPixelWidth();
    const cellPixelHeight = this.getCellPixelHeight();
    const targetWidthPx = Math.max(1, Math.round(ESTIMATED_POST_CONTENT_WIDTH_CELLS * cellPixelWidth));
    const targetHeightPx = Math.max(
      cellPixelHeight,
      Math.round((targetWidthPx * dimensions.height) / Math.max(1, dimensions.width)),
    );
    return Math.max(1, Math.ceil(targetHeightPx / cellPixelHeight));
  }

  private getCellPixelWidth(): number {
    const resolution = this.ctx.renderer.resolution;
    const terminalWidth = Math.max(1, this.ctx.renderer.terminalWidth || this.ctx.renderer.width);
    if (!resolution?.width) {
      return 8;
    }
    return Math.max(1, resolution.width / terminalWidth);
  }

  private getCellPixelHeight(): number {
    const resolution = this.ctx.renderer.resolution;
    const terminalHeight = Math.max(1, this.ctx.renderer.terminalHeight || this.ctx.renderer.height);
    if (!resolution?.height) {
      return 16;
    }
    return Math.max(1, resolution.height / terminalHeight);
  }

  private scrollSelectedIntoView(): void {
    const selected = this.getSelectedPost();
    if (!selected) {
      return;
    }
    this.scrollSelectedIntoViewWithRetry(this.getPostCardId(selected.tweet.id), 0);
  }

  private scrollSelectedIntoViewWithRetry(selectedCardId: string, attempt: number): void {
    setTimeout(() => {
      const scrollBox = this.ctx.renderer.root.findDescendantById(this.scrollId) as
        | {
            scrollChildIntoView?: (childId: string) => void;
            scrollTop?: number;
          }
        | undefined;

      if (!scrollBox?.scrollChildIntoView) {
        if (attempt < 4) {
          this.scrollSelectedIntoViewWithRetry(selectedCardId, attempt + 1);
        }
        return;
      }

      const before = scrollBox.scrollTop;
      scrollBox.scrollChildIntoView(selectedCardId);
      const after = scrollBox.scrollTop;

      if (before === after && attempt < 4) {
        this.scrollSelectedIntoViewWithRetry(selectedCardId, attempt + 1);
      }
    }, attempt === 0 ? 0 : 16);
  }

  private async loadReplies(): Promise<void> {
    const tweetId = this.rootPost.tweet.id;
    this.loading = true;
    this.ctx.setStatus("Loading replies...");
    try {
      const result = await this.ctx.client.getReplies(tweetId);
      if (!result.success) {
        this.ctx.setStatus(`Failed loading replies: ${result.error}`);
        return;
      }
      this.replies = result.tweets
        .filter((t) => t.id !== tweetId)
        .map(mapTweetToExpanded);
      this.ctx.setStatus(`Loaded ${this.replies.length} replies.`);
    } catch (error) {
      this.ctx.setStatus(`Failed loading replies: ${(error as Error).message}`);
    } finally {
      this.loading = false;
    }
  }
}
