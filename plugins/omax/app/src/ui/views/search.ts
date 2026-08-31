import { Box, InputRenderable, InputRenderableEvents, ScrollBox, Text, type KeyEvent } from "@opentui/core";
import type { TwitterUser } from "../../lib/x-client/index.js";
import type { ExpandedTweet } from "../../types.js";
import { renderPostCard } from "../components/post-card.js";
import { getPostPrimaryImageDimensions, getPostPrimaryImageUrl } from "../media/post-image-preview.js";
import { layout, theme } from "../theme.js";
import type { OmaXView, ViewContext, ViewDescriptor } from "./contracts.js";
import { isKey } from "./contracts.js";

type Focus = "input" | "results";

const DEFAULT_MEDIA_HEIGHT_ROWS = 12;
const ESTIMATED_POST_CONTENT_WIDTH_CELLS = Math.max(20, layout.contentColumnMaxWidth - 4);

export class SearchView implements OmaXView {
  private readonly viewId = "search";
  private readonly scrollId = "search-scroll";
  private readonly ctx: ViewContext;
  private readonly input: InputRenderable;
  private readonly enterHandler: (value: string) => void;
  private items: ExpandedTweet[] = [];
  private selectedIndex = 0;
  private loading = false;
  private query = "";
  private focus: Focus = "input";

  public constructor(ctx: ViewContext) {
    this.ctx = ctx;
    this.input = new InputRenderable(ctx.renderer, {
      id: "search-input",
      width: 60,
      placeholder: "Enter search query...",
      maxLength: 512,
      backgroundColor: theme.backgroundMuted,
      focusedBackgroundColor: theme.surface,
      textColor: theme.textPrimary,
      cursorColor: theme.accent,
    });
    this.enterHandler = (value: string) => {
      void this.executeSearch(value);
    };
    this.input.on(InputRenderableEvents.ENTER, this.enterHandler);
  }

  public onEnter(): void {
    this.input.focus();
  }

  public onExit(): void {
    this.input.off(InputRenderableEvents.ENTER, this.enterHandler);
    void this.ctx.inlineImageManager.clearView(this.viewId);
  }

  public render(): ViewDescriptor {
    const title = this.query ? `Search: ${this.query}` : "Search";
    const hints =
      "Enter: search | Tab: switch focus | j/k: navigate | l: like | b: bookmark | r: reply | p: profile | q: back";

    const inputSection = Box(
      {
        width: "100%",
        maxWidth: layout.contentColumnMaxWidth,
        borderStyle: "rounded",
        borderColor: this.focus === "input" ? theme.accent : theme.border,
        backgroundColor: theme.surface,
        padding: 1,
        gap: 1,
        flexDirection: "column",
      },
      Text({ content: "Search X", fg: theme.textPrimary }),
      this.input,
      Text({
        content: this.loading ? "Searching..." : "Type a query and press Enter.",
        fg: theme.textMuted,
      }),
    );

    if (this.items.length === 0 && !this.loading) {
      return {
        title,
        hints,
        content: Box(
          {
            width: "100%",
            height: "100%",
            alignItems: "center",
            backgroundColor: theme.background,
            paddingLeft: 1,
            paddingRight: 1,
            flexDirection: "column",
            paddingTop: 1,
            gap: 1,
          },
          inputSection,
          this.query
            ? Text({ content: "No results found.", fg: theme.textMuted })
            : Text({ content: "", fg: theme.textMuted }),
        ),
      };
    }

    if (this.items.length === 0 && this.loading) {
      return {
        title,
        hints,
        content: Box(
          {
            width: "100%",
            height: "100%",
            alignItems: "center",
            backgroundColor: theme.background,
            paddingLeft: 1,
            paddingRight: 1,
            flexDirection: "column",
            paddingTop: 1,
            gap: 1,
          },
          inputSection,
          Text({ content: "Loading search results...", fg: theme.textMuted }),
        ),
      };
    }

    const useInlineOverlay = !this.ctx.inlineImageManager.isDisabled();
    const children = this.items.map((item, index) => {
      const selected = this.focus === "results" && index === this.selectedIndex;
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
      hints,
      content: Box(
        {
          width: "100%",
          height: "100%",
          alignItems: "center",
          backgroundColor: theme.background,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: "column",
          gap: 1,
          paddingTop: 1,
        },
        inputSection,
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
    if (isKey(key, "tab")) {
      if (this.items.length > 0) {
        this.focus = this.focus === "input" ? "results" : "input";
        if (this.focus === "input") {
          this.input.focus();
        } else {
          this.input.blur();
        }
      }
      return true;
    }

    if (isKey(key, "escape")) {
      if (this.focus === "results") {
        this.focus = "input";
        this.input.focus();
        return true;
      }
      this.ctx.popView();
      return true;
    }

    if (this.focus === "input") {
      return false;
    }

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
    const selected = this.focus === "results" ? this.items[this.selectedIndex] : undefined;
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

  private async executeSearch(value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed || this.loading) {
      return;
    }

    this.query = trimmed;
    this.items = [];
    this.selectedIndex = 0;
    this.loading = true;
    this.ctx.setStatus(`Searching "${trimmed}"...`);

    try {
      const count = 20;
      const result = await this.ctx.client.search(trimmed, count);

      if (!result.success) {
        this.ctx.setStatus(`Search error: ${result.error}`);
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

      this.items = items;
      this.ctx.setStatus(`Found ${items.length} results.`);

      if (items.length > 0) {
        this.focus = "results";
        this.input.blur();
      }
    } catch (error) {
      this.ctx.setStatus(`Search request failed: ${(error as Error).message}`);
    } finally {
      this.loading = false;
    }
  }

  private async loadMore(): Promise<void> {
    if (this.loading || !this.query) {
      return;
    }

    this.loading = true;
    this.ctx.setStatus(`Loading more results for "${this.query}"...`);

    try {
      const count = 20;
      const result = await this.ctx.client.search(this.query, count);

      if (!result.success) {
        this.ctx.setStatus(`Search error: ${result.error}`);
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
      this.ctx.setStatus(`Loaded ${items.length} more results.`);
    } catch (error) {
      this.ctx.setStatus(`Search request failed: ${(error as Error).message}`);
    } finally {
      this.loading = false;
    }
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
    return `search-post-${tweetId}`;
  }

  private getPostMediaAnchorId(tweetId: string): string {
    return `search-media-${tweetId}`;
  }

  private getPostAvatarAnchorId(tweetId: string): string {
    return `search-avatar-${tweetId}`;
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

        if (before !== after) {
          this.ctx.inlineImageManager.reconcileAfterScroll(() => this.onDidRender());
        }
        if (before === after && attempt < 4) {
          this.scrollSelectedIntoViewWithRetry(selectedCardId, attempt + 1);
        }
      },
      attempt === 0 ? 0 : 16,
    );
  }
}
