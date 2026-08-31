import { Box, ScrollBox, Text, type KeyEvent } from "@opentui/core";
import type { TweetData, TwitterUser } from "../../lib/x-client/index.js";
import type { ExpandedTweet } from "../../types.js";
import { renderPostCard } from "../components/post-card.js";
import { renderUserInfo } from "../components/user-info.js";
import { getPostPrimaryImageDimensions, getPostPrimaryImageUrl } from "../media/post-image-preview.js";
import { layout, theme } from "../theme.js";
import type { OmaXView, ViewContext, ViewDescriptor } from "./contracts.js";
import { isKey } from "./contracts.js";

const DEFAULT_MEDIA_HEIGHT_ROWS = 12;

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

export class ProfileView implements OmaXView {
  private readonly viewId = "profile";
  private readonly scrollId = "profile-posts-scroll";
  private readonly ctx: ViewContext;
  private readonly username: string;
  private user?: TwitterUser;
  private posts: ExpandedTweet[] = [];
  private selectedIndex = 0;
  private loading = false;
  private loadingPosts = false;
  private nextCursor: string | undefined;

  public constructor(ctx: ViewContext, username: string) {
    this.ctx = ctx;
    this.username = username;
  }

  public async onEnter(): Promise<void> {
    if (!this.user) {
      await this.loadProfile();
    }
  }

  public async onExit(): Promise<void> {
    await this.ctx.inlineImageManager.clearView(this.viewId);
  }

  public render(): ViewDescriptor {
    if (!this.user) {
      return {
        title: `Profile @${this.username}`,
        hints: "q: back",
        content: Box(
          {
            width: "100%",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
          },
          Text({ content: this.loading ? "Loading profile..." : "Profile unavailable.", fg: theme.textMuted }),
        ),
      };
    }

    const useInlineOverlay = !this.ctx.inlineImageManager.isDisabled();
    const children = this.posts.length
      ? this.posts.map((item, index) => {
          const selected = index === this.selectedIndex;
          return renderPostCard(item, {
            id: this.getPostCardId(item.tweet.id),
            selected,
            liked: this.ctx.isLiked(item.tweet.id),
            bookmarked: this.ctx.isBookmarked(item.tweet.id),
            avatarAnchorId: this.getPostAvatarAnchorId(item.tweet.id),
            useInlineAvatarOverlay: useInlineOverlay,
            mediaAnchorId: selected ? this.getPostMediaAnchorId(item.tweet.id) : undefined,
            mediaAnchorHeight: selected ? this.getMediaAnchorHeightRows(item) : undefined,
            useInlineMediaOverlay: selected && useInlineOverlay,
          });
        })

      : [
          Box(
            {
              width: "100%",
              padding: 1,
              borderStyle: "rounded",
              borderColor: theme.border,
              backgroundColor: theme.surface,
            },
            Text({ content: this.loadingPosts ? "Loading posts..." : "No posts found.", fg: theme.textMuted }),
          ),
        ];

    return {
      title: `Profile @${this.user.username}`,
      hints: "j/k: navigate | l: like | b: bookmark | r: reply | Enter: open post | q: back",
      content: Box(
        {
          width: "100%",
          height: "100%",
          alignItems: "center",
          backgroundColor: theme.background,
          paddingLeft: 1,
          paddingRight: 1,
        },
        Box(
          {
            width: "100%",
            maxWidth: layout.contentColumnMaxWidth,
            height: "100%",
            flexDirection: "column",
            gap: 1,
            paddingTop: 1,
            paddingBottom: 1,
          },
          renderUserInfo(this.user, {
            avatarAnchorId: this.getHeaderAvatarAnchorId(this.user.id),
            useInlineAvatarOverlay: !this.ctx.inlineImageManager.isDisabled(),
          }),
          ScrollBox(
            {
              id: this.scrollId,
              width: "100%",
              height: "100%",
              viewportCulling: true,
              contentOptions: {
                padding: 1,
              },
            },
            ...children,
          ),
        ),
      ),
    };
  }

  public async handleKey(key: KeyEvent): Promise<boolean> {
    if (isKey(key, "j", "down")) {
      await this.moveSelection(1);
      return true;
    }

    if (isKey(key, "k", "up")) {
      await this.moveSelection(-1);
      return true;
    }

    const selected = this.posts[this.selectedIndex];
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

    if (isKey(key, "return", "enter")) {
      await this.ctx.pushPostDetail(selected);
      return true;
    }

    return false;
  }

  public async onDidRender(): Promise<void> {
    if (!this.user || this.ctx.inlineImageManager.isDisabled()) {
      await this.ctx.inlineImageManager.reconcileMany([]);
      return;
    }

    const desiredImages: Array<{
      viewId: string;
      postId: string;
      kind: "avatar" | "media";
      imageUrl: string | undefined;
      anchorId: string;
      viewportAnchorId?: string;
    }> = [
      {
        viewId: this.viewId,
        postId: `header-${this.user.id}`,
        kind: "avatar",
        imageUrl: this.user.profileImageUrl,
        anchorId: this.getHeaderAvatarAnchorId(this.user.id),
      },
      ...this.posts.map((item) => ({
        viewId: this.viewId,
        postId: item.tweet.id,
        kind: "avatar" as const,
        imageUrl: item.author?.profileImageUrl,
        anchorId: this.getPostAvatarAnchorId(item.tweet.id),
        viewportAnchorId: this.scrollId,
      })),
    ];

    const selected = this.posts[this.selectedIndex];
    if (selected) {
      const mediaUrl = getPostPrimaryImageUrl(selected);
      if (mediaUrl) {
        desiredImages.push({
          viewId: this.viewId,
          postId: `media-${selected.tweet.id}`,
          kind: "media",
          imageUrl: mediaUrl,
          anchorId: this.getPostMediaAnchorId(selected.tweet.id),
          viewportAnchorId: this.scrollId,
        });
      }
    }

    await this.ctx.inlineImageManager.reconcileMany(desiredImages);
  }

  private getHeaderAvatarAnchorId(userId: string): string {
    return `profile-header-avatar-${userId}`;
  }

  private getPostAvatarAnchorId(tweetId: string): string {
    return `profile-avatar-${tweetId}`;
  }

  private getPostMediaAnchorId(tweetId: string): string {
    return `profile-media-${tweetId}`;
  }

  private getMediaAnchorHeightRows(item: ExpandedTweet): number {
    const dims = getPostPrimaryImageDimensions(item);
    if (!dims) return DEFAULT_MEDIA_HEIGHT_ROWS;
    const cellPxW = this.getCellPixelWidth();
    const cellPxH = this.getCellPixelHeight();
    const contentWidthCells = 58;
    const contentWidthPx = contentWidthCells * cellPxW;
    const scale = Math.min(contentWidthPx / dims.width, 1);
    return Math.max(2, Math.round((dims.height * scale) / cellPxH));
  }

  private getCellPixelWidth(): number {
    const resolution = this.ctx.renderer.resolution;
    const terminalWidth = Math.max(1, this.ctx.renderer.terminalWidth || this.ctx.renderer.width);
    if (!resolution?.width) return 8;
    return Math.max(1, resolution.width / terminalWidth);
  }

  private getCellPixelHeight(): number {
    const resolution = this.ctx.renderer.resolution;
    const terminalHeight = Math.max(1, this.ctx.renderer.terminalHeight || this.ctx.renderer.height);
    if (!resolution?.height) return 16;
    return Math.max(1, resolution.height / terminalHeight);
  }

  private async moveSelection(delta: number): Promise<void> {
    if (this.posts.length === 0) {
      this.selectedIndex = 0;
      return;
    }

    const next = Math.max(0, Math.min(this.posts.length - 1, this.selectedIndex + delta));
    this.selectedIndex = next;
    this.scrollSelectedIntoView();
    if (this.nextCursor && this.selectedIndex >= this.posts.length - 3) {
      await this.loadMorePosts();
      this.scrollSelectedIntoView();
    }
  }

  private getPostCardId(tweetId: string): string {
    return `profile-post-${tweetId}`;
  }

  private scrollSelectedIntoView(): void {
    const selected = this.posts[this.selectedIndex];
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

  private async loadProfile(): Promise<void> {
    this.loading = true;
    this.ctx.setStatus(`Loading profile @${this.username}...`);
    try {
      const lookup = await this.ctx.client.getUserIdByUsername(this.username);
      if (!lookup.success || !lookup.userId || !lookup.username) {
        this.ctx.setStatus(`Profile request failed: ${lookup.error ?? "missing user data"}`);
        return;
      }
      this.user = {
        id: lookup.userId,
        username: lookup.username,
        name: lookup.name ?? lookup.username,
      };
      await this.loadMorePosts();
      this.ctx.setStatus(`Loaded profile @${this.username}.`);
    } catch (error) {
      this.ctx.setStatus(`Profile request failed: ${(error as Error).message}`);
    } finally {
      this.loading = false;
    }
  }

  private async loadMorePosts(): Promise<void> {
    if (!this.user || this.loadingPosts) {
      return;
    }
    this.loadingPosts = true;
    try {
      const result = await this.ctx.client.getUserTweetsPaged(this.user.id, 20, {
        cursor: this.nextCursor,
      });
      if (!result.success) {
        this.ctx.setStatus(`Could not load user posts: ${result.error}`);
        return;
      }
      const newPosts = result.tweets.map(mapTweetToExpanded);
      this.posts = [...this.posts, ...newPosts];
      this.nextCursor = result.nextCursor;
    } catch (error) {
      this.ctx.setStatus(`Could not load user posts: ${(error as Error).message}`);
    } finally {
      this.loadingPosts = false;
    }
  }
}
