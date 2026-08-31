import { Box, ScrollBox, Text, type KeyEvent } from "@opentui/core";
import type { TwitterUser } from "../../lib/x-client/index.js";
import type { ExpandedTweet } from "../../types.js";
import { renderPostCard } from "../components/post-card.js";
import { getPostPrimaryImageDimensions, getPostPrimaryImageUrl } from "../media/post-image-preview.js";
import { layout, theme } from "../theme.js";
import type { OmaXView, ViewContext, ViewDescriptor } from "./contracts.js";
import { isKey } from "./contracts.js";

const DEFAULT_MEDIA_HEIGHT_ROWS = 12;
const ESTIMATED_POST_CONTENT_WIDTH_CELLS = Math.max(20, layout.contentColumnMaxWidth - 4);

export class BookmarksView implements OmaXView {
  private readonly viewId = "bookmarks";
  private readonly scrollId = "bookmarks-scroll";
  private readonly ctx: ViewContext;
  private items: ExpandedTweet[] = [];
  private selectedIndex = 0;
  private loading = false;

  public constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  public async onEnter(): Promise<void> {
    if (this.items.length === 0) {
      await this.loadMore();
    }
  }

  public async onExit(): Promise<void> {
    await this.ctx.inlineImageManager.clearView(this.viewId);
  }

  public render(): ViewDescriptor {
    const title = "Bookmarks";

    if (this.items.length === 0 && this.loading) {
      return {
        title,
        hints: "j/k: navigate | l: like | b: bookmark | r: reply | Enter: open | p: profile | n: more | q: back",
        content: Box(
          {
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          },
          Text({ content: "Loading bookmarks...", fg: theme.textMuted }),
        ),
      };
    }

    if (this.items.length === 0) {
      return {
        title,
        hints: "n: load | q: back",
        content: Box(
          {
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          },
          Text({ content: "No bookmarks found.", fg: theme.textMuted }),
        ),
      };
    }

    const useInlineOverlay = !this.ctx.inlineImageManager.isDisabled();
    const children = this.items.map((item, index) => {
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
    });

    return {
      title,
      hints:
        "j/k: navigate | l: like | b: bookmark | r: reply | Enter: open | p: profile | c: compose | n: more | q: back",
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
          ...children,
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

    if (isKey(key, "n")) {
      await this.loadMore();
      return true;
    }

    if (isKey(key, "c")) {
      await this.ctx.pushComposer({ inReplyToPostId: "" });
      return true;
    }

    const selected = this.items[this.selectedIndex];
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

    if (isKey(key, "return", "enter")) {
      await this.ctx.pushPostDetail(selected);
      return true;
    }

    if (isKey(key, "r")) {
      await this.ctx.pushComposer({ inReplyToPostId: selected.tweet.id });
      return true;
    }

    if (isKey(key, "p")) {
      const username = selected.author?.username;
      if (!username) {
        this.ctx.setStatus("Selected post has no author profile.");
        return true;
      }
      await this.ctx.pushProfile(username);
      return true;
    }

    return false;
  }

  public async onDidRender(): Promise<void> {
    const selected = this.items[this.selectedIndex];
    if (!selected || this.ctx.inlineImageManager.isDisabled()) {
      await this.ctx.inlineImageManager.reconcileMany([]);
      return;
    }

    const avatarImages = this.items.map((item) => ({
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

  private async moveSelection(delta: number): Promise<void> {
    const nextIndex = Math.max(
      0,
      Math.min(this.items.length - 1, this.selectedIndex + delta),
    );
    this.selectedIndex = nextIndex;
    this.scrollSelectedIntoView();

    if (this.selectedIndex >= this.items.length - 10) {
      await this.loadMore();
    }
  }

  private getPostCardId(tweetId: string): string {
    return `bookmarks-post-${tweetId}`;
  }

  private getPostMediaAnchorId(tweetId: string): string {
    return `bookmarks-media-${tweetId}`;
  }

  private getPostAvatarAnchorId(tweetId: string): string {
    return `bookmarks-avatar-${tweetId}`;
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
    const selected = this.items[this.selectedIndex];
    if (!selected) {
      return;
    }
    const selectedCardId = this.getPostCardId(selected.tweet.id);
    this.scrollSelectedIntoViewWithRetry(selectedCardId, 0);
  }

  private scrollSelectedIntoViewWithRetry(
    selectedCardId: string,
    attempt: number,
  ): void {
    setTimeout(
      () => {
        const scrollBox = this.ctx.renderer.root.findDescendantById(
          this.scrollId,
        ) as
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
      },
      attempt === 0 ? 0 : 16,
    );
  }

  private async loadMore(): Promise<void> {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.ctx.setStatus("Loading bookmarks...");

    try {
      const count = 20;
      const result = await this.ctx.client.getBookmarks(count);

      if (!result.success) {
        this.ctx.setStatus(`Bookmarks error: ${result.error}`);
        return;
      }

      const items: ExpandedTweet[] = result.tweets.map((tweet) => ({
        tweet,
        author: tweet.author
          ? ({
              id: tweet.authorId ?? "",
              username: tweet.author.username,
              name: tweet.author.name,
              profileImageUrl: tweet.author.profileImageUrl,
            } as TwitterUser)
          : undefined,
      }));

      this.items = [...this.items, ...items];
      this.ctx.setStatus(`Loaded ${items.length} bookmarks.`);
    } catch (error) {
      this.ctx.setStatus(
        `Bookmarks request failed: ${(error as Error).message}`,
      );
    } finally {
      this.loading = false;
    }
  }
}
